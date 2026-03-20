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

## Pending

_No pending functional items._

## Design System Adoption

These items implement the Scooda design system (derived from the Dalil app styleguide) to achieve premium visual uniformity across all Tauri applications. Items are ordered by dependency — foundation must complete before migration, migration before polish.

### [Foundation] Integrate @stuntrocket/ui shared component library and design tokens
- **Priority:** P1 (critical)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-19
- **Status:** pending
- **Description:** Drift uses Vue 3 + Tailwind CSS 4 with its own "Spool" dark glassmorphic design system. Adopting the Scooda design system requires installing @stuntrocket/ui from the local Verdaccio registry, replacing the Spool @theme tokens with Scooda shared tokens, and switching from a dark-only design to a full light/dark mode system. The Spool design has some overlap with Scooda (glassmorphism, blur effects) but the colour palette, typography (Poppins), and spacing scale need alignment.
- **Acceptance criteria:**
  - .npmrc configured with @stuntrocket:registry=http://localhost:4873
  - @stuntrocket/ui installed as a dependency
  - Spool @theme block in src/styles/main.css replaced with Scooda tokens.css import
  - Poppins font loaded as primary sans font (replacing system font stack)
  - Colour palette aligned: accent #60A5FA → Scooda accent #2563EB/#60A5FA with full light/dark tokens
  - Light mode added (Drift is currently dark-only; Scooda supports both)
  - Typography scale matches Scooda: body 15px, headings per styleguide

### [UI Migration] Replace Spool components with @stuntrocket/ui shared components
- **Priority:** P1 (critical)
- **Size:** XL (8hrs+)
- **Added:** 2026-03-19
- **Status:** pending
- **Description:** Replace all Spool design system components (GlassCard, BaseButton, BaseSelect, BaseInput, BaseTextarea, KpiCard) with @stuntrocket/ui equivalents. The comparison matrix, filter row, project management views, and inline drift editor all need to be rebuilt with shared components. This is the largest migration item and may need sub-tasks per component category.
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
  - No Spool-specific component files remain

### [Polish] Achieve full Scooda styleguide visual conformance
- **Priority:** P2 (important)
- **Size:** L (3-8hrs)
- **Added:** 2026-03-19
- **Status:** pending
- **Description:** After component migration, apply the remaining Scooda specifications: correct ambient blob colours and animation timing, custom scrollbars, micro-animation timings, macOS titlebar integration, z-index layering, and accessibility compliance. The existing glassmorphic effects should be retained but aligned to Scooda's specific blur/opacity/shadow values rather than Spool's.
- **Acceptance criteria:**
  - Ambient blobs use Scooda colours (accent, violet #8B5CF6, cyan #06B6D4) not Spool palette
  - Custom scrollbars with accent-tinted thumb (rgba accent values per styleguide)
  - Micro-animations match Scooda timing: instant 80ms, quick 100-130ms, standard 150ms, smooth 200ms
  - macOS titlebar with drag region and 78px traffic light padding
  - Z-index layering matches Scooda scale
  - prefers-reduced-motion disables all animations
  - Focus ring on all interactive elements
  - Light mode visually complete and polished (not just a dark mode inversion)
  - Visual side-by-side comparison with Dalil passes review

## Archived

### [Distribution] Add portable project profile export for team env configuration sharing
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-21
- **Archived:** 2026-03-20
- **Reason:** Team sharing feature premature for a tool that is still single-user in practice. Drift needs to mature its core drift analysis and resolution workflow before adding distribution features. The .env.example generation item covers the most common team sharing need (documenting expected variables). Revisit when Drift has active multi-user adoption.
