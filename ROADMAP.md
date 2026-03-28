# Drift Roadmap

Desktop app for managing Laravel `.env` configuration drift across projects and environments.

## Completed

### [Quality] Fix path traversal vulnerability in write commands
- **Priority:** P1 (critical)
- **Size:** S (< 1hr)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-19
- **Description:** The February 2026 security audit identified that write commands accept arbitrary file paths without confinement, meaning a crafted request could overwrite system files outside the project directory. All file write operations must be sandboxed to the registered project directory to prevent this class of vulnerability.
- **Acceptance criteria:**
  - All write commands validate that the resolved target path is within the project's registered directory
  - Path traversal attempts (e.g. `../../etc/passwd`) rejected with a clear error message
  - Symlink resolution checked to prevent symlink-based escape
  - Existing unit tests updated; new tests cover traversal and symlink edge cases

### [Quality] Fix Vue reactivity loss in env mutation composable
- **Priority:** P1 (critical)
- **Size:** S (< 1hr)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-19
- **Description:** The February 2026 audit identified a Vue reactivity regression where in-memory env key mutations silently lose reactivity, causing the comparison matrix to display stale data after edits. Users see their changes accepted but the UI does not update, undermining trust in the diff and comparison views. This was flagged alongside the diff algorithm and path traversal bugs as one of the remaining critical issues.
- **Acceptance criteria:**
  - In-memory env key upsert triggers reactive updates in all dependent computed properties
  - Comparison matrix refreshes immediately after any env mutation
  - No stale data visible after sequential edits to the same env set
  - Reactive chain verified: mutation → computed → template render

### [Quality] Resolve temp file contention during concurrent write operations
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-19
- **Description:** The February 2026 audit found that concurrent write operations (e.g. patching multiple env files in quick succession) can produce corrupted output due to temp file contention — multiple operations sharing the same temp file path. This is a data integrity risk: users patching several files at once could silently lose writes or produce malformed env files.
- **Acceptance criteria:**
  - Each write operation uses a unique temp file path (e.g. UUID-suffixed or atomically created)
  - Concurrent writes to different env files complete without data corruption
  - Temp files cleaned up after successful write or on error
  - Backup creation still functions correctly with unique temp paths

### [Quality] Fix diff algorithm producing incorrect write previews
- **Priority:** P1 (critical)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** The semantic line comparison uses an O(n^2) algorithm that produces incorrect diff previews before writes. Users see a preview that does not match what will actually be written to disk, which fundamentally undermines trust in the tool's core operation. The diff must be correct and performant.
- **Acceptance criteria:**
  - Diff preview exactly matches the result that would be written to disk
  - Algorithm replaced with a correct, efficient implementation (e.g. Myers diff)
  - Preview rendering tested against known input/output pairs (at least 10 cases)
  - Performance acceptable for .env files up to 500 lines
  - Concurrent write collision bug (temp file contention) also addressed

### [UX/UI] Add env file change notifications and auto-reload
- **Priority:** P2 (important)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** When a developer edits an `.env` file outside of Drift (e.g. in their editor or via deployment scripts), the app's in-memory state becomes stale without any indication. File system watching with automatic or prompted reload would keep the comparison matrix accurate and prevent users from acting on outdated data.
- **Acceptance criteria:**
  - File system watcher monitors all registered `.env` files for changes
  - Toast notification appears when an external change is detected
  - User can choose to reload immediately or dismiss
  - Comparison matrix refreshes automatically after reload
  - Watcher debounced to handle rapid successive saves gracefully

### [Feature] Add environment variable grouping by service prefix
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Laravel .env files typically contain clusters of related variables sharing a prefix (DB_*, MAIL_*, AWS_*, REDIS_*, QUEUE_*). The comparison matrix currently shows all variables in a flat list, making it hard to visually scan related configuration. Auto-grouping by common prefixes with collapsible sections would help developers quickly locate and compare specific service configuration across environments.
- **Acceptance criteria:**
  - Variables auto-grouped by common prefixes (DB_, MAIL_, AWS_, REDIS_, CACHE_, QUEUE_, etc.)
  - Groups displayed as collapsible sections in the comparison matrix
  - Ungrouped variables shown in an "Other" section at the bottom
  - Group headers show count of variables and count of drift items within the group
  - Grouping can be toggled off to restore flat list view

### [Performance] Debounce and batch comparison matrix recalculations
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** The comparison matrix recalculates on every env mutation, filter change, and set addition. When users perform rapid sequential edits (patching multiple keys, toggling filters), this triggers redundant recalculations that can cause UI lag with large env files. Debouncing matrix recalculation and batching mutation triggers would keep the UI responsive during bulk editing sessions.
- **Acceptance criteria:**
  - Matrix recalculation debounced with a 150ms delay after the last trigger
  - Sequential mutations within the debounce window batched into a single recalculation
  - No visible staleness — matrix always reflects the final state within 200ms of the last change
  - Filter changes and env mutations share the same debounce pipeline
  - Performance measurably improved for .env files with 100+ keys

### [Innovation] Add cross-environment value drift analysis with smart suggestions
- **Priority:** P3 (nice-to-have)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Drift currently shows which keys are missing across environments but does not analyse the values themselves. Common drift patterns — a staging environment still pointing at a production database, a debug flag left enabled in production, or an API URL using HTTP instead of HTTPS — are invisible until they cause an incident. Analysing value patterns across environments and flagging suspicious drift would add an intelligence layer beyond simple key-presence comparison.
- **Acceptance criteria:**
  - Value analysis rules detect: production URLs in non-production envs, debug/testing flags in production-like envs, HTTP where HTTPS is expected, localhost references in non-local envs
  - Flagged values highlighted with warning badges in the comparison matrix
  - Each warning includes a description of the concern and suggested action
  - Rules configurable (enable/disable per rule, custom patterns)
  - Analysis runs automatically when env sets are loaded or refreshed

### [Feature] Generate .env.example template from existing env files
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Laravel projects conventionally include a .env.example file documenting all expected environment variables with placeholder values. Drift already parses and analyses env files across environments — generating a .env.example template from the union of all keys (with values replaced by descriptive placeholders or empty strings) would automate a tedious manual task and ensure the example file stays in sync with actual usage.
- **Acceptance criteria:**
  - "Generate .env.example" action available from the project toolbar or context menu
  - Template includes the union of all keys across all loaded env sets
  - Values replaced with descriptive placeholders (e.g. DB_PASSWORD=your_database_password)
  - Keys grouped by service prefix (matching the existing grouping feature's logic)
  - Output written to the project root as .env.example (with confirmation if file already exists)
  - Generated template includes comments indicating which environments define each key

### [Feature] Add env variable inline documentation from parsed .env comments
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Laravel .env files commonly include inline comments (lines starting with `#` or trailing `# comment` after values) that document the purpose, expected format, or valid options for each variable. Drift's parser currently strips these comments, losing valuable context that would help developers understand unfamiliar variables in the comparison matrix. Preserving comments and displaying them as tooltips or inline documentation on variable rows would turn the comparison matrix from a raw key-value grid into a self-documenting configuration reference.
- **Acceptance criteria:**
  - Env parser preserves line comments (`# comment above key`) and inline comments (`KEY=value # explanation`)
  - Comments displayed as tooltips on variable name hover in the comparison matrix
  - Comments from different env files shown with source file label when they differ
  - Comment preservation does not affect diff or patch operations (comments are display-only metadata)
  - Variables with documentation comments visually distinguished (subtle icon indicator)
  - Existing parser performance not degraded by comment extraction

### [UX/UI] Add quick-copy value action between environment columns in the comparison matrix
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** When reviewing drift between environments, the most common corrective action is copying a value from one environment to another — propagating a production URL to staging, or syncing a configuration flag across local and testing. Currently users must note the value, navigate to the target env file, find the key, and edit it. A single-click copy action on each cell in the comparison matrix (click to copy value to clipboard, or drag to copy value to an adjacent column's cell) would make the most frequent drift resolution a one-step operation instead of a multi-step context switch.
- **Acceptance criteria:**
  - Each value cell in the comparison matrix shows a copy icon on hover
  - Click copies the value to the system clipboard with a brief success toast
  - Right-click context menu offers "Copy to [environment name]" for each other loaded environment
  - "Copy to" action updates the target env file via the existing upsert command (with backup)
  - Copy action respects the diff preview workflow (shows preview before writing)
  - Keyboard shortcut (Cmd+C) copies the focused cell's value

### [Quality] Add .env file syntax validation with line-level error reporting on import
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-21
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Drift's env parser silently accepts malformed .env files — unquoted values containing spaces, invalid variable names (starting with numbers, containing special characters), duplicate keys, and encoding issues produce unexpected comparison results without any warning. Validating .env syntax on load and highlighting problematic lines in the UI would catch configuration errors at the point of import rather than letting them silently corrupt the comparison matrix.
- **Acceptance criteria:**
  - .env files validated on load for: valid variable names, correct quoting, duplicate key detection, encoding consistency
  - Validation warnings displayed per-file with line numbers and descriptions
  - Warnings shown in a dismissible panel (not blocking — files still load with best-effort parsing)
  - Duplicate keys highlighted with "last value wins" annotation
  - Lines with syntax issues visually marked in the comparison matrix (if the file is loaded)
  - Validation suppressible per file for intentionally non-standard formats

### [Feature] Add env variable change history tracking across modifications
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** When Drift patches env files (appending missing keys or upserting values), there is no record of what the previous value was. During active environment management — syncing staging with production, rolling back a configuration change, investigating when a value diverged — developers need to know what changed and when. Tracking a per-key change history (previous value, new value, timestamp, which environment) in localStorage would turn the comparison matrix from a point-in-time view into a temporal audit trail, enabling value-level undo without needing full file backup restoration.
- **Acceptance criteria:**
  - Each upsert operation records: key name, previous value, new value, timestamp, target env file path
  - Change history viewable per-key via a tooltip or expandable row in the comparison matrix
  - History entries show relative timestamps ("2 hours ago") and absolute timestamps on hover
  - Maximum history depth configurable (default: 20 entries per key) to limit storage growth
  - "Revert to previous value" action available from the history view (triggers standard upsert with backup)
  - History persisted in localStorage alongside existing project data

### [UX/UI] Add keyboard shortcuts for comparison matrix navigation
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Every other app in the Tauri portfolio either has keyboard shortcuts implemented or planned, but Drift has none. Developers reviewing env drift across multiple projects need rapid matrix navigation — jumping between environments, expanding grouped variables, triggering patches. Currently all interaction requires mouse clicks, which breaks the flow during rapid triage sessions. Standard navigation shortcuts (arrow keys for cell navigation, Enter to edit, Cmd+S to save, Cmd+F to focus filter) would bring Drift's interaction speed in line with the portfolio standard.
- **Acceptance criteria:**
  - Arrow keys navigate between cells in the comparison matrix
  - Enter opens the inline drift editor for the focused cell
  - Escape closes the editor without saving
  - Cmd+F focuses the filter/search input
  - Cmd+S saves pending changes (triggers patch with backup)
  - All shortcuts documented in a help overlay (Cmd+/)
  - No conflicts with system-level macOS shortcuts

### [Quality] Add automatic backup file rotation with configurable retention
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** The Rust backend creates timestamped `.bak` files before every env file mutation (append and upsert operations), but there is no cleanup mechanism. Over weeks of active use — especially with frequent patching across multiple environments — backup files accumulate indefinitely in project directories, cluttering the file tree and consuming disk space. A configurable retention policy (keep last N backups per env file, default 5) with automatic cleanup after each new backup would prevent unbounded growth whilst maintaining a safety net for recent changes.
- **Acceptance criteria:**
  - After creating a new backup, older backups beyond the retention limit are deleted
  - Retention limit configurable per project (default: 5 backups per env file)
  - Only Drift-created `.bak` files targeted (identified by naming pattern, not arbitrary `.bak` files)
  - Deletion logged but not shown as toast (silent housekeeping)
  - Setting accessible from project configuration
  - Manual "clean up backups" action available in project settings for one-time cleanup

### [Quality] Add secret value detection warning in comparison matrix
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** The comparison matrix displays env variable values across environments without any sensitivity awareness. Values that look like API keys, database passwords, JWT secrets, or OAuth tokens are shown identically to innocuous configuration values like APP_NAME or LOG_LEVEL. When generating .env.example templates (existing roadmap item) or sharing screen during pair programming, sensitive values are exposed without warning. Detecting common secret patterns (high-entropy strings, known key prefixes like sk_, pk_, token_, password-like values) and flagging them with a visual indicator would help developers maintain security awareness during drift review sessions and prevent accidental exposure.
- **Acceptance criteria:**
  - Values matching common secret patterns flagged with a warning badge in the comparison matrix
  - Detection patterns include: high-entropy strings (> 20 chars, mixed case + digits + special), known prefixes (sk_, pk_, key_, secret_, token_), password/credential variable names
  - Flagged values optionally masked by default (click to reveal) — configurable in project settings
  - Masking state togglable globally via toolbar button ("Show/Hide secrets")
  - Secret detection rules configurable (enable/disable individual patterns)
  - Detection runs client-side only (no values sent to external services)

### [Feature] Add .env schema definition file support with type validation and required variable enforcement
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-23
- **Status:** completed
- **Completed:** 2026-03-28
- **Description:** The .env.example generator (completed) documents which variables exist, and the secret detection (completed) flags sensitive values, but neither enforces what a valid .env file should contain. A `.env.schema.json` definition file specifying expected types (string, integer, boolean, URL, email), required variables per environment, allowed values (enumerations), and format patterns (regex) would let Drift validate an env file against its schema on load — catching misconfigurations like a non-numeric value in a port field, a missing required variable in production, or an invalid URL format before they cause runtime failures.
- **Acceptance criteria:**
  - Schema definition file format (`.env.schema.json`) supporting: variable name, type (string, integer, boolean, url, email), required flag, allowed values (enum), pattern (regex), description
  - Schema validation runs on env file load when a schema file is present in the project root
  - Validation errors shown per-variable in the comparison matrix (inline warning badges)
  - "Generate schema" action creates a schema file from the current env file structure (types inferred from values)
  - Schema violations filterable in the comparison matrix (show only invalid variables)
  - Schema file format documented in a tooltip or help overlay

### [Quality] Add git-tracked .env change detection warning when env files have uncommitted modifications
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-24
- **Status:** completed
- **Completed:** 2026-03-28
- **Description:** When Drift patches env files (appending missing keys or upserting values), the resulting changes may not be committed to version control — especially for `.env.example` files that are tracked by git. Developers using Drift to resolve drift may fix the configuration issue but forget to commit the change, leaving a gap between the repository state and the running environment that persists across machine resets or fresh clones. The file watcher (completed) detects external changes, and the change history (completed) records value modifications, but neither checks version control status. A subtle "uncommitted changes" indicator on env files that differ from their last git-committed state would remind developers to commit configuration alongside code, reducing a common source of deployment drift.
- **Acceptance criteria:**
  - Env files that differ from their git-committed version display an "uncommitted" indicator in the comparison matrix header
  - Git status checked via `git diff --name-only` against the project root (existing registered path)
  - Indicator shown only for files that are tracked by git (untracked files like `.env` itself are excluded by convention)
  - Status check runs on env file load and after any Drift write operation (append, upsert)
  - No blocking behaviour — indicator is advisory only, displayed as a subtle badge on the file column header
  - Git check adds < 200ms to file load time (single shell command per project)

### [Performance] Add multi-project env file caching with modification-time invalidation for instant project switching
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-23
- **Status:** completed
- **Completed:** 2026-03-28
- **Description:** When switching between registered projects or refreshing the active project, Drift re-parses all `.env` files from disk even if they haven't changed since the last parse. For users managing 3-5 projects with 5+ env files each, this introduces perceptible latency on every project switch and manual refresh. Caching parsed `EnvSet` results keyed by file path and modification timestamp (`mtime`) — and invalidating only when the file's mtime changes — would make project switching and refresh effectively instantaneous for unchanged files. The existing file watcher (completed) already detects external changes; the cache invalidation can hook into the same detection path rather than requiring a separate check.
- **Acceptance criteria:**
  - Parsed env file results cached in memory keyed by file path and modification timestamp
  - Cache hit returns the previously parsed EnvSet without re-reading or re-parsing the file
  - Cache invalidated when the file watcher detects a change or when mtime differs from cached value
  - Project switching latency reduced to under 50ms for projects with unchanged env files
  - Cache cleared when a project is removed or when env files are added/removed
  - No increase in memory usage beyond the size of the parsed env data (already held in reactive state)

## Pending

### [Distribution] Add Tauri auto-updater with release notes display for seamless version delivery
- **Priority:** P2 (important)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-23
- **Status:** pending
- **Description:** Drift has no update mechanism — users must manually discover, download, and replace the application binary to get new versions. As Drift's feature set matures (multi-project dashboard pending, dependency analysis pending, format preservation pending), delivering fixes and improvements without manual intervention becomes important for maintaining user trust. Tauri's built-in updater plugin with a release notes panel would ensure users always run the latest version, matching the auto-updater items already planned for Grove, Fuse, and Amber. This is the only Distribution-category gap in Drift's pending roadmap.
- **Acceptance criteria:**
  - Tauri updater plugin configured with update endpoint and code signing
  - Update check on app launch with non-intrusive notification banner (not modal)
  - Release notes displayed in a panel before the user confirms installation
  - "Install now" and "Remind me later" options; deferred updates install on next launch
  - Current version and last update check timestamp visible in settings
  - Update progress indicator during download and installation

### [UX/UI] Add environment variable dependency annotations showing which variables reference each other
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-23
- **Status:** pending
- **Description:** Some environment variables are logically dependent — `DATABASE_URL` is composed from `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`; `REDIS_URL` references `REDIS_HOST` and `REDIS_PORT`; `APP_URL` affects `ASSET_URL` and `SESSION_DOMAIN`. When one variable in a dependency group changes, related variables may need updating too, but this relationship is invisible in the comparison matrix. Annotating known dependency patterns (auto-detected from common Laravel conventions and user-definable) and highlighting dependent variables when any member of a group is modified would prevent partial configuration updates that leave related variables inconsistent.
- **Acceptance criteria:**
  - Common Laravel dependency patterns auto-detected: DATABASE_URL ↔ DB_* components, REDIS_URL ↔ REDIS_* components, APP_URL → ASSET_URL/SESSION_DOMAIN
  - Dependency indicators displayed on variable rows in the comparison matrix (subtle link icon)
  - When a variable in a dependency group is modified, related variables highlighted with "check this too" badge
  - Custom dependency groups definable in project settings (for app-specific patterns)
  - Dependency view expandable from any variable row showing all related variables in the group
  - Dependencies are advisory only — no blocking of writes to partial groups

### [Feature] Add multi-project drift summary dashboard showing aggregate status across all registered projects
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-24
- **Status:** pending
- **Description:** Users managing .env drift across 3-5 Laravel projects must switch between projects one at a time to check their drift status — missing keys, value warnings, stale files. There is no aggregate view showing which projects need attention. A summary dashboard displaying each registered project with key metrics (total keys, missing key count, warning count, last modified timestamp) would let developers triage their project portfolio at a glance and focus on the project with the most urgent drift, rather than checking each one sequentially. This is especially valuable for developers maintaining multiple microservices or multi-environment deployments.
- **Acceptance criteria:**
  - Dashboard view accessible from the main navigation showing all registered projects
  - Per-project summary card displaying: project name, env file count, total unique keys, missing key count, drift warning count, last file modification time
  - Projects with drift issues highlighted with warning badges (amber for missing keys, red for value warnings)
  - Click on a project card navigates to that project's comparison matrix
  - Dashboard data computed from cached env file state (no file re-parsing on dashboard load)
  - "Refresh all" action re-scans all projects and updates the dashboard

### [Quality] Add .env file format preservation maintaining original comment positions, blank lines, and variable ordering during patch operations
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-24
- **Status:** pending
- **Description:** When Drift appends missing keys or upserts values, the Rust backend writes to .env files using a line-by-line approach that preserves existing key-value pairs but does not guarantee preservation of blank line separators between groups, comment positioning relative to the variables they document, or the original variable ordering within the file. The inline documentation feature (completed) parses comments for display, and the service prefix grouping (completed) organises the comparison matrix, but the write path may disrupt the careful formatting that developers maintain in their .env files — especially the blank-line separation between service groups (DB_, MAIL_, AWS_) that makes files human-scannable. Preserving the original file structure during mutations would prevent Drift from degrading the readability of the files it manages.
- **Acceptance criteria:**
  - Upsert operations preserve: blank lines between variable groups, comment lines above and inline with variables, original variable ordering
  - New keys appended at the end of the file (or within the correct service group if grouping is detectable) with appropriate blank-line separation
  - File encoding preserved (no BOM introduction or line-ending changes)
  - Backup files (existing feature) created before any format-altering write
  - Write output byte-identical to input for files where only values (not structure) change
  - Round-trip test: read → write without changes → file unchanged

### [Quality] Add unused environment variable detection identifying keys not referenced in application source code
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-24
- **Status:** pending
- **Description:** Drift shows drift between environment files — missing keys, value differences, suspicious patterns — but cannot tell whether an environment variable is actually used by the application. Over time, .env files accumulate legacy variables from removed features, deprecated integrations, and copied-from-example defaults that serve no purpose. Scanning the project's source code for common environment access patterns (Laravel's `env()` and `config()` calls, Node's `process.env`, Python's `os.environ`) and flagging variables with no code reference would help developers clean up configuration debt and reduce confusion during drift analysis sessions. The existing project root path (already registered for env file scanning) provides the scope for source code search.
- **Acceptance criteria:**
  - "Detect unused" action available from the project toolbar or comparison matrix
  - Scans project source files (PHP, JS/TS, Python) for environment variable references using common patterns: `env('KEY')`, `process.env.KEY`, `os.environ['KEY']`, `getenv('KEY')`
  - Variables with no detected code reference flagged with "Potentially unused" badge in the comparison matrix
  - Unused variables filterable in the comparison matrix (show only unused, hide unused)
  - Scan excludes vendor/, node_modules/, .git/ directories (matching existing env file scan exclusions)
  - Results are advisory only — no automatic deletion or modification of env files
  - Scan completes within 5 seconds for typical Laravel projects (< 5000 source files)

### [Innovation] Add environment configuration health score grading each project's env hygiene at a glance
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-24
- **Status:** pending
- **Description:** Drift surfaces individual issues — missing keys, suspicious values, stale files, syntax warnings — but there is no aggregate measure of a project's environment configuration health. Developers managing 3-5 projects need to quickly answer "which project's env config needs attention?" without opening each one. A composite health score (0-100) per project, computed from key completeness across environments, value warning count, schema compliance (if schema exists, pending), secret exposure risk, and file freshness — displayed as a grade on project cards and in the multi-project dashboard (pending) — would make env health visible at a glance and prioritise remediation effort.
- **Acceptance criteria:**
  - Health score (0-100) computed per project from weighted factors: key completeness (30%), value warnings (25%), syntax validation (20%), secret masking coverage (15%), file freshness (10%)
  - Score displayed as a letter grade (A-F) and numeric value on project cards
  - Grade breakdown viewable per project showing contribution of each factor
  - Factors linked to existing features: completeness from key analysis, warnings from drift detection (completed), syntax from validation (completed), secrets from detection (completed)
  - Score updates automatically when env files are loaded or refreshed
  - Health score included in the multi-project dashboard summary cards (pending item)

### [UX/UI] Add comparison matrix column reordering for custom environment priority layouts
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-24
- **Status:** pending
- **Description:** The comparison matrix displays environment columns in the order env files were loaded or scanned, which may not match the logical promotion order (local → testing → staging → production) that developers use when reviewing drift. When comparing 4+ environments, column order matters for visual scanning — the eye naturally reads left-to-right, and having production next to local with staging in between creates a confusing comparison layout. Drag-and-drop column reordering with persistence per project would let users arrange environments in their preferred comparison order, making the matrix instantly scannable for the most common drift pattern: "what's different between my local and production?"
- **Acceptance criteria:**
  - Environment columns in the comparison matrix reorderable via drag-and-drop on column headers
  - Column order persisted per project in localStorage alongside existing project data
  - Default order: load order (current behaviour preserved for users who don't customise)
  - "Reset order" action available to restore default ordering
  - Column reordering does not affect any functional behaviour (filtering, patching, value copying)
  - Reorder state preserved when env files are reloaded (matched by file name, not position)

### [Feature] Add env drift resolution summary export generating Markdown changelogs for team communication
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-24
- **Status:** pending
- **Description:** After resolving drift across environments — patching missing keys, syncing values, updating stale configuration — there is no structured way to communicate what changed to teammates or include the changes in a commit message or PR description. The change history feature (completed) records per-key modifications, and the .env.example generator (completed) documents the expected variable set, but neither produces a shareable summary of a drift resolution session. A "Copy resolution summary" action generating a Markdown table showing which keys were added, changed, or synced across which environments — with before/after values for non-secret keys — would integrate Drift's output into team communication workflows (Slack messages, PR descriptions, commit messages, deployment notes).
- **Acceptance criteria:**
  - "Copy summary" action available from the comparison matrix toolbar after any patch or upsert operation
  - Summary includes: keys added (with target environment), keys changed (with before/after values), environments affected
  - Secret values (detected by the existing secret detection feature, completed) masked in the summary output
  - Summary formatted as GitHub-flavoured Markdown (table + bullet list sections)
  - Copy-to-clipboard and save-to-file options
  - Summary scope: current session's changes only (since last app launch or manual reset)

### [UX/UI] Add environment file drag-and-drop import for temporary comparison against external .env files
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-24
- **Status:** pending
- **Description:** When debugging environment issues with a colleague, developers frequently receive .env files via Slack, email, or airdrop that they need to compare against their project's environment configurations. Currently, the received file must be saved into the project directory and scanned alongside the existing env files — polluting the project structure with a temporary file that must be cleaned up afterwards. Supporting drag-and-drop of an external .env file onto the comparison matrix as a temporary, non-persisted column would streamline ad-hoc comparison without modifying the project's file structure, matching the transient investigation workflow that real-world debugging demands.
- **Acceptance criteria:**
  - Drag-and-drop of a .env file onto the comparison matrix adds it as a temporary column with a distinct "imported" visual style
  - Temporary columns clearly labelled with the source filename and a "remove" action
  - Temporary env sets parsed using the existing parser (inheriting syntax validation, comment extraction, and secret detection)
  - Temporary columns participate in all comparison features: drift detection, value copying, grouping, filtering
  - Temporary columns not persisted — removed on app restart or when explicitly dismissed
  - Multiple temporary columns supported for comparing several external files simultaneously

## Design System Adoption

These items implement the @stuntrocket/ui design system to achieve premium visual uniformity across all Tauri applications. Items are ordered by dependency — foundation must complete before migration, migration before polish.

### [Foundation] Integrate @stuntrocket/ui shared component library and design tokens
- **Priority:** P1 (critical)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-25
- **Description:** Drift uses Vue 3 + Tailwind CSS 4 with its own dark glassmorphic design system. Adopting @stuntrocket/ui requires installing it from the local Verdaccio registry, replacing the existing @theme tokens with @stuntrocket/ui shared tokens, and switching from a dark-only design to a full light/dark mode system. The existing design has some overlap with @stuntrocket/ui (glassmorphism, blur effects) but the colour palette, typography (Poppins), and spacing scale need alignment.
- **Acceptance criteria:**
  - .npmrc configured with @stuntrocket:registry=http://localhost:4873
  - @stuntrocket/ui installed as a dependency
  - Existing @theme block in src/styles/main.css replaced with @stuntrocket/ui tokens.css import
  - Poppins font loaded as primary sans font (replacing system font stack)
  - Colour palette aligned: accent #60A5FA → @stuntrocket/ui accent #2563EB/#60A5FA with full light/dark tokens
  - Light mode added (Drift is currently dark-only; @stuntrocket/ui supports both)
  - Typography scale matches @stuntrocket/ui: body 15px, headings per styleguide

### [UI Migration] Replace existing components with @stuntrocket/ui shared components
- **Priority:** P1 (critical)
- **Size:** XL (8hrs+)
- **Added:** 2026-03-19
- **Status:** pending
- **Description:** Replace all existing design system components (GlassCard, BaseButton, BaseSelect, BaseInput, BaseTextarea, KpiCard) with @stuntrocket/ui equivalents. The comparison matrix, filter row, project management views, and inline drift editor all need to be rebuilt with shared components. This is the largest migration item and may need sub-tasks per component category.
- **Acceptance criteria:**
  - GlassCard → @stuntrocket/ui Card with correct surface/blur/shadow properties
  - BaseButton → @stuntrocket/ui Button (primary, secondary, icon variants)
  - BaseSelect → @stuntrocket/ui Select with custom chevron and focus styling
  - BaseInput → @stuntrocket/ui Input with correct border/focus behaviour
  - BaseTextarea → @stuntrocket/ui Textarea
  - KpiCard/KpiBar → @stuntrocket/ui stat card pattern
  - All modals use @stuntrocket/ui Modal pattern
  - All toasts use @stuntrocket/ui Toast with status colours
  - AmbientBackground component replaced with @stuntrocket/ui ambient blob pattern
  - No app-specific component files remain that duplicate @stuntrocket/ui equivalents

### [Polish] Achieve full @stuntrocket/ui styleguide visual conformance
- **Priority:** P2 (important)
- **Size:** L (3-8hrs)
- **Added:** 2026-03-19
- **Status:** pending
- **Description:** After component migration, apply the remaining @stuntrocket/ui specifications: correct ambient blob colours and animation timing, custom scrollbars, micro-animation timings, macOS titlebar integration, z-index layering, and accessibility compliance. The existing glassmorphic effects should be retained but aligned to @stuntrocket/ui's specific blur/opacity/shadow values.
- **Acceptance criteria:**
  - Ambient blobs use @stuntrocket/ui colours (accent, violet #8B5CF6, cyan #06B6D4)
  - Custom scrollbars with accent-tinted thumb (rgba accent values per styleguide)
  - Micro-animations match @stuntrocket/ui timing: instant 80ms, quick 100-130ms, standard 150ms, smooth 200ms
  - macOS titlebar with drag region and 78px traffic light padding
  - Z-index layering matches @stuntrocket/ui scale
  - prefers-reduced-motion disables all animations
  - Focus ring on all interactive elements
  - Light mode visually complete and polished (not just a dark mode inversion)
  - Visual side-by-side comparison with @stuntrocket/ui reference app passes review

## Archived

### [UX/UI] Add comparison matrix row pinning for keeping critical variables visible during scrolling
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-24
- **Archived:** 2026-03-24
- **Reason:** Low-impact UI convenience for a specific edge case (scrolling through 50+ variable lists). The service prefix grouping (completed) already provides structural organisation that reduces scrolling, and the filter/search infrastructure allows focusing on specific variables. Row pinning adds sticky positioning complexity without proportional benefit for the typical .env file size (20-40 variables). Revisit if users report friction with very large env files after grouping is in active use.

### [Distribution] Add portable project profile export for team env configuration sharing
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-21
- **Archived:** 2026-03-20
- **Reason:** Team sharing feature premature for a tool that is still single-user in practice. Drift needs to mature its core drift analysis and resolution workflow before adding distribution features. The .env.example generation item covers the most common team sharing need (documenting expected variables). Revisit when Drift has active multi-user adoption.
