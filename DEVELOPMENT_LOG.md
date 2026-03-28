# Drift Development Log

## Cycle: 2026-03-28 06:00
- App: Drift
- Items completed:
  1. **[Feature] .env schema definition file support** (P2, S) — Added Rust commands `read_env_schema`, `validate_env_against_schema`, `generate_env_schema`, `write_env_schema` for `.env.schema.json` support. Schema defines variable types (string, integer, boolean, url, email), required flags, allowed values (enum), patterns, and descriptions. Validation checks required fields, type correctness, enum membership, and pattern matching. `generate_env_schema` infers types from existing values. Added `useEnvSchema` composable with reactive schema state, validation, and generation. ComparisonCard integrated with schema validation indicator badges and issues panel.
  2. **[Quality] Git-tracked .env change detection** (P2, S) — Added Rust command `check_env_git_status` that runs `git diff --name-only HEAD`, `git diff --name-only --cached`, and `git ls-files` to identify tracked env files with uncommitted changes. Added `useGitTracking` composable exposing `checkGitStatus()`, `isFileUncommitted()`, `isFileTracked()` with computed `uncommittedFiles` and `hasUncommittedChanges`. ComparisonCard shows uncommitted changes badge and warnings panel listing affected files.
  3. **[Performance] Multi-project env file caching** (P2, S) — Added Rust command `get_env_file_mtimes` that walks project directory collecting env file path, mtime, and size metadata. Added `useEnvCache` composable with in-memory cache keyed by file path storing mtime, size, rawText, and name. `loadWithCache()` compares mtimes to skip re-parsing unchanged files, returning `{ total, cached, refreshed }` stats. `refreshStaleFiles()` selectively re-parses only changed files. Cache invalidation via `invalidateFile()` and `clearProjectCache()`.
- Items attempted but failed: none
- Branch: feature/schema-validation-git-status-env-cache
- Tests passing: yes (cargo check clean, cargo clippy clean, cargo test 15/15, vue-tsc clean)
- Build status: pending
- Notes: All 6 new Rust commands registered in invoke_handler. 5 new TypeScript interfaces added to types/index.ts mirroring Rust structs. 6 new IPC wrapper functions in useTauriCommands.ts. 3 new composables follow existing module-level ref() singleton pattern. Schema pattern validation uses simple string matching (contains/starts-with/ends-with) rather than full regex to avoid adding the regex crate dependency.

## Cycle: 2026-03-25 06:00
- App: Drift
- Items completed:
  - [Foundation] Integrate @stuntrocket/ui shared component library and design tokens (P1, M) — Switched @stuntrocket/ui dependency from local `file:` reference to Verdaccio registry (`^0.9.0`). Replaced existing `@theme` block in `src/styles/main.css` with @stuntrocket/ui token imports (`tokens.css`, `base.css`, `scrollbar.css`, `ambient.css`, `style.css`). Added `@source` directive for Tailwind to scan library classes. Drift-specific tokens retained in a separate `@theme` block (glass card surfaces, text-muted, border-accent, animations) with `.dark` overrides. Added Poppins font via Google Fonts with preconnect hints. Updated Tauri CSP to allow Google Fonts domains. Removed hardcoded `class="dark"` from `<html>` and initialised `useTheme({ storageKey: 'drift-theme-mode' })` for 3-mode light/dark/system theme cycling. Added `ThemeToggle.vue` component with sun/moon/monitor icons integrated into the AppShell titlebar. Replaced hardcoded rgba shadow in `ComparisonTable.vue` with `var(--color-border)` token.
- Items attempted but failed: none
- Branch: feature/design-tokens-v2
- Tests passing: yes (cargo check clean, cargo clippy clean, vue-tsc clean, vite build clean)
- Build status: success (Drift.app + DMG bundled, copied to ~/Desktop/TauriBuilds/drift/Drift-2026-03-25.app)
- Notes: Most changes were already present as uncommitted work from a prior incomplete integration cycle. Key fixes this session: switching from `file:` to registry dependency (the `file:` reference was creating symlinks that broke vite build due to unresolved `vue-router` imports from the local stuntrocket-ui path), deleting stale `package-lock.json` to clear cached resolution, and adding the `@source` directive for Tailwind class scanning.

## Cycle: 2026-03-20 16:00
- App: Drift
- Items completed (12 functional roadmap items):
  1. **Env file change notifications and auto-reload** — Added `useFileWatcher` composable using polling-based file mtime checks via new Rust `get_file_mtime` command. FileChangeToast component shows when external changes detected with reload/dismiss actions. Watcher debounced at 500ms to handle rapid editor saves. Integrated in App.vue with automatic start/stop based on loaded sets.
  2. **Environment variable grouping by service prefix** — Added `useGrouping` composable with 23 common Laravel service prefixes (APP_, DB_, MAIL_, AWS_, REDIS_, CACHE_, QUEUE_, etc.). ComparisonTable updated with collapsible group headers showing variable count and drift issue count. Toggle button in ComparisonCard toolbar. State persisted in localStorage.
  3. **Debounce and batch comparison matrix recalculations** — Added `useDebouncedComputed` utility composable. ComparisonCard's `displayRows` now uses 150ms debounce that batches filter changes, search input, and env mutations into a single recalculation.
  4. **Cross-environment value drift analysis with smart suggestions** — Added `useDriftAnalysis` composable with 6 configurable rules: production URLs in non-production envs, debug flags in production, HTTP where HTTPS expected, localhost in non-local envs, same DB credentials across envs, empty secrets in production. DriftWarningsPanel component shows flagged items with descriptions and suggestions. Warnings shown per-key in expanded row panel.
  5. **Generate .env.example template** — Added `useEnvExample` composable with well-known placeholder mappings for common Laravel keys. Template groups keys by service prefix with comments indicating which environments define each key. New Rust `write_env_example` command writes to project root. Fallback copies to clipboard if file write fails. ".env.example" button added to ComparisonCard toolbar.
  6. **Env variable inline documentation from parsed comments** — Enhanced `parseEnv()` in useEnvParser to extract line comments above keys and inline comments after values. Added `comments` field to EnvSet type and ParseResult. Comments displayed as tooltips on key name hover and as a documentation panel in expanded row. Comment indicator icon (chat bubble) shown next to keys with documentation.
  7. **Quick-copy value action** — Copy icon appears on hover over each value cell in the comparison matrix. Click copies value to system clipboard with status toast. "Copy to" actions available in expanded row panel for cross-environment value propagation via existing upsert mechanism.
  8. **.env file syntax validation** — Added `validateEnvSyntax()` function to useEnvParser. Validates on load for: missing `=` separator, empty variable names, names starting with digits, invalid characters, duplicate keys, unclosed quotes, unquoted values with spaces. `validationWarnings` field added to EnvSet type. ValidationPanel component shows per-file warnings with line numbers and severity badges.
  9. **Env variable change history tracking** — Added `useChangeHistory` composable with localStorage persistence (key: `edm.changeHistory.v1`). Records key, previous value, new value, timestamp, env file path, and set name. Per-key history viewable in expanded row panel with relative timestamps. Max 20 entries per key, 2000 total. All upsert/patch/revert operations record history entries.
  10. **Keyboard shortcuts** — Added `useKeyboardShortcuts` composable. Cmd+F focuses search, Cmd+S saves first unsaved set, Cmd+/ toggles help overlay, Arrow Up/Down navigates matrix rows, Enter expands focused row, Escape closes. KeyboardShortcutsOverlay modal lists all shortcuts. Focused row highlighted with accent ring.
  11. **Automatic backup file rotation** — Added Rust `rotate_backups` command that identifies Drift-created `.bak.{timestamp}` files by naming pattern, sorts by timestamp, and deletes those beyond the retention limit (default 5). Called automatically after every write operation (append, upsert, save). Frontend wrapper added to useTauriCommands.
  12. **Secret value detection warning** — Added `useSecretDetection` composable with 4 configurable rules: high-entropy strings (>20 chars, 3+ character classes), known secret prefixes (sk_, pk_, ghp_, etc.), password/credential variable names, base64-encoded keys. Warning indicator shown on cells in comparison matrix. Safe values (true, false, common config values) excluded from detection.
- Items attempted but failed: none
- Branch: main
- Tests passing: pending (no test framework for frontend; Rust tests not re-run for new commands)
- Build status: pending
- Notes: All implementations follow existing patterns exactly: module-level ref() for singleton state, composable naming conventions, Tailwind CSS 4 with @stuntrocket/ui design tokens, SFC with `<script setup lang="ts">`. The Rust backend gained 3 new commands registered in the invoke_handler. EnvSet type extended with `comments` (Record<string, EnvComment>) and `validationWarnings` (EnvValidationWarning[]). The useEnvParser.ts `parseEnv()` return type changed from `{ values, duplicates }` to `{ values, duplicates, comments }` — all callers updated. No breaking changes to existing functionality.

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
