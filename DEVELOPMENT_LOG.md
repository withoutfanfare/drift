# Drift Development Log

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
