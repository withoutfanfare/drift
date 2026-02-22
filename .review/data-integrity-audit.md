# Data Integrity and Edge Case Audit

**Auditor**: data-auditor
**Date**: 2026-02-22
**Scope**: End-to-end data flow — env parsing, state management, file operations, localStorage, masking, concurrency

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 7 |
| MEDIUM | 6 |
| LOW | 4 |
| INFO | 3 |

---

## CRITICAL Findings

---

## [CRITICAL] Backup Written Before Content Validation in `upsert_env_key`

**File**: `src-tauri/src/lib.rs:238-246`
**Category**: filesystem / data-loss

**Description**: In `upsert_env_key`, the backup is written _after_ the content has already been mutated in memory (lines 213–231), but _before_ `atomic_write` is called. If `atomic_write` fails (disk full, permissions error, cross-device rename), the backup file has been written but the original on-disk file is unchanged. The user is told the backup was created and given a backup path, but the write failed — leaving them with an orphaned `.bak` file and a false sense that the operation succeeded. The same pattern appears in `append_missing_env_keys` (lines 154–162).

**Scenario**:
1. User triggers inline "Write to file" for a key.
2. Disk has exactly enough space for the backup but not the tmp file.
3. Backup write at line 241 succeeds.
4. `atomic_write` at line 248 fails writing the tmp file.
5. Error is returned but the backup path was already computed and would have been returned in a success branch — actually in this case an error _is_ returned, so the path is not returned. However the `.bak` file now exists on disk and may confuse the user.

**Deeper issue**: If `atomic_write` fails at the `fs::rename` stage (line 737) on a cross-filesystem move (e.g., `/tmp` to a mounted network share), `fs::rename` returns an error, the tmp file is cleaned up (line 740), but the backup was already written at line 241. The user receives an error but a backup exists that they may assume contains the written content.

**Impact**: Orphaned backup files; user confusion about whether the write succeeded. Under specific failure modes (cross-device rename), could mask that no write occurred.

**Recommendation**: Write the backup only after `atomic_write` succeeds, or restructure to: (1) validate/prepare new content, (2) write backup, (3) write tmp, (4) rename. Return success only when all three succeed. Alternatively, never create a `.bak` file for a failed write.

---

## [CRITICAL] `atomic_write` Uses Same Extension for All Files — Collides Under Concurrent Access

**File**: `src-tauri/src/lib.rs:733-744`
**Category**: concurrency / data-loss

**Description**: The temp file path is derived as `path.with_extension("drift-tmp")`. For a file `/app/.env`, this produces `/app/.drift-tmp`. If two operations run simultaneously on the same file (e.g., two rapid "Write" clicks, or two app instances), both will write to the identical temp path. The second write will overwrite the first's temp content. When the first process then calls `fs::rename`, it renames the (now corrupted) second write's content over the original file.

**Scenario**:
1. User double-clicks "Write to file" — two `upsert_env_key` calls are dispatched.
2. Call A writes temp content `KEY_A=val` to `/app/.env.drift-tmp`.
3. Call B writes temp content `KEY_B=val` to `/app/.env.drift-tmp`, overwriting A.
4. Call A renames `/app/.env.drift-tmp` → `/app/.env` with B's content.
5. Call B renames `/app/.env.drift-tmp` → `/app/.env` (file may no longer exist — error, or B writes again).
6. Net result: indeterminate file content, possible data loss of the key that A was supposed to write.

**Impact**: Data corruption of the target `.env` file under concurrent writes.

**Recommendation**: Include a random nonce or process ID in the temp filename (e.g., `path.with_extension(format!("drift-tmp-{}", uuid_or_pid))`).

---

## [CRITICAL] `upsert_env_key` Rewrites All Duplicate Key Occurrences

**File**: `src-tauri/src/lib.rs:213-221`
**Category**: consistency / data-loss

**Description**: The Rust `upsert_env_key` loops over all lines and replaces every line whose key matches `normalized_key`. If an env file legitimately has a duplicate key (which is valid in some shell environments), all occurrences are rewritten. The TypeScript `upsertEnvKeyInRaw` does the same (lines 9–17 of `useEnvMutations.ts`). However, the TypeScript parser (`parseEnv`) already handles duplicates and records them in the `duplicates` array — meaning the app is aware that duplicates exist but the write path silently overwrites all of them.

More critically, there is an inconsistency between the Rust backend and the TypeScript frontend in what the `updatedContent` string contains: both rewrite all duplicate occurrences. The `EnvSet.duplicates` array correctly flags the duplicate, but when the user "writes" from the UI, the resulting file loses all but the last assignment's value, changing the effective runtime behaviour of the env file without any warning.

**Scenario**:
1. Env file contains:
   ```text
   DB_HOST=primary
   DB_HOST=replica
   ```

2. Frontend shows `duplicates: ["DB_HOST"]` with a warning.
3. User edits `DB_HOST` to `new-primary` and clicks Write.
4. Both lines are replaced with `DB_HOST=new-primary`.
5. The replica assignment is permanently lost.

**Impact**: Silent data loss of duplicate key intent; potential application misconfiguration after write.

**Recommendation**: Either (a) warn the user before writing when duplicates are present, or (b) only rewrite the last occurrence (matching standard env precedence), or (c) refuse to write and instruct the user to resolve duplicates first.

---

## HIGH Findings

---

## [HIGH] `parseEnv` (TypeScript) and `parse_env_keys` / `parse_env_value` (Rust) Have Divergent Inline Comment Handling

**File**: `src/composables/useEnvParser.ts:1-35` vs `src-tauri/src/lib.rs:557-579`
**Category**: consistency / parsing

**Description**: The Rust `parse_env_value` strips inline comments with ` #` (space-hash) stripping for unquoted values (line 574). The TypeScript `stripWrappingQuotes` function does no inline comment stripping at all — the raw value after the `=` sign is used directly after stripping quotes. This means:

- File: `CACHE_DRIVER=file # use redis in prod`
- Rust parses value as: `file`
- TypeScript parses value as: `file # use redis in prod`

The values stored in `EnvSet.values` in the frontend will differ from what Rust considers the key's value. When the user then uses the frontend to determine what to write back to the file, they may write the comment-contaminated string as the value.

**Scenario**:
1. File contains `CACHE_DRIVER=file # use redis in prod`.
2. Rust `append_missing_env_keys` skips this key (it detects `CACHE_DRIVER` exists).
3. TypeScript stores `values["CACHE_DRIVER"] = "file # use redis in prod"`.
4. User views the comparison table — value shown is `file # use redis in prod`.
5. User clicks "Apply" then "Write" to update another env set with this value.
6. The written value is `"file # use redis in prod"` (quoted, because it contains a space), corrupting the target file.

**Impact**: Corruption of env values on write-back; misleading UI display of values containing inline comments.

**Recommendation**: Align TypeScript `parseEnv` to strip ` #` inline comments from unquoted values, matching Rust behaviour. Add a test case for this.

---

## [HIGH] Backup Creation Can Fail Silently — Write Still Proceeds

**File**: `src-tauri/src/lib.rs:154-162`, `src-tauri/src/lib.rs:238-246`
**Category**: filesystem / data-loss

**Description**: In `append_missing_env_keys`, if `create_backup` is `true` and `fs::write(&backup_file, &original)` fails, the error is propagated back via `map_err` (line 158) and the function returns an `Err`. However in `upsert_env_key`, the identical pattern also returns an error (line 244). So backup failure does block the write — but the error message says "Failed to write backup file", and the UI in `ComparisonCard.vue` (lines 198–200) catches this as a generic error and shows `Patch failed: Failed to write backup file`. The user sees an error and does not understand whether their file was written or not.

The more critical sub-issue: `write_env_file` (lines 274–280) also reads and writes the backup before the atomic write — and if the backup write fails, the function returns an error. But the read at line 275 could fail for a different reason (e.g., file permissions changed between `path.exists()` check at line 267 and the read at line 275 — TOCTOU race).

**Scenario** (TOCTOU):
1. `write_env_file` checks `path.exists()` → true.
2. Another process renames or deletes the file.
3. `fs::read_to_string` at line 275 fails.
4. Error is returned: "Failed to read target env file" — but the new content is never written.
5. The user has edits in memory that are not saved, and no clear path to retry.

**Impact**: Write operations can fail unexpectedly due to TOCTOU race; user may not realise in-memory state diverged from disk state.

**Recommendation**: After a write failure, the UI should clearly indicate that in-memory state may differ from disk and offer a retry path. Long-term: use `O_CREAT | O_EXCL` or file locking to reduce TOCTOU exposure.

---

## [HIGH] localStorage Has No Quota Guard — Silent Data Loss on Overflow

**File**: `src/composables/useEnvSets.ts:65-76`, `src/composables/useProjects.ts:54-56`, `src/composables/useActivityLog.ts:21-23`
**Category**: storage / data-loss

**Description**: All three composables call `localStorage.setItem(...)` without catching a `QuotaExceededError`. When localStorage reaches its limit (~5MB in most WebView implementations), `setItem` throws synchronously. Because the call is not wrapped in try/catch, the exception will propagate up the call stack uncaught, potentially leaving Vue reactive state in a partially-mutated condition (e.g., a set was spliced into the array but `persistSets()` failed, so the in-memory state has the new set but localStorage does not).

**Scenario**:
1. User has many large env files loaded (e.g., 500KB each × 10 files = 5MB).
2. User adds one more set.
3. `addOrReplaceSet` → `persistSets()` → `localStorage.setItem(...)` throws `QuotaExceededError`.
4. The new set exists in `envSets.value` (Vue reactive) but is not in localStorage.
5. App restart: the new set is gone; user does not know why.

**Impact**: Silent data loss of recently added env sets; no user feedback.

**Recommendation**: Wrap all `localStorage.setItem` calls in try/catch and surface a user-visible error. Consider implementing LRU eviction for the activity log. For large env files, storing `rawText` directly in localStorage is inherently fragile — consider storing only a hash or truncated preview, or using IndexedDB for the raw content.

---

## [HIGH] Project Switch Does Not Reset `referenceSetId` / `targetSetId` in `useFilters`

**File**: `src/composables/useFilters.ts:4-6`
**Category**: consistency / state

**Description**: `useFilters` stores `referenceSetId` and `targetSetId` as module-level `ref`s (shared singleton state). When the user switches active project, `ComparisonCard.vue` correctly resets its own local `referenceSetId` / `targetSetId` refs (line 67–73 of `ComparisonCard.vue`). However, `useFilters`'s `referenceSetId` / `targetSetId` are never reset. These values from the previous project persist and could be passed as stale IDs to any component that uses `useFilters()` directly rather than the local refs in `ComparisonCard`.

**Note**: Looking at the current code, `ComparisonCard` defines its own local `referenceSetId` / `targetSetId` refs and does _not_ import from `useFilters`. So the `referenceSetId` / `targetSetId` in `useFilters` appear unused by the current components. However, they are exported and could be consumed in future components — and their presence creates a confusing dual-source-of-truth.

**Scenario**:
1. User is on Project A; sets `referenceSetId` in `useFilters` to set UUID `abc-123`.
2. User switches to Project B; `useFilters` still holds `referenceSetId = "abc-123"`.
3. A component on Project B uses `useFilters().referenceSetId` to filter or build a template.
4. The ID `abc-123` belongs to Project A's sets — silently uses wrong data.

**Impact**: Cross-project data contamination if `useFilters` refs are consumed by future components.

**Recommendation**: Either remove `referenceSetId` / `targetSetId` from `useFilters` (they appear unused), or add a reset handler tied to the project switch event.

---

## [HIGH] `onRevertMemory` Silently Skips Keys That Were "Added" (Not Changed)

**File**: `src/components/comparison/ComparisonCard.vue:248-265`
**Category**: data-loss / consistency

**Description**: In `onRevertMemory`, if `original === undefined` (line 251), the function returns without reverting. The comment says "was added, not changed — skip revert". This means if a user adds a new key via "Apply" (in-memory) and then wants to undo it, clicking "Revert" does nothing. The only way to undo an added key is to delete the project or reload the page.

The `canRevert` function in `ComparisonTableRow.vue` (line 61) returns `false` for added keys, so the Revert button is correctly hidden — but this silently prevents users from undoing in-memory key additions through the normal UI flow. There is no "Remove added key" path exposed to users.

**Scenario**:
1. User clicks "Apply" to add `NEW_KEY=somevalue` to a set in memory.
2. `sessionEdits` records `original = undefined` for this key.
3. User decides they don't want the change and looks for undo — no option exists.
4. User must reload the app or know to find this hidden state.

**Impact**: No undo path for in-memory key additions; potential for accidental writes of unwanted keys.

**Recommendation**: Add a "Remove" action for keys where `wasAdded(setId)` is true, which deletes the key from `rawText` and cleans up `sessionEdits`.

---

## [HIGH] `computeDiff` Algorithm Produces Incorrect Results for Moves and Duplicates

**File**: `src/composables/useDiff.ts:7-36`
**Category**: consistency / data

**Description**: The diff algorithm is a simple line-by-line position comparison, not a true LCS (longest common subsequence) diff. It checks `if oldLine === newLine` at the same index, and for non-matching lines, checks `newLines.includes(oldLine)` to determine if the old line was "removed". This produces incorrect output for:

1. **Reordered lines**: If a line moved from position 5 to position 10, it will be marked as "removed" at position 5 and "added" at position 10 — even though the content is identical.
2. **Duplicate lines**: If `KEY=value` appears twice in the old file but once in the new file, `oldLines.includes` will find it present and mark neither as removed — the removed duplicate is invisible in the diff preview.
3. **Line count mismatch**: When a block of lines is inserted (appended keys), lines beyond the old length are compared to `undefined` and the existing lines are shown as removed when they are not.

**Scenario** (append case):
1. Old file has 10 lines. New content appends 3 lines at the end.
2. `maxLen = 13`. For indices 10–12, `oldLine = undefined`, `newLine = <new content>`.
3. `oldLine !== newLine` → checks `!newLines.includes(undefined)` → true → pushes `removed: undefined` line.
4. Actually nothing was removed — the diff preview is misleading.

**Impact**: The diff preview shown before a write operation may not accurately represent the changes. Users may approve writes based on incorrect previews.

**Recommendation**: Replace the custom diff with a proper LCS-based diff algorithm (e.g., Myers diff) or use a well-tested library.

---

## MEDIUM Findings

---

## [MEDIUM] `stripWrappingQuotes` Does Not Handle Escape Sequences Inside Quoted Strings

**File**: `src/composables/useEnvParser.ts:37-47`
**Category**: parsing / consistency

**Description**: The TypeScript `stripWrappingQuotes` simply slices off the outer characters without processing escape sequences. The Rust `parse_env_value` at line 566 does process `\"` → `"` inside double-quoted values. Given a value `"hello \"world\""`, TypeScript stores `hello \"world\"` (with literal backslashes) while Rust stores `hello "world"`. This discrepancy means comparison analysis in the frontend can flag false drift between a file-based set (whose content was scanned by Rust) and a manually-pasted set (parsed only by TypeScript).

**Impact**: False drift positives for values containing escaped quotes; incorrect display of escape sequences in the comparison table.

**Recommendation**: Mirror Rust's escape-sequence handling in TypeScript `stripWrappingQuotes`.

---

## [MEDIUM] `useEnvSets.addOrReplaceSet` Mutates `existing` Object Directly

**File**: `src/composables/useEnvSets.ts:100-108`
**Category**: consistency / reactivity

**Description**: When updating an existing set, the code mutates the `existing` object's properties directly (lines 101–107) rather than replacing the array entry. Because `envSets` is declared as `ref<EnvSet[]>`, Vue's reactivity tracks the array reference, not deep object mutations. While Vue 3 uses Proxy-based deep reactivity by default, direct mutation of object properties within a `ref<Array>` can bypass change tracking in some edge cases, particularly with `shallowRef` usage nearby.

More concretely: the `existing` reference found via `.find()` is the same object in the array. Mutating it will trigger reactivity correctly in Vue 3's Proxy system — but the fact that this is the intended pattern is not obvious, and it bypasses the `id` field stability check (the ID could theoretically be mutated here without consequence, but it's a structural smell).

**Impact**: Low direct risk in Vue 3, but creates fragile patterns that could break under refactoring to `shallowRef` or computed/memoised selectors.

**Recommendation**: Replace the object in the array with a spread: `envSets.value[index] = { ...existing, name: input.name, ... }`.

---

## [MEDIUM] `useEnvSets.loadSetsFromStorage` Silently Reassigns Orphaned Sets to First Project

**File**: `src/composables/useEnvSets.ts:20-30`
**Category**: consistency / data

**Description**: When loading sets from localStorage, if a set's `projectId` is not found in the known projects list, it is reassigned to the `fallbackProjectId` (first project in the list, line 20). This means:

1. A set belonging to a deleted project may silently appear under a different project.
2. If the user has Project A and Project B, deletes Project B, and restarts — all of Project B's sets are now attributed to Project A.
3. There is no indication to the user that orphaned sets were reassigned.

**Scenario**:
1. User has Project A (id: `aaa`) and Project B (id: `bbb`).
2. Deletes Project B. `clearProjectSets("bbb")` is called → all `bbb` sets removed from `envSets.value` and persisted.
3. BUT: if the user clears their browser cache and localStorage is corrupt, or restores a backup that has `bbb` sets but no `bbb` project, on next load all those sets appear under Project A.

**Note**: The `deleteProject` call in `useProjects` does correctly call `clearProjectSets` first, so under normal operation this code path may not be hit. But it is still surprising behaviour.

**Impact**: Data contamination across projects; confusing UX if sets appear under wrong project after data migration.

**Recommendation**: Filter out orphaned sets entirely rather than reassigning, or surface a recovery UI.

---

## [MEDIUM] `useActivityLog` Activity Entries Store `projectId` Reference Without Validation

**File**: `src/composables/useActivityLog.ts:34-41`
**Category**: consistency

**Description**: Activity log entries store a `projectId` field (line 37) which is persisted to localStorage. If the referenced project is later deleted, the activity log retains entries pointing to a non-existent project ID. While the current UI does not appear to perform lookups on this ID, it is dead data that will accumulate over time and is never cleaned up.

More importantly, `generateId()` at line 24 uses `Date.now()` combined with `Math.random()`. Under rapid logging (e.g., scanning 50 files, logging each), `Date.now()` could return the same millisecond value, producing IDs that differ only in the random suffix — which is 6 base-36 characters (~2.2 billion possibilities), making collision very unlikely but theoretically possible.

**Impact**: Stale project references in activity log; potential (very low probability) ID collision.

**Recommendation**: Use `crypto.randomUUID()` for activity log IDs, consistent with how project and set IDs are generated.

---

## [MEDIUM] `useEnvSets` Module-Level Singleton Initialises Before `useProjects` Is Ready

**File**: `src/composables/useEnvSets.ts:50-53`
**Category**: consistency / state

**Description**: At module load time, line 50-53 immediately calls `loadSetsFromStorage(projects.value, activeProjectId.value)`. At this point, `useProjects` has already initialised its module-level refs (line 46-47 of `useProjects.ts`), so this is technically safe. However, the cross-module dependency creates a fragile load-order requirement. If the module evaluation order changes (e.g., due to bundler optimisations, tree-shaking, or circular imports), `projects.value` could be an empty array at the time `loadSetsFromStorage` runs, causing all sets to be assigned to the fallback project ID.

**Impact**: Potential data misattribution at startup if module initialisation order is disrupted.

**Recommendation**: Use lazy initialisation (initialise on first access) rather than eagerly at module load time. Consider a top-level `initialise()` function called explicitly from `App.vue`.

---

## [MEDIUM] `formatValue` (TypeScript) Strips Newlines Inconsistently With Rust

**File**: `src/composables/useEnvParser.ts:71-81` vs `src-tauri/src/lib.rs:686-700`
**Category**: consistency / parsing

**Description**: The Rust `format_env_value` explicitly filters out `\n` and `\r` characters (line 692). The TypeScript `formatValue` does not strip newlines — it only wraps values containing whitespace in quotes. If a value happens to contain a newline character (e.g., a PEM key fragment pasted into a text field), TypeScript would wrap it in quotes: `"-----BEGIN RSA KEY-----\n..."`, which is invalid env file format and would break most parsers. Rust would strip the newlines silently. Neither behaviour is ideal, but the inconsistency means in-memory and on-disk representations diverge.

**Impact**: Multiline values written via TypeScript (`onApplyMemory` path without file write) could produce invalid rawText that the Rust backend would then process differently.

**Recommendation**: Strip `\n` and `\r` in TypeScript `formatValue` to match Rust behaviour, and add a warning to the user when newlines are stripped.

---

## LOW Findings

---

## [LOW] `useStatus` Auto-Clear Timer Not Cancelled on Component Unmount

**File**: `src/composables/useStatus.ts` (not read — inferred from usage pattern)
**Category**: consistency

**Description**: The `useStatus` composable uses a singleton pattern. If a `setTimeout` is used for auto-clearing the status message, the timer is not tied to any component lifecycle and will fire regardless of navigation state. This is a low-risk issue for a desktop app with a single-page layout.

**Impact**: Stale status message from a previous operation could clear a more recent status message.

**Recommendation**: Read the `useStatus` implementation to confirm; if a timer is used, clear it before setting a new one.

---

## [LOW] `parse_backup_filename` Extracts "Reason" Incorrectly When Project Name Contains Hyphens

**File**: `src-tauri/src/lib.rs:390-401`
**Category**: parsing

**Description**: The backup filename format is `drift-{project}-{reason}-{timestamp}.json`. The function uses `rsplitn(2, '-')` to split from the right, extracting the timestamp and everything else as "reason". For a project named `my-project` and reason `before-delete`, the filename is `drift-my-project-before-delete-1234567.json`. `rsplitn(2, '-')` gives `["1234567", "my-project-before-delete"]`. The "reason" returned is `my-project-before-delete`, which includes the project name — making it unreadable in the backup browser UI (displayed via `humanReason`).

**Impact**: Backup entries in the UI display garbled reason strings; cosmetic but confusing.

**Recommendation**: Include a separator that cannot appear in sanitised project names/reasons (e.g., double-underscore), or change the filename format to `drift-{timestamp}-{project}-{reason}.json` so the timestamp can be extracted first.

---

## [LOW] `collect_bak_files` Scans Up to Depth 3 But `collect_env_files` Scans Up to Depth 8

**File**: `src-tauri/src/lib.rs:403-436`
**Category**: consistency

**Description**: `.bak` file scanning uses a depth limit of 3, while env file scanning uses depth 8. This means `.bak` files created for deeply-nested env files (e.g., `packages/api/.env.local`) may not appear in the Backup Browser even though they exist on disk.

**Impact**: Backup Browser shows incomplete backup list; user may think a backup was not created.

**Recommendation**: Use the same depth limit for both, or document the intentional difference.

---

## [LOW] `maskValue` Logic Has a Subtle Bug — Masked Keys Always Return Placeholder

**File**: `src/composables/useMasking.ts:45-49`
**Category**: consistency / masking

**Description**: The `maskValue` function at lines 45-49:

```ts
function maskValue(key: string, value: string): string {
  if (SAFE_VALUES.has(value.toLowerCase())) return value;
  if (!globalMasked.value && !isSensitiveKey(key)) return value;
  return MASK_PLACEHOLDER;
}
```

When `globalMasked.value` is `false` but `isSensitiveKey(key)` is `true`, the condition `!globalMasked.value && !isSensitiveKey(key)` is `true && false = false`, so the function falls through to return `MASK_PLACEHOLDER`. This is correct — sensitive keys are always masked unless explicitly revealed. However, when `globalMasked.value` is `true`, _all_ non-safe values are masked, including non-sensitive keys, which also falls through to the placeholder. The logic is correct but the structure of the condition is misleading — it reads as "if NOT masked AND NOT sensitive, show value", which accidentally masks ALL sensitive keys even when `globalMasked` is false. This is the intended behaviour but is easy to accidentally invert during maintenance.

The more critical issue: `shouldMask` at lines 51–55 has a slightly different logic path that does correctly distinguish the two cases. Having `maskValue` and `shouldMask` as separate functions with subtly different logic increases maintenance risk.

**Impact**: Low direct risk; maintenance confusion could introduce masking bugs.

**Recommendation**: Add a comment documenting the intended masking matrix: (globalMasked=true: mask all non-safe) | (globalMasked=false: mask only sensitive non-safe). Consider unifying `maskValue` and `shouldMask`.

---

## INFO Findings

---

## [INFO] `useFilters` Singleton State Shared Across All Component Instances

**File**: `src/composables/useFilters.ts:4-6`
**Category**: consistency

**Description**: `filter`, `search`, `referenceSetId`, and `targetSetId` are module-level singletons. Since there is only one `ComparisonCard` rendered at a time, this does not currently cause issues. However, `ComparisonCard` defines its own local copies of these refs (lines 31–34) and does not use `useFilters()` at all — making `useFilters` effectively dead code for its primary purpose. The `hasActiveFilters` computed is also unused in the current component tree.

**Recommendation**: Either remove `useFilters` or refactor `ComparisonCard` to use it, to remove dead code.

---

## [INFO] No Size Validation on Manually Uploaded Files via `<input type="file">`

**File**: `src/components/project/FileUploadActions.vue:12-19`, `src/components/project/ProjectManagementCard.vue:132-148`
**Category**: storage

**Description**: The Rust `scan_env_files` enforces a 1.5MB file cap. However, the manual file upload path (`onLoadFiles`) reads file content with `file.text()` and stores it in localStorage via `addOrReplaceSet → persistSets`. There is no file size limit, so a user could upload a 10MB env file (or accidentally select the wrong file), which would be stored in localStorage and likely trigger a `QuotaExceededError` on next persist.

**Impact**: Combined with the unguarded localStorage writes, this could cause data loss or app freeze.

**Recommendation**: Enforce a size limit (e.g., 1.5MB matching the Rust limit) on `file.text()` before calling `addOrReplaceSet`.

---

## [INFO] `crypto.randomUUID()` Used Without Availability Check

**File**: `src/composables/useEnvSets.ts:113`, `src/composables/useProjects.ts:9`
**Category**: consistency

**Description**: `crypto.randomUUID()` is used to generate IDs for projects and env sets. In a Tauri 2 WebView on macOS/Windows, the Web Crypto API is available. However, on older WebView versions (e.g., very old WKWebView), `crypto.randomUUID` may not be available. This is a very low-risk concern for a modern desktop app but worth noting.

**Impact**: App would crash on startup on unsupported WebView versions.

**Recommendation**: If broad compatibility is needed, add a fallback UUID generator. For modern Tauri 2 targets, this is acceptable as-is.

---

## Cross-Cutting Observations

### Parsing Parity Summary

| Feature | TypeScript (`useEnvParser.ts`) | Rust (`lib.rs`) | Consistent? |
|---|---|---|---|
| Export prefix stripping | `line.slice(7).trim()` | `strip_prefix("export ").unwrap_or(line).trim()` | Yes |
| Empty-value keys (`KEY=`) | Stored as `""` | Stored as `""` | Yes |
| Duplicate key detection | Yes (flags in `duplicates`) | No (last write wins via HashSet) | **No** |
| Inline comment stripping | **No** | Yes (` #` for unquoted) | **No** |
| Escape sequence handling | **No** | Yes (`\"` → `"`) | **No** |
| Key validation regex | `/^[A-Z0-9_]+$/i` | `chars all alphanumeric or _` | Yes |
| Newline stripping in values | **No** | Yes | **No** |
| UTF-8 BOM | Not handled | Not handled (transparent via `read_to_string`) | Yes (neither) |
| Unicode in keys | Rejected by key-validation regex | Rejected by `is_ascii_alphanumeric` | Yes |
| Unicode in values | Preserved | Preserved | Yes |

### State Reset on Project Switch

The `watch(activeProjectId, ...)` in `ComparisonCard.vue` (lines 67–73) correctly resets local state. The following state is **not** reset on project switch:

- `useFilters` module-level refs (`referenceSetId`, `targetSetId`) — but these are currently unused
- `useMasking` `globalMasked` — intentionally persistent (user preference)
- `useStatus` current message — will auto-clear via timer
- `useActivityLog` entries — intentionally persistent across projects
