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

    fs::write(&path, &updated).map_err(|error| format!("Failed to update target env file: {}", error))?;

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

    fs::write(&path, &updated).map_err(|error| format!("Failed to update target env file: {}", error))?;

    Ok(UpsertResult {
        matched_count,
        appended,
        backup_path,
        updated_content: updated,
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

        if path.is_dir() {
            if should_skip_dir(file_name) {
                continue;
            }
            collect_env_files(&path, root, files, depth + 1)?;
            continue;
        }

        if !path.is_file() || !is_env_file(file_name) {
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

    if value.contains(char::is_whitespace) || value.contains('#') {
        let escaped = value.replace('"', "\\\"");
        return format!("\"{}\"", escaped);
    }

    value.to_string()
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_env_files,
            append_missing_env_keys,
            upsert_env_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
