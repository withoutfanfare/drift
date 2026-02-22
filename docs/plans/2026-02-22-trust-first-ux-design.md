# Trust-First UX Redesign

Date: 2026-02-22
Status: Approved

## Problem Statement

Drift works but has friction and trust gaps that undermine confidence:

- **First-run confusion** — new users don't know where to start
- **Too many manual steps** — six steps before seeing a comparison
- **Hard to see what changed** — transient status messages are the only feedback
- **Invisible file writes** — no preview of what will be written
- **No undo path** — backups exist but can't be viewed or restored from the app
- **Values visible in memory** — secrets displayed in plain text everywhere
- **No audit trail** — no history of actions taken

## Design Principle

Nothing happens to your files without you seeing exactly what will change first.

## 1. Diff Preview Panel

Replace the generic confirmation dialog for file write operations with a diff preview panel.

**When triggered:** Any file write action (patch missing keys, apply key to file via inline editor).

**What it shows:**
- Target file path
- Unified diff with green highlighting for additions, amber for modifications
- Count summary: "Will append 3 keys, skip 2 existing"
- Backup path that will be created
- Two actions: "Apply changes" and "Cancel"

**For inline editor upserts:** Simpler diff showing the single line being added or the before/after of the modified line.

**For in-app-only edits:** No diff preview (no file touched), but the change is logged in the activity timeline.

**Implementation:** Compute the diff client-side by comparing original content vs proposed content. The Rust backend already returns `updatedContent`, so the diff can be calculated before execution.

## 2. Activity Timeline

Persistent scrollable log of every meaningful action, replacing the transient status message as the durable record.

**Where it lives:** Collapsible section at the bottom of each page (or sidebar element on wider screens).

**What gets logged:**
- Project created/deleted/switched
- Env sets loaded (scan, file upload, manual, sample) with count
- Sets removed or cleared
- Drift analysis results (e.g. "Compared 4 sets: 12 missing, 3 drift, 1 unsafe")
- File writes (patch/upsert) with target path, keys affected, backup path
- In-app edits with key name and target set
- Template copies (missing/merged)
- Errors and failed operations

**Entry structure:**
- Relative timestamp ("2 min ago", "just now")
- Colour-coded action icon (blue for reads, amber for writes, red for destructive, green for success)
- One-line summary
- Expandable detail (list of keys patched, backup path, etc.)

**Storage:** In-memory for the current session, option to persist to localStorage per project. Capped at 200 entries per project, oldest trimmed.

**Relationship to status bar:** `useStatus` continues showing the most recent message as immediate feedback. The timeline is the durable record underneath.

## 3. Secret Masking

Global toggle to blur/reveal env values, defaulting to masked.

**Global toggle:** In the app header/titlebar area. Switches between masked and revealed values app-wide.

**Masking behaviour:**
- When masked, values display as `--------` in the comparison table, inline editor, and set previews
- Click a masked value to reveal it temporarily (reverts on blur or after a few seconds)
- Global toggle reveals/masks all values at once

**Smart masking heuristic:** Keys matching common secret patterns (`*_SECRET`, `*_KEY`, `*_PASSWORD`, `*_TOKEN`, `DB_*`, `AWS_*`, `STRIPE_*`) are flagged as sensitive:
- Stay masked even when global toggle is revealed, unless individually clicked
- Small lock icon on sensitive keys in the comparison table

**Not masked:** Key names (always visible), empty values, boolean-like values (`true`, `false`, `null`).

**localStorage:** Values remain stored in plain text. Masking is a visual protection layer against shoulder-surfing, not encryption.

## 4. Clear Language and Action Clarity

Rename abstract jargon to plain English that maps to what Laravel developers already know.

**Action renames:**

| Current | New |
|---|---|
| Copy missing-key template | **Copy missing keys** |
| Copy merged template | **Export combined .env** |
| Patch missing keys to target | **Add [N] missing keys to `[filename]`** |

**Terminology renames:**

| Current | New |
|---|---|
| Reference set | **Compare from** |
| Target set | **Compare to** / **Update** (in write context) |
| Env sets | **.env files** (where possible) |
| Role | **Environment** |
| Source: scan / file / manual | **Loaded by: folder scan / file picker / pasted** |

**Action buttons name the file, not the concept:**
Instead of "Patch missing keys to target", show:
> Add 3 missing keys to `.env.staging`

**Filter subtitles:**
- Drift: "values that differ across environments"
- Unsafe: "debug mode on, default credentials, etc."

## 5. Backup Browser

View, compare, and restore from backups without leaving the app.

**Where it lives:** Accessible from the Projects page (or sidebar).

**Discovery:** New Rust command `list_project_backups(project_root)` scans `.drift-backups/` and collects `.bak.*` files from scanned env file locations. Returns sorted newest-first.

**What it shows per entry:**
- Timestamp (human-readable: "Today at 09:14", "Yesterday at 16:32")
- Reason (before-delete-project, before-clear-project-sets, before-remove-set, file-patch, file-upsert)
- File affected (for `.bak` files) or set count (for JSON project backups)
- File size

**Actions per backup:**
- **View** — read-only panel showing backup content
- **Compare with current** — diff between backup and current file/set state
- **Restore** — copies backup content back to original path (creates its own backup first, so restore is reversible)
- **Reveal in Finder** — opens containing folder in OS file manager

**Cleanup:** No automatic deletion. Manual "Remove old backups" with confirmation dialog.

## 6. Auto-Scan and Reduced Manual Steps

Cut the setup flow from six steps to one.

**Auto-scan on project setup:** When a root path is set and saved, Drift immediately scans for `.env*` files. No separate scan step needed for first load.

**Auto-infer project name:** Wire up existing `infer_project_name` Rust command so the name field auto-fills when a root path is browsed/pasted. User can override.

**One-step project creation:** Browse for folder -> Drift fills name and scans -> Dashboard shows comparison. Projects settings becomes something you revisit to tweak, not the starting point.

**Re-scan stays:** Available as a refresh icon in the Environment Sets card header for when files change on disk. Not a prominent button suggesting it's a required step.

**Smart compare defaults:**
- **Compare from:** the set with the most keys (most complete environment)
- **Compare to:** the set detected as `local` environment (what you're typically fixing)
- Single set loaded: skip comparison view, show "Load another .env file to start comparing"

## 7. Smart First-Run and Contextual Empty States

Contextual empty states replace the Help page as the primary onboarding mechanism.

**Dashboard empty state (no project):**
> Pick a Laravel project to get started
> Browse to your project folder -- Drift will scan for .env files and show you what's missing, what's different, and what's unsafe across environments.
> `[Browse for project folder]`

**Dashboard empty state (project exists, no sets):**
> No .env files loaded for [Project Name]
> Drift found your project but hasn't scanned it yet.
> `[Scan for .env files]` `[Load files manually]`

**Dashboard empty state (one set):**
> Loaded .env -- add another to start comparing
> Drift needs at least two .env files to detect drift. Load your staging or production .env to see what's missing.
> `[Scan for more]` `[Load file]`

**Comparison table empty state (filters active, no matches):**
> No keys match this filter
> All keys are aligned for the current filter. Try "All" to see everything.

**Principles:**
- Every empty state has a single primary action
- Short text, "you/your" language, references Laravel concepts
- Empty states disappear completely once content loads
- Help page becomes a reference for power users, not the onboarding path
- Existing onboarding checklist stays on Help page as secondary resource
