use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static FALLBACK_COUNTER: AtomicU64 = AtomicU64::new(0);

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WriteEnvResult {
    backup_path: Option<String>,
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

fn validate_env_path(raw_path: &str, project_root: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path.trim());

    let canonical = std::fs::canonicalize(&path)
        .map_err(|e| format!("Cannot resolve path: {}", e))?;

    if !canonical.is_file() {
        return Err("Target path is not a file".to_string());
    }

    // Ensure it's an env file by name
    let file_name = canonical
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    if !file_name.starts_with(".env") {
        return Err("Target path is not an .env file".to_string());
    }

    // Confine writes to the registered project directory
    let root = PathBuf::from(project_root.trim());
    let canonical_root = std::fs::canonicalize(&root)
        .map_err(|e| format!("Cannot resolve project root: {}", e))?;

    if !canonical.starts_with(&canonical_root) {
        return Err(
            "Path traversal denied: target path is outside the project directory".to_string(),
        );
    }

    Ok(canonical)
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
    project_root: String,
    entries: Vec<MissingEntry>,
    create_backup: bool,
) -> Result<PatchResult, String> {
    let path = validate_env_path(&target_path, &project_root)?;

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

    let line_ending = detect_line_ending(&original);
    let mut lines: Vec<String> = split_lines_preserving(&original)
        .into_iter()
        .map(|s| s.to_string())
        .collect();

    // Separate entries into those that match a group and those that go at the end
    let mut ungrouped: Vec<(String, String)> = Vec::new();

    for (key, value) in &append_entries {
        let lines_as_refs: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();
        let group_idx = find_group_insertion_index(&lines_as_refs, key);

        if let Some(insert_at) = group_idx {
            let new_line = format!(
                "{}={}{}",
                key,
                format_env_value(value),
                line_ending
            );
            lines.insert(insert_at, new_line);
        } else {
            ungrouped.push((key.clone(), value.clone()));
        }
    }

    // Append ungrouped entries at the end with a comment header
    if !ungrouped.is_empty() {
        let has_trailing_newline = lines
            .last()
            .map(|l| {
                let stripped = l.trim_end_matches('\n').trim_end_matches('\r');
                stripped.is_empty()
            })
            .unwrap_or(true);

        // Ensure file content ends with a line ending before appending
        if !lines.is_empty() {
            let last_idx = lines.len() - 1;
            if !lines[last_idx].ends_with('\n') {
                lines[last_idx].push_str(line_ending);
            }
        }

        if !has_trailing_newline {
            // No blank line at end — don't add extra separator, just the comment
        }

        lines.push(format!("# Added by Drift at {}{}", unix_timestamp(), line_ending));

        for (key, value) in &ungrouped {
            lines.push(format!(
                "{}={}{}",
                key,
                format_env_value(value),
                line_ending
            ));
        }
    }

    let updated: String = lines.concat();

    atomic_write(&path, &updated)?;

    let backup_path = if create_backup {
        let timestamp = unix_timestamp();
        let backup_file = format!("{}.bak.{}", path.to_string_lossy(), timestamp);
        fs::write(&backup_file, &original)
            .map_err(|error| format!("Failed to write backup file: {}", error))?;
        Some(backup_file)
    } else {
        None
    };

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
    project_root: String,
    key: String,
    value: String,
    create_backup: bool,
) -> Result<UpsertResult, String> {
    let normalized_key = key.trim().to_string();

    if normalized_key.is_empty() || !is_valid_env_key(&normalized_key) {
        return Err("Invalid env key".to_string());
    }

    let path = validate_env_path(&target_path, &project_root)?;

    let original = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read target env file: {}", error))?;

    let line_ending = detect_line_ending(&original);
    let mut lines: Vec<String> = split_lines_preserving(&original)
        .into_iter()
        .map(|s| s.to_string())
        .collect();

    // Find the last occurrence to match standard env precedence
    let mut last_match: Option<usize> = None;
    for (i, line) in lines.iter().enumerate() {
        let stripped = line.trim_end_matches('\n').trim_end_matches('\r');
        if let Some(found_key) = parse_env_key_from_line(stripped) {
            if found_key == normalized_key {
                last_match = Some(i);
            }
        }
    }

    let mut matched_count = 0usize;
    if let Some(idx) = last_match {
        // Preserve the line ending from the original line
        let orig_line = &lines[idx];
        let trailing = if orig_line.ends_with("\r\n") {
            "\r\n"
        } else if orig_line.ends_with('\n') {
            "\n"
        } else {
            ""
        };
        let stripped = orig_line.trim_end_matches('\n').trim_end_matches('\r');
        let new_content = replace_line_value(stripped, &value);
        lines[idx] = format!("{}{}", new_content, trailing);
        matched_count = 1;
    }

    let mut appended = false;
    if matched_count == 0 {
        appended = true;

        // Try to find the correct service group for this key
        let lines_as_refs: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();
        let group_idx = find_group_insertion_index(&lines_as_refs, &normalized_key);

        let new_line = format!(
            "{}={}{}",
            normalized_key,
            format_env_value(&value),
            line_ending
        );

        if let Some(insert_at) = group_idx {
            // Insert within the group — no comment header needed
            lines.insert(insert_at, new_line);
        } else {
            // Append at the end with a blank-line separator and comment
            let has_trailing_newline = lines
                .last()
                .map(|l| {
                    let stripped = l.trim_end_matches('\n').trim_end_matches('\r');
                    stripped.is_empty()
                })
                .unwrap_or(true);

            if !lines.is_empty() && !has_trailing_newline {
                // Ensure the last line has a line ending before we add blank separator
                let last_idx = lines.len() - 1;
                if !lines[last_idx].ends_with('\n') {
                    lines[last_idx].push_str(line_ending);
                }
                lines.push(line_ending.to_string());
            }

            lines.push(format!("# Added by Drift at {}{}", unix_timestamp(), line_ending));
            lines.push(new_line);
        }
    }

    let updated: String = lines.concat();

    atomic_write(&path, &updated)?;

    let backup_path = if create_backup {
        let timestamp = unix_timestamp();
        let backup_file = format!("{}.bak.{}", path.to_string_lossy(), timestamp);
        fs::write(&backup_file, &original)
            .map_err(|error| format!("Failed to write backup file: {}", error))?;
        Some(backup_file)
    } else {
        None
    };

    Ok(UpsertResult {
        matched_count,
        appended,
        backup_path,
        updated_content: updated,
    })
}

#[tauri::command]
fn write_env_file(
    target_path: String,
    project_root: String,
    content: String,
    create_backup: bool,
) -> Result<WriteEnvResult, String> {
    const MAX_ENV_CONTENT_SIZE: usize = 5 * 1024 * 1024; // 5MB
    if content.len() > MAX_ENV_CONTENT_SIZE {
        return Err(format!(
            "Content exceeds maximum size of {} bytes",
            MAX_ENV_CONTENT_SIZE
        ));
    }

    let path = validate_env_path(&target_path, &project_root)?;

    let original = if create_backup {
        Some(
            fs::read_to_string(&path)
                .map_err(|error| format!("Failed to read target env file: {}", error))?,
        )
    } else {
        None
    };

    atomic_write(&path, &content)?;

    let backup_path = if let Some(original_content) = original {
        let timestamp = unix_timestamp();
        let backup_file = format!("{}.bak.{}", path.to_string_lossy(), timestamp);
        fs::write(&backup_file, &original_content)
            .map_err(|error| format!("Failed to write backup file: {}", error))?;
        Some(backup_file)
    } else {
        None
    };

    Ok(WriteEnvResult { backup_path })
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

    atomic_write(&backup_path, &content)?;

    Ok(ProjectBackupResult {
        backup_path: backup_path.to_string_lossy().to_string(),
        item_count: set_count,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupEntry {
    path: String,
    file_name: String,
    reason: String,
    timestamp: u64,
    size_bytes: u64,
    backup_type: String,
}

#[tauri::command]
fn list_project_backups(project_root: String) -> Result<Vec<BackupEntry>, String> {
    let root = PathBuf::from(project_root.trim());
    let mut entries: Vec<BackupEntry> = Vec::new();

    // Scan .drift-backups/ directory for JSON backups
    let backup_dir = root.join(".drift-backups");
    if backup_dir.exists() && backup_dir.is_dir() {
        if let Ok(dir_entries) = fs::read_dir(&backup_dir) {
            for entry in dir_entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with("drift-") && name.ends_with(".json") {
                            let metadata = fs::metadata(&path).ok();
                            let size = metadata.map(|m| m.len()).unwrap_or(0);
                            let (reason, timestamp) = parse_backup_filename(name);
                            entries.push(BackupEntry {
                                path: path.to_string_lossy().to_string(),
                                file_name: name.to_string(),
                                reason,
                                timestamp,
                                size_bytes: size,
                                backup_type: "json".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    // Scan for .bak.* files alongside env files
    collect_bak_files(&root, &mut entries, 0);

    // Sort newest first
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(entries)
}

fn parse_backup_filename(name: &str) -> (String, u64) {
    // Format: drift-{project}-{reason}-{timestamp}.json
    let without_ext = name.strip_suffix(".json").unwrap_or(name);
    let without_prefix = without_ext.strip_prefix("drift-").unwrap_or(without_ext);

    // Find the last numeric segment as timestamp
    let parts: Vec<&str> = without_prefix.rsplitn(2, '-').collect();
    let timestamp = parts.first().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let reason = parts.get(1).unwrap_or(&"unknown").to_string();

    (reason, timestamp)
}

fn collect_bak_files(dir: &Path, entries: &mut Vec<BackupEntry>, depth: usize) {
    if depth > 3 {
        return;
    }
    let Ok(dir_entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in dir_entries.flatten() {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }

        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if file_type.is_file() && name.contains(".bak.") {
                let metadata = entry.metadata().ok();
                let size = metadata.map(|m| m.len()).unwrap_or(0);
                let timestamp = name
                    .rsplit('.')
                    .next()
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);
                entries.push(BackupEntry {
                    path: path.to_string_lossy().to_string(),
                    file_name: name.to_string(),
                    reason: "file-backup".to_string(),
                    timestamp,
                    size_bytes: size,
                    backup_type: "bak".to_string(),
                });
            }
            if file_type.is_dir() && !should_skip_dir(name) {
                collect_bak_files(&path, entries, depth + 1);
            }
        }
    }
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

/// Detect whether a file's content uses CRLF or LF line endings.
/// Returns "\r\n" if the first line ending found is CRLF, otherwise "\n".
fn detect_line_ending(content: &str) -> &'static str {
    for (i, ch) in content.char_indices() {
        if ch == '\r' {
            if content.get(i + 1..i + 2) == Some("\n") {
                return "\r\n";
            }
        } else if ch == '\n' {
            return "\n";
        }
    }
    "\n"
}

/// Split content into lines preserving the original line endings.
/// Each returned string includes its trailing line ending (if any).
/// The last element may have no trailing line ending if the file
/// does not end with one.
fn split_lines_preserving(content: &str) -> Vec<&str> {
    let mut lines = Vec::new();
    let mut start = 0;
    let bytes = content.as_bytes();
    let len = bytes.len();

    let mut i = 0;
    while i < len {
        if bytes[i] == b'\n' {
            lines.push(&content[start..=i]);
            start = i + 1;
        } else if bytes[i] == b'\r' {
            if i + 1 < len && bytes[i + 1] == b'\n' {
                lines.push(&content[start..=i + 1]);
                start = i + 2;
                i += 1; // skip the \n
            } else {
                lines.push(&content[start..=i]);
                start = i + 1;
            }
        }
        i += 1;
    }

    // Remaining content after the last line ending (no trailing newline)
    if start < len {
        lines.push(&content[start..]);
    }

    lines
}

/// Extract the inline comment from an env line (the ` # ...` portion after the value).
/// Returns `None` if there is no inline comment.
/// This respects quoted values — a `#` inside quotes is not a comment.
fn extract_inline_comment(line: &str) -> Option<&str> {
    let trimmed = line.trim();

    // Find the `=` to skip past the key
    let eq_pos = trimmed.find('=')?;

    let after_eq = &trimmed[eq_pos + 1..];
    let after_eq_trimmed = after_eq.trim_start();

    if after_eq_trimmed.is_empty() {
        return None;
    }

    let quote_char = after_eq_trimmed.as_bytes()[0];
    if quote_char == b'"' || quote_char == b'\'' {
        // Walk past the quoted value
        let chars = after_eq_trimmed.char_indices().skip(1);
        let mut escaped = false;
        for (idx, ch) in chars {
            if escaped {
                escaped = false;
                continue;
            }
            if ch == '\\' && quote_char == b'"' {
                escaped = true;
                continue;
            }
            if ch as u8 == quote_char {
                // After closing quote, look for ` #` or `#`
                let remainder = &after_eq_trimmed[idx + 1..];
                let remainder_trimmed = remainder.trim_start();
                if remainder_trimmed.starts_with('#') {
                    // Find the `#` position in the original line
                    let comment_start = line.len() - remainder_trimmed.len();
                    return Some(line[comment_start..].trim_end());
                }
                return None;
            }
        }
        // Unterminated quote — no inline comment
        return None;
    }

    // Unquoted value — find ` #` pattern (space then hash)
    if let Some(pos) = after_eq.find(" #") {
        // pos points at the space; the `#` starts at pos + 1
        let hash_offset_in_trimmed = eq_pos + 1 + pos + 1;
        let leading_spaces = line.len() - line.trim_start().len();
        return Some(line[leading_spaces + hash_offset_in_trimmed..].trim_end());
    }

    None
}

/// Extract the prefix of an env key for grouping purposes.
/// e.g. "DB_HOST" -> "DB_", "MAIL_FROM_ADDRESS" -> "MAIL_", "APP_NAME" -> "APP_"
/// Returns `None` for keys with no underscore (e.g. "PORT").
fn extract_key_prefix(key: &str) -> Option<String> {
    if let Some(pos) = key.find('_') {
        if pos > 0 {
            return Some(key[..=pos].to_string());
        }
    }
    None
}

/// Replace only the value portion of an env line, preserving any inline comment
/// and the original key formatting (including `export` prefix and spacing).
fn replace_line_value(original_line: &str, new_value: &str) -> String {
    let trimmed = original_line.trim();

    // Find the = sign
    let eq_pos = match trimmed.find('=') {
        Some(pos) => pos,
        None => return original_line.to_string(),
    };

    // Preserve leading whitespace from the original line
    let leading = &original_line[..original_line.len() - original_line.trim_start().len()];

    // Everything before and including the `=`
    let key_part = &trimmed[..=eq_pos];

    // Get inline comment if present
    let inline_comment = extract_inline_comment(original_line);

    let formatted_value = format_env_value(new_value);

    match inline_comment {
        Some(comment) => format!("{}{}{} {}", leading, key_part, formatted_value, comment),
        None => format!("{}{}{}", leading, key_part, formatted_value),
    }
}

/// Find the best insertion index for a new key based on prefix grouping.
/// Scans lines for keys sharing the same prefix and returns the index
/// after the last such key. Returns `None` if no group match is found.
fn find_group_insertion_index(lines: &[&str], key: &str) -> Option<usize> {
    let prefix = extract_key_prefix(key)?;

    let mut last_group_line: Option<usize> = None;
    for (i, line) in lines.iter().enumerate() {
        let stripped = line.trim_end_matches('\n').trim_end_matches('\r');
        if let Some(found_key) = parse_env_key_from_line(stripped) {
            if let Some(found_prefix) = extract_key_prefix(&found_key) {
                if found_prefix == prefix {
                    last_group_line = Some(i);
                }
            }
        }
    }

    last_group_line.map(|idx| idx + 1)
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
            FALLBACK_COUNTER.fetch_add(1, Ordering::Relaxed)
        })
}

static WRITE_COUNTER: AtomicU64 = AtomicU64::new(0);

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let seq = WRITE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
    let tmp_path = path.with_file_name(format!(".{}.drift-tmp.{}.{}", file_name, pid, seq));
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupRotationResult {
    deleted_count: usize,
    deleted_paths: Vec<String>,
}

/// Rotate backup files for a given env file, keeping only the most recent `keep` backups.
#[tauri::command]
fn rotate_backups(
    env_file_path: String,
    keep: usize,
) -> Result<BackupRotationResult, String> {
    let path = PathBuf::from(env_file_path.trim());
    let parent = path
        .parent()
        .ok_or_else(|| "Cannot determine parent directory".to_string())?;

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Cannot determine file name".to_string())?;

    // Pattern: {file_name}.bak.{timestamp}
    let prefix = format!("{}.bak.", file_name);

    let Ok(dir_entries) = fs::read_dir(parent) else {
        return Ok(BackupRotationResult {
            deleted_count: 0,
            deleted_paths: vec![],
        });
    };

    let mut backups: Vec<(PathBuf, u64)> = Vec::new();

    for entry in dir_entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_file() {
            continue;
        }
        let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.starts_with(&prefix) {
            continue;
        }
        let timestamp = name
            .strip_prefix(&prefix)
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);
        backups.push((entry_path, timestamp));
    }

    // Sort newest first
    backups.sort_by(|a, b| b.1.cmp(&a.1));

    let mut deleted_paths: Vec<String> = Vec::new();

    if backups.len() > keep {
        for (old_path, _) in &backups[keep..] {
            if fs::remove_file(old_path).is_ok() {
                deleted_paths.push(old_path.to_string_lossy().to_string());
            }
        }
    }

    Ok(BackupRotationResult {
        deleted_count: deleted_paths.len(),
        deleted_paths,
    })
}

/// Get the last modification time of a file as seconds since UNIX epoch.
#[tauri::command]
fn get_file_mtime(file_path: String) -> Result<u64, String> {
    let path = PathBuf::from(file_path.trim());
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    let modified = metadata
        .modified()
        .map_err(|e| format!("Failed to get modification time: {}", e))?;
    let duration = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("System time error: {}", e))?;
    Ok(duration.as_secs())
}

/// Write a .env.example file to the project root.
#[tauri::command]
fn write_env_example(
    project_root: String,
    content: String,
) -> Result<String, String> {
    let root = PathBuf::from(project_root.trim());
    if !root.exists() || !root.is_dir() {
        return Err("Project root does not exist or is not a directory".to_string());
    }

    let target = root.join(".env.example");
    atomic_write(&target, &content)?;
    Ok(target.to_string_lossy().to_string())
}

// ──────────────────────────────────────────────────────────────
// Feature: .env schema definition file support
// ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SchemaVariable {
    #[serde(rename = "type")]
    var_type: Option<String>,
    required: Option<bool>,
    #[serde(rename = "enum")]
    allowed_values: Option<Vec<String>>,
    pattern: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SchemaValidationIssue {
    key: String,
    message: String,
    severity: String,
    rule: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvSchemaResult {
    variables: HashMap<String, SchemaVariable>,
    validation_issues: Vec<SchemaValidationIssue>,
}

/// Read and parse a .env.schema.json file from the project root.
/// If the schema file does not exist, return an empty result (not an error).
#[tauri::command]
fn read_env_schema(project_root: String) -> Result<EnvSchemaResult, String> {
    let root = PathBuf::from(project_root.trim());
    let schema_path = root.join(".env.schema.json");

    if !schema_path.exists() || !schema_path.is_file() {
        return Ok(EnvSchemaResult {
            variables: HashMap::new(),
            validation_issues: Vec::new(),
        });
    }

    let content = fs::read_to_string(&schema_path)
        .map_err(|e| format!("Failed to read .env.schema.json: {}", e))?;

    let variables: HashMap<String, SchemaVariable> = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid .env.schema.json format: {}", e))?;

    Ok(EnvSchemaResult {
        variables,
        validation_issues: Vec::new(),
    })
}

/// Validate env values against a schema definition.
#[tauri::command]
fn validate_env_against_schema(
    values: HashMap<String, String>,
    schema: HashMap<String, SchemaVariable>,
) -> Result<Vec<SchemaValidationIssue>, String> {
    let mut issues = Vec::new();

    for (key, def) in &schema {
        let value = values.get(key);

        // Check required
        if def.required.unwrap_or(false) {
            match value {
                None => {
                    issues.push(SchemaValidationIssue {
                        key: key.clone(),
                        message: format!("{} is required but missing", key),
                        severity: "error".to_string(),
                        rule: "required".to_string(),
                    });
                    continue;
                }
                Some(v) if v.is_empty() => {
                    issues.push(SchemaValidationIssue {
                        key: key.clone(),
                        message: format!("{} is required but empty", key),
                        severity: "error".to_string(),
                        rule: "required".to_string(),
                    });
                    continue;
                }
                _ => {}
            }
        }

        let Some(val) = value else { continue };
        if val.is_empty() {
            continue;
        }

        // Check type
        if let Some(ref var_type) = def.var_type {
            let type_ok = match var_type.as_str() {
                "integer" => val.parse::<i64>().is_ok(),
                "boolean" => matches!(
                    val.to_lowercase().as_str(),
                    "true" | "false" | "1" | "0" | "yes" | "no" | "on" | "off"
                ),
                "url" => val.starts_with("http://") || val.starts_with("https://"),
                "email" => val.contains('@') && val.contains('.'),
                "string" => true,
                _ => true,
            };

            if !type_ok {
                issues.push(SchemaValidationIssue {
                    key: key.clone(),
                    message: format!("{} should be of type '{}', got '{}'", key, var_type, val),
                    severity: "warning".to_string(),
                    rule: "type".to_string(),
                });
            }
        }

        // Check enum
        if let Some(ref allowed) = def.allowed_values {
            if !allowed.iter().any(|a| a == val) {
                issues.push(SchemaValidationIssue {
                    key: key.clone(),
                    message: format!(
                        "{} has value '{}' which is not in allowed values: [{}]",
                        key,
                        val,
                        allowed.join(", ")
                    ),
                    severity: "warning".to_string(),
                    rule: "enum".to_string(),
                });
            }
        }

        // Check pattern
        if let Some(ref pattern) = def.pattern {
            // Simple regex-like matching using contains for safety
            // Full regex would require the regex crate
            let pattern_matches = if pattern.starts_with('^') && pattern.ends_with('$') {
                // Exact match patterns — strip anchors and compare
                let inner = &pattern[1..pattern.len() - 1];
                val == inner
            } else {
                val.contains(pattern.as_str())
            };

            if !pattern_matches {
                issues.push(SchemaValidationIssue {
                    key: key.clone(),
                    message: format!("{} does not match pattern '{}'", key, pattern),
                    severity: "warning".to_string(),
                    rule: "pattern".to_string(),
                });
            }
        }
    }

    // Sort issues: errors first, then warnings
    issues.sort_by(|a, b| {
        let a_priority = if a.severity == "error" { 0 } else { 1 };
        let b_priority = if b.severity == "error" { 0 } else { 1 };
        a_priority.cmp(&b_priority).then(a.key.cmp(&b.key))
    });

    Ok(issues)
}

/// Generate a schema definition from the current env values (type inference).
#[tauri::command]
fn generate_env_schema(
    values: HashMap<String, String>,
) -> Result<String, String> {
    let mut schema: HashMap<String, SchemaVariable> = HashMap::new();

    for (key, val) in &values {
        let inferred_type = if val.parse::<i64>().is_ok() {
            "integer"
        } else if matches!(
            val.to_lowercase().as_str(),
            "true" | "false" | "1" | "0" | "yes" | "no" | "on" | "off"
        ) {
            "boolean"
        } else if val.starts_with("http://") || val.starts_with("https://") {
            "url"
        } else if val.contains('@') && val.contains('.') && !val.contains(' ') {
            "email"
        } else {
            "string"
        };

        schema.insert(
            key.clone(),
            SchemaVariable {
                var_type: Some(inferred_type.to_string()),
                required: Some(!val.is_empty()),
                allowed_values: None,
                pattern: None,
                description: None,
            },
        );
    }

    serde_json::to_string_pretty(&schema)
        .map_err(|e| format!("Failed to serialise schema: {}", e))
}

/// Write a generated schema to .env.schema.json in the project root.
#[tauri::command]
fn write_env_schema(
    project_root: String,
    content: String,
) -> Result<String, String> {
    let root = PathBuf::from(project_root.trim());
    if !root.exists() || !root.is_dir() {
        return Err("Project root does not exist or is not a directory".to_string());
    }

    let target = root.join(".env.schema.json");
    atomic_write(&target, &content)?;
    Ok(target.to_string_lossy().to_string())
}

// ──────────────────────────────────────────────────────────────
// Feature: Git-tracked .env change detection
// ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitEnvStatus {
    file_path: String,
    relative_path: String,
    is_tracked: bool,
    has_uncommitted_changes: bool,
}

/// Check git status for env files in a project, reporting which tracked files
/// have uncommitted modifications.
#[tauri::command]
fn check_env_git_status(project_root: String) -> Result<Vec<GitEnvStatus>, String> {
    let root = PathBuf::from(project_root.trim());
    if !root.exists() || !root.is_dir() {
        return Err("Project root does not exist or is not a directory".to_string());
    }

    // Check if this is a git repository
    let git_dir = root.join(".git");
    if !git_dir.exists() {
        return Ok(Vec::new());
    }

    // Get list of modified files (both staged and unstaged) using git diff
    let output = Command::new("git")
        .args(["diff", "--name-only", "HEAD"])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    let modified_files: HashSet<String> = if output.status.success() {
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|l| l.to_string())
            .collect()
    } else {
        HashSet::new()
    };

    // Also check for staged changes
    let staged_output = Command::new("git")
        .args(["diff", "--name-only", "--cached"])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Failed to run git diff --cached: {}", e))?;

    let staged_files: HashSet<String> = if staged_output.status.success() {
        String::from_utf8_lossy(&staged_output.stdout)
            .lines()
            .map(|l| l.to_string())
            .collect()
    } else {
        HashSet::new()
    };

    // Get list of tracked files
    let tracked_output = Command::new("git")
        .args(["ls-files"])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Failed to run git ls-files: {}", e))?;

    let tracked_files: HashSet<String> = if tracked_output.status.success() {
        String::from_utf8_lossy(&tracked_output.stdout)
            .lines()
            .map(|l| l.to_string())
            .collect()
    } else {
        HashSet::new()
    };

    // Find env files that are tracked by git
    let mut results = Vec::new();
    for tracked in &tracked_files {
        let file_name = Path::new(tracked)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        if !is_env_file(file_name) {
            continue;
        }

        let full_path = root.join(tracked);
        if !full_path.exists() {
            continue;
        }

        let has_changes = modified_files.contains(tracked) || staged_files.contains(tracked);

        results.push(GitEnvStatus {
            file_path: full_path.to_string_lossy().to_string(),
            relative_path: tracked.clone(),
            is_tracked: true,
            has_uncommitted_changes: has_changes,
        });
    }

    Ok(results)
}

// ──────────────────────────────────────────────────────────────
// Feature: Multi-project env file caching (mtime check)
// ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileMtimeEntry {
    path: String,
    mtime: u64,
    size: u64,
}

/// Get modification times for all env files in a project for cache validation.
#[tauri::command]
fn get_env_file_mtimes(project_root: String) -> Result<Vec<FileMtimeEntry>, String> {
    let root = PathBuf::from(project_root.trim());
    if !root.exists() || !root.is_dir() {
        return Err("Project root does not exist or is not a directory".to_string());
    }

    let mut entries = Vec::new();
    collect_env_mtimes(&root, &root, &mut entries, 0);
    Ok(entries)
}

fn collect_env_mtimes(
    current: &Path,
    _root: &Path,
    entries: &mut Vec<FileMtimeEntry>,
    depth: usize,
) {
    if depth > 8 {
        return;
    }

    let Ok(dir_entries) = fs::read_dir(current) else {
        return;
    };

    for entry in dir_entries.flatten() {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if file_type.is_symlink() {
            continue;
        }

        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        if file_type.is_dir() {
            if should_skip_dir(&file_name) {
                continue;
            }
            collect_env_mtimes(&path, _root, entries, depth + 1);
            continue;
        }

        if !file_type.is_file() || !is_env_file(&file_name) {
            continue;
        }

        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };

        let mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        entries.push(FileMtimeEntry {
            path: path.to_string_lossy().to_string(),
            mtime,
            size: metadata.len(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn create_temp_project() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let env_path = dir.path().join(".env");
        fs::write(&env_path, "APP_NAME=Test\n").unwrap();
        (dir, env_path)
    }

    #[test]
    fn validate_env_path_accepts_file_within_project() {
        let (dir, env_path) = create_temp_project();
        let result = validate_env_path(
            env_path.to_str().unwrap(),
            dir.path().to_str().unwrap(),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn validate_env_path_rejects_traversal() {
        let (dir, _env_path) = create_temp_project();

        // Create a .env file outside the project
        let outside_dir = tempfile::tempdir().unwrap();
        let outside_env = outside_dir.path().join(".env");
        fs::write(&outside_env, "SECRET=value\n").unwrap();

        let result = validate_env_path(
            outside_env.to_str().unwrap(),
            dir.path().to_str().unwrap(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Path traversal denied"));
    }

    #[test]
    fn validate_env_path_rejects_dotdot_traversal() {
        let (dir, _env_path) = create_temp_project();

        // Create a sibling directory with a .env file
        let sibling_dir = dir.path().parent().unwrap().join("sibling-project");
        fs::create_dir_all(&sibling_dir).unwrap();
        let sibling_env = sibling_dir.join(".env");
        fs::write(&sibling_env, "LEAKED=true\n").unwrap();

        // Attempt traversal via ../sibling-project/.env
        let traversal_path = dir.path().join("..").join("sibling-project").join(".env");
        let result = validate_env_path(
            traversal_path.to_str().unwrap(),
            dir.path().to_str().unwrap(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Path traversal denied"));

        // Clean up sibling
        let _ = fs::remove_dir_all(&sibling_dir);
    }

    #[test]
    fn validate_env_path_rejects_symlink_escape() {
        let (dir, _env_path) = create_temp_project();

        // Create a target outside the project
        let outside_dir = tempfile::tempdir().unwrap();
        let outside_env = outside_dir.path().join(".env.secret");
        fs::write(&outside_env, "LEAKED=true\n").unwrap();

        // Create a symlink inside the project pointing outside
        let symlink_path = dir.path().join(".env.link");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside_env, &symlink_path).unwrap();

        #[cfg(unix)]
        {
            let result = validate_env_path(
                symlink_path.to_str().unwrap(),
                dir.path().to_str().unwrap(),
            );
            assert!(result.is_err());
            assert!(result.unwrap_err().contains("Path traversal denied"));
        }
    }

    #[test]
    fn validate_env_path_rejects_non_env_file() {
        let dir = tempfile::tempdir().unwrap();
        let non_env = dir.path().join("config.json");
        fs::write(&non_env, "{}").unwrap();

        let result = validate_env_path(
            non_env.to_str().unwrap(),
            dir.path().to_str().unwrap(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not an .env file"));
    }

    #[test]
    fn parse_env_keys_extracts_valid_keys() {
        let content = "APP_NAME=Test\nDB_HOST=localhost\n# comment\n\nCACHE_DRIVER=redis\n";
        let keys = parse_env_keys(content);
        assert!(keys.contains("APP_NAME"));
        assert!(keys.contains("DB_HOST"));
        assert!(keys.contains("CACHE_DRIVER"));
        assert_eq!(keys.len(), 3);
    }

    #[test]
    fn parse_env_keys_handles_export_prefix() {
        let content = "export DB_HOST=localhost\nexport APP_KEY=base64:abc\n";
        let keys = parse_env_keys(content);
        assert!(keys.contains("DB_HOST"));
        assert!(keys.contains("APP_KEY"));
        assert_eq!(keys.len(), 2);
    }

    #[test]
    fn parse_env_keys_skips_comments_and_blanks() {
        let content = "# DB_HOST=old\n\n  \n APP_NAME=Test\n";
        let keys = parse_env_keys(content);
        assert!(!keys.contains("DB_HOST")); // commented out
        assert!(keys.contains("APP_NAME"));
        assert_eq!(keys.len(), 1);
    }

    #[test]
    fn parse_env_keys_handles_windows_line_endings() {
        let content = "APP_NAME=Test\r\nDB_HOST=localhost\r\n";
        let keys = parse_env_keys(content);
        assert!(keys.contains("APP_NAME"));
        assert!(keys.contains("DB_HOST"));
        assert_eq!(keys.len(), 2);
    }

    #[test]
    fn append_skips_existing_keys() {
        let (dir, env_path) = create_temp_project();
        fs::write(&env_path, "APP_NAME=Test\nDB_HOST=localhost\n").unwrap();

        let entries = vec![
            MissingEntry { key: "DB_HOST".into(), value: "prod".into() },
            MissingEntry { key: "CACHE_DRIVER".into(), value: "redis".into() },
        ];

        let result = append_missing_env_keys(
            env_path.to_str().unwrap().to_string(),
            dir.path().to_str().unwrap().to_string(),
            entries,
            false,
        ).unwrap();

        assert_eq!(result.appended_count, 1);
        assert_eq!(result.skipped_existing, 1);
        assert!(result.updated_content.contains("CACHE_DRIVER=redis"));
        // DB_HOST should appear only once (the original)
        let db_host_count = result.updated_content.matches("DB_HOST").count();
        assert_eq!(db_host_count, 1);
    }

    #[test]
    fn append_deduplicates_within_entries() {
        let (dir, env_path) = create_temp_project();
        fs::write(&env_path, "APP_NAME=Test\n").unwrap();

        let entries = vec![
            MissingEntry { key: "NEW_KEY".into(), value: "first".into() },
            MissingEntry { key: "NEW_KEY".into(), value: "second".into() },
        ];

        let result = append_missing_env_keys(
            env_path.to_str().unwrap().to_string(),
            dir.path().to_str().unwrap().to_string(),
            entries,
            false,
        ).unwrap();

        assert_eq!(result.appended_count, 1);
        assert_eq!(result.skipped_existing, 1);
        // Only the first occurrence should be appended
        assert!(result.updated_content.contains("NEW_KEY=first"));
        assert!(!result.updated_content.contains("NEW_KEY=second"));
    }

    #[test]
    fn append_returns_unchanged_when_all_exist() {
        let (dir, env_path) = create_temp_project();
        let original = "APP_NAME=Test\nDB_HOST=localhost\n";
        fs::write(&env_path, original).unwrap();

        let entries = vec![
            MissingEntry { key: "APP_NAME".into(), value: "Other".into() },
            MissingEntry { key: "DB_HOST".into(), value: "prod".into() },
        ];

        let result = append_missing_env_keys(
            env_path.to_str().unwrap().to_string(),
            dir.path().to_str().unwrap().to_string(),
            entries,
            false,
        ).unwrap();

        assert_eq!(result.appended_count, 0);
        assert_eq!(result.skipped_existing, 2);
        assert_eq!(result.updated_content, original);
    }

    #[test]
    fn append_quotes_values_with_spaces() {
        let (dir, env_path) = create_temp_project();
        fs::write(&env_path, "APP_NAME=Test\n").unwrap();

        let entries = vec![
            MissingEntry { key: "APP_URL".into(), value: "my app name".into() },
        ];

        let result = append_missing_env_keys(
            env_path.to_str().unwrap().to_string(),
            dir.path().to_str().unwrap().to_string(),
            entries,
            false,
        ).unwrap();

        assert!(result.updated_content.contains("APP_URL=\"my app name\""));
    }

    #[test]
    fn append_quotes_values_with_hash() {
        let (dir, env_path) = create_temp_project();
        fs::write(&env_path, "APP_NAME=Test\n").unwrap();

        let entries = vec![
            MissingEntry { key: "SECRET".into(), value: "abc#def".into() },
        ];

        let result = append_missing_env_keys(
            env_path.to_str().unwrap().to_string(),
            dir.path().to_str().unwrap().to_string(),
            entries,
            false,
        ).unwrap();

        assert!(result.updated_content.contains("SECRET=\"abc#def\""));
    }

    #[test]
    fn atomic_write_produces_unique_temp_paths() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join(".env");
        fs::write(&target, "initial").unwrap();

        // Run multiple writes — they should not clash
        for i in 0..10 {
            atomic_write(&target, &format!("content-{}", i)).unwrap();
        }

        let final_content = fs::read_to_string(&target).unwrap();
        assert_eq!(final_content, "content-9");

        // No leftover temp files
        let leftover: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_str()
                    .map(|n| n.contains("drift-tmp"))
                    .unwrap_or(false)
            })
            .collect();
        assert!(leftover.is_empty(), "Temp files should be cleaned up");
    }

    // ── Format preservation tests ─────────────────────────────

    #[test]
    fn round_trip_lf_file_unchanged() {
        let content = "# Application\nAPP_NAME=Drift\nAPP_ENV=local\n\n# Database\nDB_HOST=127.0.0.1\nDB_PORT=3306\n";
        let lines = split_lines_preserving(content);
        let rejoined: String = lines.concat();
        assert_eq!(rejoined, content, "LF round-trip must be byte-identical");
    }

    #[test]
    fn round_trip_crlf_file_unchanged() {
        let content = "# Application\r\nAPP_NAME=Drift\r\nAPP_ENV=local\r\n\r\n# Database\r\nDB_HOST=127.0.0.1\r\nDB_PORT=3306\r\n";
        let lines = split_lines_preserving(content);
        let rejoined: String = lines.concat();
        assert_eq!(rejoined, content, "CRLF round-trip must be byte-identical");
    }

    #[test]
    fn round_trip_no_trailing_newline() {
        let content = "APP_NAME=Drift\nDB_HOST=localhost";
        let lines = split_lines_preserving(content);
        let rejoined: String = lines.concat();
        assert_eq!(rejoined, content, "File without trailing newline must round-trip");
    }

    #[test]
    fn detect_line_ending_crlf() {
        assert_eq!(detect_line_ending("FOO=bar\r\nBAZ=qux\r\n"), "\r\n");
    }

    #[test]
    fn detect_line_ending_lf() {
        assert_eq!(detect_line_ending("FOO=bar\nBAZ=qux\n"), "\n");
    }

    #[test]
    fn detect_line_ending_no_newlines() {
        assert_eq!(detect_line_ending("FOO=bar"), "\n");
    }

    #[test]
    fn extract_inline_comment_unquoted() {
        assert_eq!(
            extract_inline_comment("DB_HOST=localhost # primary database"),
            Some("# primary database")
        );
    }

    #[test]
    fn extract_inline_comment_quoted_value() {
        assert_eq!(
            extract_inline_comment("APP_NAME=\"My App\" # the app name"),
            Some("# the app name")
        );
    }

    #[test]
    fn extract_inline_comment_hash_inside_quotes() {
        assert_eq!(
            extract_inline_comment("SECRET=\"abc#def\""),
            None
        );
    }

    #[test]
    fn extract_inline_comment_no_comment() {
        assert_eq!(extract_inline_comment("DB_PORT=3306"), None);
    }

    #[test]
    fn replace_line_value_preserves_inline_comment() {
        let original = "DB_HOST=localhost # primary database";
        let result = replace_line_value(original, "prod-db.example.com");
        assert_eq!(result, "DB_HOST=prod-db.example.com # primary database");
    }

    #[test]
    fn replace_line_value_no_comment() {
        let original = "DB_PORT=3306";
        let result = replace_line_value(original, "5432");
        assert_eq!(result, "DB_PORT=5432");
    }

    #[test]
    fn replace_line_value_preserves_export_prefix() {
        let original = "export DB_HOST=localhost # main db";
        let result = replace_line_value(original, "new-host");
        assert_eq!(result, "export DB_HOST=new-host # main db");
    }

    #[test]
    fn extract_key_prefix_returns_prefix() {
        assert_eq!(extract_key_prefix("DB_HOST"), Some("DB_".to_string()));
        assert_eq!(extract_key_prefix("MAIL_FROM_ADDRESS"), Some("MAIL_".to_string()));
        assert_eq!(extract_key_prefix("PORT"), None);
    }

    #[test]
    fn find_group_insertion_index_finds_group() {
        let lines = vec![
            "APP_NAME=Test\n",
            "APP_ENV=local\n",
            "\n",
            "DB_HOST=localhost\n",
            "DB_PORT=3306\n",
        ];
        // DB_PASSWORD should go after DB_PORT (index 4), so insert at 5
        assert_eq!(find_group_insertion_index(&lines, "DB_PASSWORD"), Some(5));
        // APP_KEY should go after APP_ENV (index 1), so insert at 2
        assert_eq!(find_group_insertion_index(&lines, "APP_KEY"), Some(2));
        // CACHE_DRIVER has no group match
        assert_eq!(find_group_insertion_index(&lines, "CACHE_DRIVER"), None);
    }

    #[test]
    fn upsert_preserves_inline_comment() {
        let (dir, env_path) = create_temp_project();
        fs::write(&env_path, "DB_HOST=localhost # primary database\nDB_PORT=3306\n").unwrap();

        let result = upsert_env_key(
            env_path.to_str().unwrap().to_string(),
            dir.path().to_str().unwrap().to_string(),
            "DB_HOST".to_string(),
            "prod-db.example.com".to_string(),
            false,
        ).unwrap();

        assert_eq!(result.matched_count, 1);
        assert!(!result.appended);
        assert!(
            result.updated_content.contains("DB_HOST=prod-db.example.com # primary database"),
            "Inline comment should be preserved. Got: {}",
            result.updated_content
        );
    }

    #[test]
    fn upsert_preserves_crlf_line_endings() {
        let (dir, env_path) = create_temp_project();
        let content = "APP_NAME=Test\r\nDB_HOST=localhost\r\n";
        fs::write(&env_path, content).unwrap();

        let result = upsert_env_key(
            env_path.to_str().unwrap().to_string(),
            dir.path().to_str().unwrap().to_string(),
            "DB_HOST".to_string(),
            "newhost".to_string(),
            false,
        ).unwrap();

        assert!(
            result.updated_content.contains("\r\n"),
            "CRLF line endings should be preserved"
        );
        assert!(
            !result.updated_content.contains("localhost"),
            "Old value should be replaced"
        );
    }

    #[test]
    fn upsert_appends_to_matching_group() {
        let (dir, env_path) = create_temp_project();
        fs::write(&env_path, "APP_NAME=Test\n\nDB_HOST=localhost\nDB_PORT=3306\n").unwrap();

        let result = upsert_env_key(
            env_path.to_str().unwrap().to_string(),
            dir.path().to_str().unwrap().to_string(),
            "DB_PASSWORD".to_string(),
            "secret".to_string(),
            false,
        ).unwrap();

        assert!(result.appended);
        // DB_PASSWORD should appear after DB_PORT, not at the very end with a comment
        let lines: Vec<&str> = result.updated_content.lines().collect();
        let db_port_idx = lines.iter().position(|l| l.starts_with("DB_PORT")).unwrap();
        let db_pass_idx = lines.iter().position(|l| l.starts_with("DB_PASSWORD")).unwrap();
        assert_eq!(
            db_pass_idx,
            db_port_idx + 1,
            "DB_PASSWORD should be inserted right after DB_PORT"
        );
        // Should not have "Added by Drift" comment when inserted into a group
        assert!(
            !result.updated_content.contains("Added by Drift"),
            "Group-inserted keys should not have the Drift comment"
        );
    }

    #[test]
    fn upsert_no_change_is_byte_identical() {
        let (dir, env_path) = create_temp_project();
        let content = "APP_NAME=Test\nDB_HOST=localhost\n";
        fs::write(&env_path, content).unwrap();

        let result = upsert_env_key(
            env_path.to_str().unwrap().to_string(),
            dir.path().to_str().unwrap().to_string(),
            "DB_HOST".to_string(),
            "localhost".to_string(),
            false,
        ).unwrap();

        assert_eq!(
            result.updated_content, content,
            "Upserting the same value should produce byte-identical output"
        );
    }

    #[test]
    fn round_trip_upsert_file_on_disk() {
        let (dir, env_path) = create_temp_project();
        let content = "# App config\nAPP_NAME=Drift\nAPP_ENV=local\n\n# Database\nDB_HOST=127.0.0.1\nDB_PORT=3306\n";
        fs::write(&env_path, content).unwrap();

        // Upsert the same value — file on disk should be identical
        let _ = upsert_env_key(
            env_path.to_str().unwrap().to_string(),
            dir.path().to_str().unwrap().to_string(),
            "APP_NAME".to_string(),
            "Drift".to_string(),
            false,
        ).unwrap();

        let on_disk = fs::read_to_string(&env_path).unwrap();
        assert_eq!(on_disk, content, "File on disk must be byte-identical after no-op upsert");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            scan_env_files,
            infer_project_name,
            append_missing_env_keys,
            upsert_env_key,
            write_env_file,
            write_project_backup,
            list_project_backups,
            rotate_backups,
            get_file_mtime,
            write_env_example,
            read_env_schema,
            validate_env_against_schema,
            generate_env_schema,
            write_env_schema,
            check_env_git_status,
            get_env_file_mtimes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
