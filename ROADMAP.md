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

## Pending

### [Quality] Fix diff algorithm producing incorrect write previews
- **Priority:** P1 (critical)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-19
- **Status:** pending
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
- **Status:** pending
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
- **Status:** pending
- **Description:** Laravel .env files typically contain clusters of related variables sharing a prefix (DB_*, MAIL_*, AWS_*, REDIS_*, QUEUE_*). The comparison matrix currently shows all variables in a flat list, making it hard to visually scan related configuration. Auto-grouping by common prefixes with collapsible sections would help developers quickly locate and compare specific service configuration across environments.
- **Acceptance criteria:**
  - Variables auto-grouped by common prefixes (DB_, MAIL_, AWS_, REDIS_, CACHE_, QUEUE_, etc.)
  - Groups displayed as collapsible sections in the comparison matrix
  - Ungrouped variables shown in an "Other" section at the bottom
  - Group headers show count of variables and count of drift items within the group
  - Grouping can be toggled off to restore flat list view

## Design System Adoption

These items implement the Scooda design system (derived from the Dalil app styleguide) to achieve premium visual uniformity across all Tauri applications. Items are ordered by dependency — foundation must complete before migration, migration before polish.

### [Foundation] Integrate @scooda/ui shared component library and design tokens
- **Priority:** P1 (critical)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-19
- **Status:** pending
- **Description:** Drift uses Vue 3 + Tailwind CSS 4 with its own "Spool" dark glassmorphic design system. Adopting the Scooda design system requires installing @scooda/ui from the local Verdaccio registry, replacing the Spool @theme tokens with Scooda shared tokens, and switching from a dark-only design to a full light/dark mode system. The Spool design has some overlap with Scooda (glassmorphism, blur effects) but the colour palette, typography (Poppins), and spacing scale need alignment.
- **Acceptance criteria:**
  - .npmrc configured with @scooda:registry=http://localhost:4873
  - @scooda/ui installed as a dependency
  - Spool @theme block in src/styles/main.css replaced with Scooda tokens.css import
  - Poppins font loaded as primary sans font (replacing system font stack)
  - Colour palette aligned: accent #60A5FA → Scooda accent #2563EB/#60A5FA with full light/dark tokens
  - Light mode added (Drift is currently dark-only; Scooda supports both)
  - Typography scale matches Scooda: body 15px, headings per styleguide

### [UI Migration] Replace Spool components with @scooda/ui shared components
- **Priority:** P1 (critical)
- **Size:** XL (8hrs+)
- **Added:** 2026-03-19
- **Status:** pending
- **Description:** Replace all Spool design system components (GlassCard, BaseButton, BaseSelect, BaseInput, BaseTextarea, KpiCard) with @scooda/ui equivalents. The comparison matrix, filter row, project management views, and inline drift editor all need to be rebuilt with shared components. This is the largest migration item and may need sub-tasks per component category.
- **Acceptance criteria:**
  - GlassCard → @scooda/ui Card with correct surface/blur/shadow properties
  - BaseButton → @scooda/ui Button (primary, secondary, icon variants)
  - BaseSelect → @scooda/ui Select with custom chevron and focus styling
  - BaseInput → @scooda/ui Input with correct border/focus behaviour
  - BaseTextarea → @scooda/ui Textarea
  - KpiCard/KpiBar → @scooda/ui stat card pattern
  - All modals use @scooda/ui Modal pattern
  - All toasts use @scooda/ui Toast with status colours
  - AmbientBackground component replaced with @scooda/ui ambient blob pattern
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
