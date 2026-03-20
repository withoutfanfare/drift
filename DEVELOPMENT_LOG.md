# Drift Development Log

## Cycle: 2026-03-20 23:45
- App: Drift
- Items completed:
  - [Quality] Fix diff algorithm producing incorrect write previews (P1/M) — the patch preview naively appended all "missing" entries without replicating the Rust backend's deduplication logic. Added `buildPatchPreview()` to useTemplates.ts that parses existing keys from the target's raw text (mirroring Rust's `parse_env_keys`), filters entries before building the preview, and uses `formatValue()` for consistent quoting. Fixed useDiff.ts to split on `/\r?\n/` instead of `"\n"` to handle Windows line endings. ComparisonCard.vue now uses the accurate preview and shows the actual count of keys that will be appended. Vitest installed and 19 frontend tests added covering preview accuracy, deduplication, quoting, Windows line endings, export-prefixed keys, and diff correctness. 9 new Rust tests added (15 total) covering parse_env_keys, append deduplication, value quoting, and Windows line endings.
- Items attempted but failed: none
- Branch: feature/fix-diff-preview
- Tests passing: yes (cargo test 15/15, vitest 19/19, cargo check clean, cargo clippy clean, vue-tsc clean)
- Build status: pending
- Notes: The core bug was that `requestPatch()` in ComparisonCard.vue built a preview by naively appending all entries from `getMissingEntries()`, while the Rust `append_missing_env_keys` backend re-parses the target file and skips entries whose keys already exist. This mismatch meant the preview could show additions the backend would skip. The Myers diff algorithm was already correct (implemented in a prior cycle) — the issue was the preview input, not the diff engine. The concurrent write collision criterion was already addressed in the 2026-03-19 cycle.

## Cycle: 2026-03-19 17:00
- App: Drift
- Items completed:
  - [Quality] Fix path traversal vulnerability in write commands — added `project_root` parameter to all write commands (`append_missing_env_keys`, `upsert_env_key`, `write_env_file`) with path confinement validation via `validate_env_path`. Canonicalises both target and project root, rejects targets outside the project directory. Symlink escape prevented via `fs::canonicalize`. 6 new Rust tests cover: valid path, external path, `../` traversal, symlink escape, non-env file rejection, and atomic write uniqueness.
  - [Quality] Fix Vue reactivity loss in env mutation composable — `applyRawToSet` was directly mutating properties on the set object passed in from a computed array. This bypassed Vue's array-level reactivity tracking, so `currentSets` (which depends on array structure, not deep properties) never re-computed, leaving `analysis` stale. Fixed by using `splice` to replace the entire element in the reactive array, which triggers array mutation tracking through the full computed chain.
  - [Quality] Resolve temp file contention during concurrent write operations — replaced nanosecond-timestamp nonce in `atomic_write` with a process-unique combination of `std::process::id()` and an `AtomicU64` counter. This guarantees unique temp file paths even for concurrent calls within the same nanosecond.
- Items attempted but failed: none
- Branch: feature/security-reactivity-fixes
- Tests passing: yes (6/6 Rust tests)
- Build status: success (Drift.app + DMG bundled)
- Notes: Frontend `useTauriCommands.ts` and `ComparisonCard.vue` updated to pass `activeProject.rootPath` through to all Rust write commands. The `tempfile` crate added as a dev-dependency for test isolation.
