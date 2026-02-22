# Rust Backend Security and Correctness Audit

**File audited**: `src-tauri/src/lib.rs`
**Lines**: 763
**Commands exposed**: `scan_env_files`, `infer_project_name`, `append_missing_env_keys`, `upsert_env_key`, `write_env_file`, `write_project_backup`, `list_project_backups`

---

## Summary

The Rust backend is reasonably well-structured for a desktop app. No `unwrap()` calls exist in the command path (only one benign `.expect()` in `run()`), no OS command execution is performed, and symlink following is explicitly blocked in `collect_env_files`. However, several medium-to-high issues were found relating to path confinement, TOCTOU races, backup file placement, the DoS-amplifying combination of no limit on `entries` count, and subtle parsing edge cases. No critical security vulnerabilities were found.

---

## [HIGH] Finding 1: No path confinement on write commands — any file on disk can be overwritten

**File**: `src-tauri/src/lib.rs:259` (`write_env_file`), `:107` (`append_missing_env_keys`), `:186` (`upsert_env_key`)
**Category**: security
**Description**: All three write commands accept a `target_path` string from the frontend and construct a `PathBuf` from it without canonicalising or confining the path to an allowed directory. The only guards are that the path must already exist and be a file. A crafted call with `target_path = "/etc/passwd"` or `target_path = "/Users/victim/Documents/secret.txt"` would pass both checks and overwrite arbitrary files on the system.

Tauri's IPC is reachable from the WebView. If the WebView is ever compromised (malicious JS injected via an XSS in rendered env file content, or a supply-chain attack in a dev dependency), an attacker can invoke these commands directly.

**Impact**: Arbitrary file write anywhere the OS user has write permission. A specially crafted env value containing newlines in a `.env` file could poison rendered output, though the `format_env_value` function strips newlines — that defence is only relevant for the append/upsert paths, not `write_env_file` which writes raw `content`.

**Recommendation**: Canonicalise the requested path with `std::fs::canonicalize()` and verify it shares a prefix with an allowed base path (the project root stored on the frontend, or the app data directory). Example pattern:

```rust
let canonical = std::fs::canonicalize(&path)
    .map_err(|e| format!("Cannot resolve path: {}", e))?;
let allowed_root = std::fs::canonicalize(&allowed_base)
    .map_err(|e| format!("Cannot resolve base: {}", e))?;
if !canonical.starts_with(&allowed_root) {
    return Err("Path is outside the allowed project directory".to_string());
}
```

---

## [HIGH] Finding 2: TOCTOU race on all write operations (exists-check then write)

**File**: `src-tauri/src/lib.rs:114-119` (`append_missing_env_keys`), `:199-204` (`upsert_env_key`), `:266-272` (`write_env_file`)
**Category**: security
**Description**: Every write command first checks `path.exists()` and `path.is_file()`, then opens the file separately. Between the existence check and the actual write, the path could be:
- Replaced with a symlink to a sensitive file
- Replaced with a directory
- Deleted and recreated elsewhere

This is a classic TOCTOU (time-of-check/time-of-use) race condition. On macOS, the window is small but not zero, particularly for automated tooling running concurrently.

**Impact**: On a multi-user or automated system an attacker process could race the check to redirect the write to an unintended target.

**Recommendation**: Open the file using `OpenOptions` with `write(true).truncate(false)` (or use the file descriptor directly) and check the file type via `fstat` on the already-open descriptor rather than relying on separate `exists()` / `is_file()` calls. For the atomic write helper, the `rename` approach already reduces the window, but the initial validation is still racy.

---

## [HIGH] Finding 3: `write_env_file` writes arbitrary raw content without validation

**File**: `src-tauri/src/lib.rs:259-289`
**Category**: security
**Description**: Unlike `append_missing_env_keys` and `upsert_env_key`, the `write_env_file` command writes the `content` parameter verbatim to disk with no parsing, no key validation, and no sanitisation. It accepts unlimited-size content. The other commands sanitise values through `format_env_value` (which strips newlines and wraps whitespace in quotes), but `write_env_file` applies none of that.

**Impact**:
1. An attacker who can call this command can write arbitrary bytes to any writable file (combining with Finding 1).
2. There is no content-size limit. A 500 MB string would be serialised in memory by Tauri's IPC layer and then written to disk.

**Recommendation**: Add a maximum content size check (e.g. 5 MB, matching a generous real-world env file ceiling). Consider running the content through `parse_env_keys` as a validation sanity check before writing, though this would change semantics. At minimum, document that this command is a full-trust write path.

---

## [MEDIUM] Finding 4: Backup files are placed alongside env files (path manipulation possible)

**File**: `src-tauri/src/lib.rs:154-162` (`append_missing_env_keys`), `:238-246` (`upsert_env_key`), `:274-284` (`write_env_file`)
**Category**: security
**Description**: The backup file path is constructed by appending `.bak.<timestamp>` to the env file's full path string:

```rust
let backup_file = format!("{}.bak.{}", path.to_string_lossy(), timestamp);
```

If the `target_path` passed by the caller contains characters that make the resulting backup path land outside the project tree — for example a path ending in `../../sensitive` — the backup is written to an unintended location. This is a secondary concern relative to Finding 1 (if path confinement is added to the base path, backup paths derived from it will be confined too), but it should be noted as a separate write point.

Additionally, `to_string_lossy()` is used on the path. On Windows with non-UTF-8 paths this inserts replacement characters, potentially creating a different backup path than intended (though this is macOS-only for now).

**Recommendation**: Derive the backup path from the parent directory and filename separately using `path.parent()` and `path.file_name()` to avoid string concatenation with an unvalidated source:

```rust
let backup_name = format!(
    "{}.bak.{}",
    path.file_name().unwrap_or_default().to_string_lossy(),
    timestamp
);
let backup_file = path.parent().unwrap_or(Path::new(".")).join(backup_name);
```

---

## [MEDIUM] Finding 5: `collect_bak_files` in `list_project_backups` has no path confinement and silently follows the project root with depth 3

**File**: `src-tauri/src/lib.rs:383`, `403-436`
**Category**: security
**Description**: `list_project_backups` accepts an arbitrary `project_root` and then calls `collect_bak_files` which recurses up to depth 3 without confining the scan to the project root. The `should_skip_dir` check is applied for named directories but not for path-prefix checks. If a symlink check analogous to `collect_env_files` were needed, it is absent here — `collect_bak_files` does **not** skip symlinks.

Contrast with `collect_env_files` (line 469) which explicitly skips symlinks:
```rust
if file_type.is_symlink() {
    continue;
}
```
`collect_bak_files` uses `path.is_file()` (line 414) which follows symlinks on POSIX.

**Impact**: A project directory containing a symlink pointing outside the tree would cause `collect_bak_files` to scan outside the project root, potentially leaking `.bak.*` file metadata (paths, sizes, timestamps) for arbitrary directories.

**Recommendation**: Use `entry.file_type()` (which does not follow symlinks) instead of `path.is_file()` / `path.is_dir()` in `collect_bak_files`, mirroring the approach in `collect_env_files`.

---

## [MEDIUM] Finding 6: No limit on `entries` Vec in `append_missing_env_keys`

**File**: `src-tauri/src/lib.rs:107-183`
**Category**: robustness
**Description**: The `entries: Vec<MissingEntry>` parameter is unbounded. Each `MissingEntry` contains a `key` and `value` string, both of which can be arbitrarily large. The entire expanded content is accumulated in memory before being written. A malicious or buggy caller could pass thousands of entries with large values, causing significant memory usage.

Additionally, individual `value` strings in `MissingEntry` are not length-checked before `format_env_value` processes them. A 10 MB value string would be stored in `append_entries`, then cloned into `updated`, then returned inside `updated_content`.

**Impact**: Memory exhaustion in the Tauri process. For a desktop app this affects the local user only — not a remote attack vector — but could cause the app to become unresponsive or be OOM-killed.

**Recommendation**: Add a guard:
```rust
if entries.len() > 10_000 {
    return Err("Too many entries in a single patch operation".to_string());
}
```
And a per-value length cap (e.g. 64 KB) matching realistic env value sizes.

---

## [MEDIUM] Finding 7: `upsert_env_key` backup is written AFTER the env is modified in memory but BEFORE the atomic write — inconsistent ordering with `append_missing_env_keys`

**File**: `src-tauri/src/lib.rs:238-248` vs `:154-175`
**Category**: correctness
**Description**: In `append_missing_env_keys` the backup is written first (line 154-162), then `atomic_write` is called (line 175) — correct order.

In `upsert_env_key` the in-memory modification happens (lines 213-221), then the `updated` string is assembled (lines 233-234), and **then** the backup is written (lines 238-246), and **then** `atomic_write` is called (line 248).

The backup in `upsert_env_key` is written from `original` which is correct, but the ordering creates a subtlety: if writing the backup fails (e.g. disk full), the function returns an error and `atomic_write` is never called — so the original file is untouched. That is fine. However, if `atomic_write` fails after the backup write succeeds, the caller receives an error but has a backup file on disk with no corresponding updated file. This is not data loss but can leave confusing backup artefacts. The same issue exists in `append_missing_env_keys`.

**Impact**: Low risk of data loss. Confusing UX if backup succeeds but write fails.

**Recommendation**: Consider a transactional approach: write the temp file first via `atomic_write` staging (i.e., write to `.drift-tmp`, verify it, then write backup, then rename). This ensures the backup only exists when the write was successful.

---

## [MEDIUM] Finding 8: `scan_env_files` path confinement relies solely on depth limit and skip list

**File**: `src-tauri/src/lib.rs:64-80`, `438-513`
**Category**: security
**Description**: `collect_env_files` skips symlinks (good) and applies `should_skip_dir` for well-known directories. However, the root path itself is not canonicalised before traversal. If a symlink is passed as the root (e.g. `project_root = "/tmp/mylink"` where `mylink -> /`), the symlink check at line 469 only applies to entries _inside_ the traversal, not to the root itself. The root is used via `fs::read_dir` directly.

This means:
- Passing a symlink as `project_root` to `scan_env_files` would traverse the symlink's target.
- The `strip_prefix` call (line 499-503) would strip the symlink path, not the real path, so the relative names would still look confined.

**Impact**: `.env` file content from outside the intended project tree could be read and returned to the frontend.

**Recommendation**: Canonicalise the root before beginning traversal:
```rust
let root = std::fs::canonicalize(PathBuf::from(project_root.trim()))
    .map_err(|e| format!("Cannot resolve project path: {}", e))?;
```
This also ensures `strip_prefix` operates on real paths consistently.

---

## [LOW] Finding 9: `atomic_write` uses `.with_extension("drift-tmp")` which may truncate the original extension

**File**: `src-tauri/src/lib.rs:733-744`
**Category**: correctness
**Description**: `path.with_extension("drift-tmp")` replaces the existing extension entirely. For a file like `.env.production`, `with_extension` on a path with no extension produces `.env.production.drift-tmp` — actually fine here. But for a hypothetical `.env.staging.local`, the resulting temp file would be `.env.staging.drift-tmp`, which loses `.local` from the path. More importantly, if two concurrent calls to `atomic_write` happen on the same file, they share the same temp path, and the `rename` operations will race — one write can silently overwrite the other's temp file before rename.

**Impact**: For a single-user desktop app concurrent calls are unlikely, but not impossible (e.g. user rapidly clicking a patch button). In the worst case one write wins and the other fails with a broken temp file.

**Recommendation**: Include a random nonce or thread ID in the temp filename:
```rust
let tmp_path = path.with_file_name(format!(
    ".{}.drift-tmp.{}",
    path.file_name().unwrap_or_default().to_string_lossy(),
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0)
));
```

---

## [LOW] Finding 10: `parse_env_value` inline comment stripping is naive

**File**: `src-tauri/src/lib.rs:574-577`
**Category**: correctness
**Description**: The comment-stripping logic:
```rust
if let Some(comment_start) = value.find(" #") {
    value = value[..comment_start].trim();
}
```
This strips anything from the first occurrence of ` #` (space followed by hash). This means values containing literal ` #` — such as a colour hex code `background=#1a2b3c` would correctly not be stripped (no leading space before `#`), but `password=abc def#tag` would be truncated to `abc def`. More problematically, a value like `token=abc # comment` would be correctly trimmed to `abc`, but `token=abc#notacomment` would be left intact. This is actually reasonable env file behaviour, but it only applies to the **unquoted** case. The function does not apply comment stripping to quoted values — that is correct.

However, `parse_env_value` is used by `parse_named_env_value` which is only used for `infer_project_name` (reading `APP_NAME`). The write paths (`format_env_value`) do not re-parse through this function. The parsing inconsistency between read and write means round-tripping a value through read-then-write could silently truncate it.

**Impact**: `APP_NAME` inference could return a truncated value if the name contains ` #`. No data loss in write operations.

**Recommendation**: Document the parsing assumptions clearly. If stricter round-trip fidelity is required, consider a dedicated env parsing crate (`dotenvy`, `dotenv-parser`) rather than the hand-rolled parser.

---

## [LOW] Finding 11: `unix_timestamp` fallback uses `std::process::id()` as a timestamp substitute

**File**: `src-tauri/src/lib.rs:723-731`
**Category**: robustness
**Description**: If the system clock is before the UNIX epoch (pathological but possible on a VM with a misconfigured clock), `unix_timestamp` returns `std::process::id() as u64`. Process IDs are typically 5 digits on macOS (max 99998). This means backup filenames would have a PID-derived "timestamp" that:
1. Is not unique across calls (same PID for the lifetime of the process).
2. Could cause backup file name collisions, with `fs::write` silently overwriting the previous backup.

**Impact**: In an edge case with a broken clock, rapid successive backups could silently overwrite each other.

**Recommendation**: Use a monotonically increasing counter as the fallback rather than PID, or include a random suffix.

---

## [LOW] Finding 12: `write_project_backup` uses non-atomic `fs::write` for the backup JSON

**File**: `src-tauri/src/lib.rs:330-331`
**Category**: robustness
**Description**: The project-level backup JSON is written with `fs::write` directly, not via `atomic_write`. If the process is killed mid-write the backup JSON file will be partially written and corrupt. In contrast, env file mutations all go through `atomic_write` (via a temp file + rename).

**Impact**: A partial backup file would cause the backup browser to show a corrupt entry.

**Recommendation**: Use `atomic_write` for the backup JSON as well.

---

## [INFO] Finding 13: `run()` uses `.expect()` — intentional, acceptable

**File**: `src-tauri/src/lib.rs:761`
**Category**: robustness
**Description**: The single `expect()` in the codebase is:
```rust
.run(tauri::generate_context!())
.expect("error while running tauri application");
```
This is the standard Tauri bootstrap pattern. A failure here means the application window could not be created — panicking is the correct behaviour. No other `unwrap()` or `expect()` calls are present in the command path.

**Impact**: None — this is correct usage.

---

## [INFO] Finding 14: No command injection surface found

**Category**: security
**Description**: No `std::process::Command`, `std::os::unix::process`, shell invocation, or `libc::exec*` calls were found anywhere in the file. All operations are pure Rust filesystem calls. There is no command injection attack surface.

---

## [INFO] Finding 15: Env key validation (`is_valid_env_key`) is strict and correct

**File**: `src-tauri/src/lib.rs:678-684`
**Category**: security
**Description**: Keys are restricted to `[A-Za-z0-9_]` only. This correctly prevents injection of `=`, newlines, spaces, or shell metacharacters into key positions. Values are sanitised through `format_env_value` which strips `\n` and `\r` and wraps whitespace-containing values in double quotes with internal quote escaping. This is a solid defence.

---

## Issue Summary

| Severity | Count | Findings |
|----------|-------|----------|
| HIGH     | 3     | #1 (path confinement), #2 (TOCTOU), #3 (raw content write) |
| MEDIUM   | 5     | #4 (backup path), #5 (symlink in bak scan), #6 (unbounded entries), #7 (backup ordering), #8 (root symlink) |
| LOW      | 4     | #9 (temp file collision), #10 (comment stripping), #11 (timestamp fallback), #12 (non-atomic backup JSON) |
| INFO     | 3     | #13 (expect ok), #14 (no cmd injection), #15 (key validation ok) |

---

## Recommendation

**Request Changes** — before shipping to end users, the three HIGH findings should be addressed:

1. Add canonical-path confinement to all write commands so they can only modify files within the user-selected project root (or a known safe base directory). This is the most impactful single change.
2. Address the `write_env_file` unlimited-size raw write — at minimum add a size cap.
3. Fix the symlink check omission in `collect_bak_files` to mirror the pattern already correctly used in `collect_env_files`.

The MEDIUM findings are important for correctness and robustness but represent lower-probability failure modes for a single-user desktop tool. The LOW findings are minor refinements.

The overall code quality is good: no `unwrap()` in the command path, consistent error propagation, clear function decomposition, and a working atomic write pattern. The primary gap is the absence of path confinement, which is a common oversight when IPC commands are initially written for trusted callers but later become a potential attack surface if the WebView is ever compromised.
