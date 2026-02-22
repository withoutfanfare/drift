# Consolidated Code Review — Drift Tauri App

**Date**: 2026-02-22
**Branch**: feature/vue-tailwind-spool
**Agents**: 4 specialist reviewers (Rust security, Vue frontend, Performance, Data integrity)
**Total findings**: 60+ individual, deduplicated to 28 unique issues

---

## Executive Summary

The codebase has solid fundamentals — no `unwrap()` in Rust command paths, atomic writes for file safety, good Vue composition patterns, and strict env key validation. However, there are **real user-facing bugs** and **significant security gaps** that should be addressed before shipping.

---

## CRITICAL (5) — Must fix

### 1. `revealedCells` Set mutation doesn't trigger Vue re-renders

**Source**: vue-auditor
**File**: `src/components/comparison/ComparisonTableRow.vue:24,37-43`

Clicking a masked cell to reveal it is broken. `revealedCells` is declared as `ref<Set<string>>` and mutated via `.add()/.delete()`. Vue 3 does not track mutations on a Set held inside a plain `ref` — only `reactive()` wraps them with Proxy tracking. The ref value itself is not replaced, so Vue will not trigger re-renders when items are added/deleted.

**Impact**: Cell reveal clicks appear broken to users. `isRevealed()` and `cellIsMasked()` template calls read stale state.

**Fix**: Replace with a pattern that creates a new Set on each mutation:
```ts
function toggleReveal(cellId: string) {
  const next = new Set(revealedCells.value);
  if (next.has(cellId)) { next.delete(cellId); } else { next.add(cellId); }
  revealedCells.value = next;
}
```
Or use `reactive(new Set<string>())` which is tracked by Vue 3's Proxy.

---

### 2. `computeDiff` is O(n²) AND semantically wrong

**Source**: perf-auditor, vue-auditor, data-auditor
**File**: `src/composables/useDiff.ts:7-36`

The diff algorithm compares old and new lines by **index position** rather than using an LCS (Longest Common Subsequence) or Myers diff. The secondary check `!newLines.includes(oldLine)` is a full-array scan per line (O(n²)). This produces incorrect output for:

1. **Reordered lines**: A line moved from position 5 to 10 shows as "removed" at 5 and "added" at 10.
2. **Duplicate lines**: Lines appearing more than once are suppressed incorrectly.
3. **Appended blocks**: Lines beyond the old length are compared to `undefined`, producing phantom "removed" entries.

**Impact**: The diff preview shown before writing a file misleads users. This is the core safety gate before file writes.

**Fix**: Replace with a proper LCS-based diff algorithm. Short-term: at minimum pre-build `Set` of oldLines/newLines to reduce `.includes()` to O(1) lookup.

---

### 3. No path confinement on write commands

**Source**: rust-auditor
**File**: `src-tauri/src/lib.rs:107` (`append_missing_env_keys`), `:186` (`upsert_env_key`), `:259` (`write_env_file`)

All three write commands accept a `target_path` string from the frontend and construct a `PathBuf` from it without canonicalising or confining the path to an allowed directory. A crafted call with `target_path = "/etc/passwd"` would pass existence checks and overwrite the file.

**Impact**: Arbitrary file write anywhere the OS user has write permission. If the WebView is ever compromised (XSS, supply-chain attack), an attacker can invoke these commands directly.

**Fix**: Canonicalise the requested path and verify it shares a prefix with the project root:
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

### 4. `atomic_write` temp file collides under concurrent access

**Source**: rust-auditor, data-auditor
**File**: `src-tauri/src/lib.rs:733-744`

The temp file path is derived as `path.with_extension("drift-tmp")`. For a file `/app/.env`, this produces `/app/.drift-tmp`. If two operations run simultaneously on the same file (two rapid "Write" clicks, or two app instances), both write to the identical temp path — the second overwrite the first's content, and the subsequent `rename` produces indeterminate file content.

**Impact**: Data corruption of the target `.env` file under concurrent writes.

**Fix**: Include a random nonce in the temp filename:
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

### 5. `upsert_env_key` silently rewrites ALL duplicate key occurrences

**Source**: data-auditor
**File**: `src-tauri/src/lib.rs:213-221`

The Rust `upsert_env_key` loops over all lines and replaces every line whose key matches. If an env file has `DB_HOST=primary` + `DB_HOST=replica`, both are overwritten with the new value, destroying the duplicate intent. The TypeScript `upsertEnvKeyInRaw` does the same.

**Impact**: Silent data loss of duplicate key intent; potential application misconfiguration after write.

**Fix**: Either (a) warn the user before writing when duplicates are present, or (b) only rewrite the last occurrence (matching standard env precedence), or (c) refuse to write and instruct the user to resolve duplicates first.

---

## HIGH (8) — Should fix before release

### 6. TypeScript/Rust parser divergence on inline comments

**Source**: data-auditor
**File**: `src/composables/useEnvParser.ts:1-35` vs `src-tauri/src/lib.rs:557-579`

Rust strips ` #` comments from unquoted values; TypeScript does not. For `CACHE_DRIVER=file # use redis in prod`:
- Rust parses: `file`
- TypeScript parses: `file # use redis in prod`

**Impact**: Corruption of env values on write-back; misleading UI display; false drift detection.

**Fix**: Align TypeScript `parseEnv` to strip ` #` inline comments from unquoted values, matching Rust behaviour.

---

### 7. All `localStorage.setItem` calls unguarded

**Source**: vue-auditor, data-auditor
**File**: `src/composables/useEnvSets.ts:65`, `src/composables/useProjects.ts:54`, `src/composables/useActivityLog.ts:21`

When localStorage reaches ~5MB, `setItem` throws `QuotaExceededError` synchronously. None of the persistence functions catch this. The exception propagates up, leaving Vue reactive state mutated but localStorage unchanged.

**Impact**: Silent data loss on restart — recently added sets exist in memory but not in storage.

**Fix**: Wrap all `localStorage.setItem` calls in try/catch. Surface a user-visible error. Consider LRU eviction for activity log.

---

### 8. `analyzeRows` + `persistSets` cascade on every keystroke

**Source**: perf-auditor
**File**: `src/composables/useEnvSets.ts:65-76`, `src/App.vue:23`

Every inline edit triggers a synchronous chain:
```text
User types → applyRawToSet → parseEnv (O(n)) → persistSets (localStorage.setItem, 5-20ms)
→ envSets mutation → currentSets (.filter + .sort) → analyzeRows (O(k×n) full rebuild)
→ Full Vue re-render tree → isSensitiveKey (13 regex × cells) → WarningsList (duplicate evaluateUnsafe)
```

**Impact**: 10-40ms blocking per keystroke on a 5-set / 200-key project. Primary source of UI jank.

**Fix**: Debounce `persistSets` with 300-500ms trailing delay. Decouple inline edits from `analyzeRows` recalculation. Extract warnings from existing analysis data.

---

### 9. TOCTOU race on all write operations

**Source**: rust-auditor
**File**: `src-tauri/src/lib.rs:114-119, 199-204, 266-272`

Every write command first checks `path.exists()` and `path.is_file()`, then opens the file separately. Between the existence check and the write, the path could be replaced with a symlink, a directory, or deleted.

**Impact**: On a multi-user or automated system, an attacker process could race the check to redirect the write.

**Fix**: Open the file using `OpenOptions` with `write(true).truncate(false)` and check the file type via `fstat` on the already-open descriptor.

---

### 10. `write_env_file` accepts unbounded raw content

**Source**: rust-auditor
**File**: `src-tauri/src/lib.rs:259-289`

Unlike `append_missing_env_keys` and `upsert_env_key`, `write_env_file` writes the `content` parameter verbatim with no parsing, no validation, and no size limit.

**Impact**: A 500MB string would be serialised by Tauri's IPC layer and written to disk.

**Fix**: Add a maximum content size check (e.g. 5MB). Consider parsing as validation.

---

### 11. `executePatch` recomputes entries after user sees diff

**Source**: vue-auditor
**File**: `src/components/comparison/ComparisonCard.vue:183-202`

`requestPatch` builds the preview using `getMissingEntries()`. Then `executePatch` calls `getMissingEntries()` **again**. If sets change between preview and confirm, different keys are written than what was shown.

**Impact**: User approves a diff showing N keys, but a different number of keys is actually written.

**Fix**: Capture the `entries` array in `requestPatch` and pass to `executePatch` via a component-level ref (`pendingPatchEntries`).

---

### 12. `collect_bak_files` doesn't skip symlinks

**Source**: rust-auditor
**File**: `src-tauri/src/lib.rs:403-436`

`collect_env_files` correctly skips symlinks at line 469. `collect_bak_files` does not — it uses `path.is_file()` which follows symlinks on POSIX.

**Impact**: Symlinks in a project directory could leak `.bak` file metadata from outside the project tree.

**Fix**: Use `entry.file_type()` (which does not follow symlinks) mirroring `collect_env_files`.

---

### 13. No undo path for in-memory key additions

**Source**: vue-auditor, data-auditor
**File**: `src/components/comparison/ComparisonCard.vue:248-265`

`onRevertMemory` returns early when `original === undefined` ("was added, not changed — skip revert"). The Revert button is hidden for added keys. There is no "Remove added key" path — users cannot undo accidentally-applied new keys without reloading the app.

**Impact**: Potential for accidental writes of unwanted keys.

**Fix**: Add a "Remove" action for keys where `wasAdded(setId)` is true, which deletes the key from `rawText` and cleans up `sessionEdits`.

---

## MEDIUM (10) — Important for robustness

### 14. `WarningsList` duplicates `evaluateUnsafe` work

**File**: `src/components/comparison/WarningsList.vue:10-35`

The `warnings` computed rebuilds the full `evaluateUnsafe` regex battery per key per set — the same work already done in `analyzeRows`. This means `evaluateUnsafe` runs twice per key per render cycle.

**Fix**: Extract unsafe warnings from the already-computed `analysis` rows instead of re-running independently.

---

### 15. `isSensitiveKey` runs 13 regex tests per cell per render

**File**: `src/composables/useMasking.ts:41-43`

13 case-insensitive regex tests × 500 cells = 6,500 regex evaluations per render cycle. Keys are stable identifiers — the result never changes.

**Fix**: Add a `Map<string, boolean>` cache:
```ts
const sensitiveKeyCache = new Map<string, boolean>();
function isSensitiveKey(key: string): boolean {
  if (sensitiveKeyCache.has(key)) return sensitiveKeyCache.get(key)!;
  const result = SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
  sensitiveKeyCache.set(key, result);
  return result;
}
```

---

### 16. `BackupBrowser` race condition on project switch

**File**: `src/components/project/BackupBrowser.vue:28-34`

When the project changes while a load is in-flight, the `finally` block of the old load sets `loading.value = false` after the new load has set it to `true`, making the spinner disappear prematurely.

**Fix**: Add a cancellation guard — check `activeProject.value?.id` at the end of the load against the ID that started it.

---

### 17. Auto-scan race on rapid project saves

**File**: `src/components/project/ProjectManagementCard.vue:32-46`

Two concurrent scans can run if the user saves a project twice quickly, producing duplicate env set entries.

**Fix**: Check `scanning.value` before triggering: `if (!scanning.value && props.sets.length === 0) await onScan()`.

---

### 18. `stripWrappingQuotes` doesn't handle escape sequences

**File**: `src/composables/useEnvParser.ts:37-47`

TypeScript slices off outer quotes without processing escape sequences. Rust processes `\"` → `"`. Value `"hello \"world\""` stores differently between parsers.

**Fix**: Mirror Rust's escape-sequence handling in TypeScript.

---

### 19. Orphaned sets silently reassigned to first project

**File**: `src/composables/useEnvSets.ts:20-30`

When loading from localStorage, if a set's `projectId` is not found, it's reassigned to the first project. After project deletion and data restoration, sets from deleted projects appear under the wrong project.

**Fix**: Filter out orphaned sets entirely rather than reassigning.

---

### 20. Backup written before `atomic_write` — orphaned on failure

**File**: `src-tauri/src/lib.rs:238-246`

In `upsert_env_key`, the backup is written before `atomic_write` is called. If `atomic_write` fails (disk full, cross-device rename), the backup file is orphaned on disk.

**Fix**: Write backup only after `atomic_write` succeeds, or clean up on failure.

---

### 21. `useFilters` composable is dead code

**File**: `src/composables/useFilters.ts`

`ComparisonCard` defines its own local `filter`, `search`, `referenceSetId`, `targetSetId` refs and does not import from `useFilters`. The composable is never consumed.

**Fix**: Remove `useFilters` or refactor `ComparisonCard` to use it.

---

### 22. `addOrReplaceSet` mutates existing object directly

**File**: `src/composables/useEnvSets.ts:100-108`

When updating an existing set, properties are mutated directly on the found object. Works due to Vue 3's deep reactivity but fragile — would break silently if refactored to `shallowRef`.

**Fix**: Replace the object in the array: `envSets.value[index] = { ...existing, ...updates }`.

---

### 23. Double `stat()` syscalls in `collect_bak_files`

**File**: `src-tauri/src/lib.rs:410-436`

`path.is_file()` performs a `stat()`, then `fs::metadata(&path)` performs another. Doubles I/O per file.

**Fix**: Use `entry.file_type()` and `entry.metadata()` (single operation from `DirEntry`).

---

## LOW (5) — Nice to have

### 24. `WarningsList` uses `:key="i"` on `v-for`

**File**: `src/components/comparison/WarningsList.vue:43`

Array index keys cause stale DOM on reorder. Use `:key="w"` (warning string) instead.

---

### 25. `atomic_write` temp path may collide via `.with_extension()`

**File**: `src-tauri/src/lib.rs:733`

`.with_extension("drift-tmp")` replaces the existing extension. For concurrent calls on the same file, the temp paths are identical. (Addressed by fix in Critical #4.)

---

### 26. `unix_timestamp` PID fallback causes backup name collisions

**File**: `src-tauri/src/lib.rs:723-731`

If the system clock is before UNIX epoch, the fallback uses `process::id()` — same for all calls within the process. Rapid successive backups overwrite each other.

**Fix**: Use a monotonically increasing counter or random suffix as fallback.

---

### 27. `write_project_backup` uses non-atomic `fs::write`

**File**: `src-tauri/src/lib.rs:330-331`

Project backup JSON is written with `fs::write` directly, not via `atomic_write`. Partial write possible if process is killed mid-write.

**Fix**: Route through `atomic_write`.

---

### 28. `filteredRows` prop on `ComparisonCard` is declared but never read

**File**: `src/App.vue:125-129`, `src/components/comparison/ComparisonCard.vue:21-25`

`filteredRows` is passed from `App.vue` but never consumed inside the component. Dead prop.

**Fix**: Remove the prop.

---

## Parser Parity Table (TypeScript vs Rust)

| Feature | TypeScript (`useEnvParser.ts`) | Rust (`lib.rs`) | Consistent? |
|---------|-------------------------------|-----------------|-------------|
| Export prefix stripping | `line.slice(7).trim()` | `strip_prefix("export ")` | Yes |
| Empty-value keys (`KEY=`) | Stored as `""` | Stored as `""` | Yes |
| Duplicate key detection | Yes (flags in `duplicates`) | No (last write wins) | **No** |
| Inline comment stripping | **No** | Yes (` #` for unquoted) | **No** |
| Escape sequence handling | **No** | Yes (`\"` → `"`) | **No** |
| Newline stripping in values | **No** | Yes | **No** |
| Key validation regex | `/^[A-Z0-9_]+$/i` | `is_ascii_alphanumeric \|\| _` | Yes |
| UTF-8 BOM | Not handled | Not handled | Yes (neither) |
| Unicode in keys | Rejected | Rejected | Yes |
| Unicode in values | Preserved | Preserved | Yes |

---

## Positive Observations

- **No `unwrap()` in command paths** — consistent `Result<T, String>` error propagation
- **No command injection surface** — pure Rust filesystem calls, no shell invocation
- **Atomic writes with temp files** — prevents partial file writes
- **Strict env key validation** — `[A-Za-z0-9_]` only, blocks injection in key positions
- **Symlink prevention in file discovery** — correctly blocks path traversal in `scan_env_files`
- **Backup before mutation** — all file operations create timestamped backups
- **Smart sensitive masking** — 13-pattern system for passwords, keys, tokens
- **Good Vue composition patterns** — clear separation of concerns, proper use of `ref`/`computed`/`watch`
- **Session edit tracking** — correct "always replace, never mutate" Map pattern in `ComparisonCard`
- **`applyRawToSet` pattern** — re-parsing raw text keeps `rawText` and `values` in sync

---

## Recommended Fix Priority

### Sprint 1 — Critical

1. Fix `revealedCells` reactivity (replace-on-mutate or `reactive(new Set())`)
2. Replace `computeDiff` with LCS-based algorithm
3. Add path confinement to all Rust write commands
4. Add random nonce to `atomic_write` temp filename
5. Handle duplicate keys in `upsert_env_key` (warn or write-last-only)

### Sprint 2 — High

6. Align TS parser with Rust (inline comments, escape sequences, newlines)
7. Wrap all `localStorage.setItem` in try/catch
8. Debounce `persistSets` (300ms trailing) to eliminate keystroke jank
9. Capture patch entries at preview time, not execution time

### Sprint 3 — Medium

10. Extract warnings from existing analysis (eliminate duplicate `evaluateUnsafe`)
11. Cache `isSensitiveKey` results
12. Fix race conditions (backup browser, auto-scan)
13. Remove dead `useFilters` composable

---

## Detailed Reports

- [Rust Security Audit](rust-security-audit.md)
- [Vue Frontend Audit](vue-frontend-audit.md)
- [Performance Audit](performance-audit.md)
- [Data Integrity Audit](data-integrity-audit.md)
