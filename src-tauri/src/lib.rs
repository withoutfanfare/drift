use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedEnvFile {
    path: String,
    name: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MissingEntry {
    key: String,
    value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PatchResult {
    appended_count: usize,
    skipped_existing: usize,
    backup_path: Option<String>,
    updated_content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpsertResult {
    matched_count: usize,
    appended: bool,
    backup_path: Option<String>,
    updated_content: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectBackupSet {
    name: String,
    role: String,
    source: String,
    file_path: Option<String>,
    raw_text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectBackupResult {
    backup_path: String,
    item_count: usize,
}

#[tauri::command]
fn scan_env_files(project_root: String) -> Result<Vec<ScannedEnvFile>, String> {
    let root = PathBuf::from(project_root.trim());

    if !root.exists() {
        return Err("Project path does not exist".to_string());
    }

    if !root.is_dir() {
        return Err("Project path is not a directory".to_string());
    }

    let mut files: Vec<ScannedEnvFile> = Vec::new();
    collect_env_files(&root, &root, &mut files, 0)?;
    files.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(files)
}

#[tauri::command]
fn infer_project_name(project_root: String) -> Result<String, String> {
    let trimmed = project_root.trim();
    if trimmed.is_empty() {
        return Err("Project path is required".to_string());
    }

    let root = PathBuf::from(trimmed);

    if !root.exists() {
        return Err("Project path does not exist".to_string());
    }

    if !root.is_dir() {
        return Err("Project path is not a directory".to_string());
    }

    if let Some(name) = infer_project_name_from_env(&root) {
        return Ok(name);
    }

    Ok(humanize_project_name_from_path(&root))
}

#[tauri::command]
fn append_missing_env_keys(
    target_path: String,
    entries: Vec<MissingEntry>,
    create_backup: bool,
) -> Result<PatchResult, String> {
    let path = PathBuf::from(target_path.trim());

    if !path.exists() {
        return Err("Target env file does not exist".to_string());
    }

    if !path.is_file() {
        return Err("Target path is not a file".to_string());
    }

    let original = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read target env file: {}", error))?;

    let mut existing_keys = parse_env_keys(&original);
    let mut append_entries: Vec<(String, String)> = Vec::new();
    let mut skipped_existing = 0usize;

    for entry in entries {
        let key = entry.key.trim().to_string();

        if !is_valid_env_key(&key) {
            continue;
        }

        if existing_keys.contains(&key) {
            skipped_existing += 1;
            continue;
        }

        existing_keys.insert(key.clone());
        append_entries.push((key, entry.value));
    }

    if append_entries.is_empty() {
        return Ok(PatchResult {
            appended_count: 0,
            skipped_existing,
            backup_path: None,
            updated_content: original,
        });
    }

    let backup_path = if create_backup {
        let timestamp = unix_timestamp();
        let backup_file = format!("{}.bak.{}", path.to_string_lossy(), timestamp);
        fs::write(&backup_file, &original)
            .map_err(|error| format!("Failed to write backup file: {}", error))?;
        Some(backup_file)
    } else {
        None
    };

    let mut updated = original.clone();
    if !updated.ends_with('\n') {
        updated.push('\n');
    }

    updated.push_str(&format!("# Added by Drift at {}\n", unix_timestamp()));

    for (key, value) in &append_entries {
        updated.push_str(&format!("{}={}\n", key, format_env_value(value)));
    }

    atomic_write(&path, &updated)?;

    Ok(PatchResult {
        appended_count: append_entries.len(),
        skipped_existing,
        backup_path,
        updated_content: updated,
    })
}

#[tauri::command]
fn upsert_env_key(
    target_path: String,
    key: String,
    value: String,
    create_backup: bool,
) -> Result<UpsertResult, String> {
    let path = PathBuf::from(target_path.trim());
    let normalized_key = key.trim().to_string();

    if normalized_key.is_empty() || !is_valid_env_key(&normalized_key) {
        return Err("Invalid env key".to_string());
    }

    if !path.exists() {
        return Err("Target env file does not exist".to_string());
    }

    if !path.is_file() {
        return Err("Target path is not a file".to_string());
    }

    let original = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read target env file: {}", error))?;

    let mut matched_count = 0usize;
    let mut lines: Vec<String> = original.lines().map(|line| line.to_string()).collect();

    for line in &mut lines {
        let candidate = parse_env_key_from_line(line);
        if let Some(found_key) = candidate {
            if found_key == normalized_key {
                *line = format!("{}={}", normalized_key, format_env_value(&value));
                matched_count += 1;
            }
        }
    }

    let mut appended = false;
    if matched_count == 0 {
        appended = true;
        if !lines.is_empty() && !lines.last().map(|line| line.is_empty()).unwrap_or(false) {
            lines.push(String::new());
        }
        lines.push(format!("# Added by Drift at {}", unix_timestamp()));
        lines.push(format!("{}={}", normalized_key, format_env_value(&value)));
    }

    let mut updated = lines.join("\n");
    if original.ends_with('\n') || appended {
        updated.push('\n');
    }

    let backup_path = if create_backup {
        let timestamp = unix_timestamp();
        let backup_file = format!("{}.bak.{}", path.to_string_lossy(), timestamp);
        fs::write(&backup_file, &original)
            .map_err(|error| format!("Failed to write backup file: {}", error))?;
        Some(backup_file)
    } else {
        None
    };

    atomic_write(&path, &updated)?;

    Ok(UpsertResult {
        matched_count,
        appended,
        backup_path,
        updated_content: updated,
    })
}

#[tauri::command]
fn write_project_backup(
    project_name: String,
    project_root: String,
    reason: String,
    sets: Vec<ProjectBackupSet>,
) -> Result<ProjectBackupResult, String> {
    let root = PathBuf::from(project_root.trim());
    let backup_dir = if root.exists() && root.is_dir() {
        root.join(".drift-backups")
    } else {
        std::env::temp_dir().join("drift-backups")
    };

    fs::create_dir_all(&backup_dir)
        .map_err(|error| format!("Failed to create backup directory: {}", error))?;

    let timestamp = unix_timestamp();
    let filename = format!(
        "drift-{}-{}-{}.json",
        sanitize_filename(&project_name),
        sanitize_filename(&reason),
        timestamp
    );
    let backup_path = backup_dir.join(filename);

    let set_count = sets.len();
    let payload = serde_json::json!({
        "generatedAt": timestamp,
        "projectName": project_name,
        "projectRoot": project_root,
        "reason": reason,
        "setCount": set_count,
        "sets": sets,
    });

    let content = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize backup payload: {}", error))?;

    fs::write(&backup_path, content)
        .map_err(|error| format!("Failed to write backup file: {}", error))?;

    Ok(ProjectBackupResult {
        backup_path: backup_path.to_string_lossy().to_string(),
        item_count: set_count,
    })
}

fn collect_env_files(
    current: &Path,
    root: &Path,
    files: &mut Vec<ScannedEnvFile>,
    depth: usize,
) -> Result<(), String> {
    if depth > 8 {
        return Ok(());
    }

    let entries = fs::read_dir(current)
        .map_err(|error| format!("Failed to scan {}: {}", current.display(), error))?;

    for entry_result in entries {
        let entry = match entry_result {
            Ok(value) => value,
            Err(_) => continue,
        };

        let path = entry.path();
        let file_name = match path.file_name().and_then(|value| value.to_str()) {
            Some(value) => value,
            None => continue,
        };

        // Skip symlinks to prevent traversal outside the project tree
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            if should_skip_dir(file_name) {
                continue;
            }
            collect_env_files(&path, root, files, depth + 1)?;
            continue;
        }

        if !file_type.is_file() || !is_env_file(file_name) {
            continue;
        }

        let metadata = match fs::metadata(&path) {
            Ok(value) => value,
            Err(_) => continue,
        };

        if metadata.len() > 1_500_000 {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        files.push(ScannedEnvFile {
            path: path.to_string_lossy().to_string(),
            name: relative,
            content,
        });
    }

    Ok(())
}

fn infer_project_name_from_env(root: &Path) -> Option<String> {
    let env_path = root.join(".env");
    if !env_path.exists() || !env_path.is_file() {
        return None;
    }

    let content = fs::read_to_string(env_path).ok()?;
    parse_named_env_value(&content, "APP_NAME")
}

fn parse_named_env_value(content: &str, target_key: &str) -> Option<String> {
    for raw_line in content.lines() {
        let line = raw_line.trim();

        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let without_export = line.strip_prefix("export ").unwrap_or(line).trim();
        let Some(eq_index) = without_export.find('=') else {
            continue;
        };

        if eq_index == 0 {
            continue;
        }

        let key = without_export[..eq_index].trim();
        if key != target_key {
            continue;
        }

        let raw_value = without_export[eq_index + 1..].trim();
        let value = parse_env_value(raw_value);
        if !value.is_empty() {
            return Some(value);
        }
    }

    None
}

fn parse_env_value(raw: &str) -> String {
    let mut value = raw.trim();

    if value.is_empty() {
        return String::new();
    }

    if value.starts_with('"') && value.ends_with('"') && value.len() >= 2 {
        value = &value[1..value.len() - 1];
        return value.replace("\\\"", "\"").trim().to_string();
    }

    if value.starts_with('\'') && value.ends_with('\'') && value.len() >= 2 {
        value = &value[1..value.len() - 1];
        return value.replace("\\'", "'").trim().to_string();
    }

    if let Some(comment_start) = value.find(" #") {
        value = value[..comment_start].trim();
    }

    value.to_string()
}

fn humanize_project_name_from_path(root: &Path) -> String {
    let fallback = root
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.trim())
        .filter(|name| !name.is_empty())
        .unwrap_or("Project");

    let mut words = Vec::new();
    for part in fallback.split(|ch: char| !ch.is_ascii_alphanumeric()) {
        if part.is_empty() {
            continue;
        }
        let mut chars = part.chars();
        if let Some(first) = chars.next() {
            words.push(format!("{}{}", first.to_ascii_uppercase(), chars.as_str()));
        }
    }

    if words.is_empty() {
        "Project".to_string()
    } else {
        words.join(" ")
    }
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | "vendor"
            | "target"
            | "dist"
            | "coverage"
            | ".next"
            | ".idea"
            | ".vscode"
            | "storage"
    )
}

fn is_env_file(name: &str) -> bool {
    name.starts_with(".env")
}

fn parse_env_keys(content: &str) -> HashSet<String> {
    let mut keys = HashSet::new();

    for raw_line in content.lines() {
        let line = raw_line.trim();

        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let without_export = line.strip_prefix("export ").unwrap_or(line).trim();
        let Some(eq_index) = without_export.find('=') else {
            continue;
        };

        if eq_index == 0 {
            continue;
        }

        let key = without_export[..eq_index].trim();
        if is_valid_env_key(key) {
            keys.insert(key.to_string());
        }
    }

    keys
}

fn parse_env_key_from_line(raw_line: &str) -> Option<String> {
    let line = raw_line.trim();

    if line.is_empty() || line.starts_with('#') {
        return None;
    }

    let without_export = line.strip_prefix("export ").unwrap_or(line).trim();
    let eq_index = without_export.find('=')?;

    if eq_index == 0 {
        return None;
    }

    let key = without_export[..eq_index].trim();

    if is_valid_env_key(key) {
        Some(key.to_string())
    } else {
        None
    }
}

fn is_valid_env_key(key: &str) -> bool {
    if key.is_empty() {
        return false;
    }

    key.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

fn format_env_value(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }

    // Strip newlines and carriage returns that would corrupt .env format
    let sanitised: String = value.chars().filter(|&ch| ch != '\n' && ch != '\r').collect();

    if sanitised.contains(char::is_whitespace) || sanitised.contains('#') {
        let escaped = sanitised.replace('"', "\\\"");
        return format!("\"{}\"", escaped);
    }

    sanitised
}

fn sanitize_filename(input: &str) -> String {
    let mut out = String::with_capacity(input.len());

    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('-');
        }
    }

    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        "backup".to_string()
    } else {
        trimmed.to_string()
    }
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_else(|_| {
            eprintln!("Warning: system clock before UNIX epoch, using fallback timestamp");
            std::process::id() as u64
        })
}

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let tmp_path = path.with_extension("drift-tmp");
    fs::write(&tmp_path, content)
        .map_err(|error| format!("Failed to write temporary file: {}", error))?;
    fs::rename(&tmp_path, path)
        .map_err(|error| {
            // Clean up temp file on rename failure
            let _ = fs::remove_file(&tmp_path);
            format!("Failed to rename temporary file: {}", error)
        })?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_env_files,
            infer_project_name,
            append_missing_env_keys,
            upsert_env_key,
            write_project_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
