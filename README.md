# Drift

A Tauri 2 desktop app for Laravel developers to manage `.env` file sets across projects, detect environment drift, and safely patch missing keys. Built with Vue 3 + Tailwind CSS 4 on the frontend and Rust on the backend, styled with the @stuntrocket/ui design system.

## Features

- **Multi-project registry** — maintain a list of projects (name + root path) with an active project workflow
- **Env file discovery** — recursively scan a project directory for `.env*` files (skips `node_modules`, `vendor`, `.git`, etc.)
- **Flexible import** — add env sets via folder scan, manual file upload, or paste
- **Auto role classification** — each set is classified as `local`, `staging`, `live`, or `other`
- **Drift comparison matrix** — compare two or more sets in a key matrix with status badges: missing, drift, unsafe, aligned
- **Role coverage warnings** — alerts when local, staging, or live sets are absent
- **Template generation** — missing-key template (reference to target) and merged template across all sets
- **Inline drift editor** — load a value from a source set, apply to the target set in-app, or write directly to the target file with backup
- **Safe write-back** — appends only truly missing keys, re-checks before writing, and creates timestamped `.bak` backups

## Heuristic unsafe checks

- `APP_KEY` missing or empty
- `APP_DEBUG=true` in production-like sets
- `APP_ENV=local` in production-like sets
- `DB_PASSWORD` empty in production-like sets
- `QUEUE_CONNECTION=sync` in production-like sets
- `MAIL_MAILER=log` in production-like sets
- `APP_URL` using `http://` in production-like sets
- `LOG_LEVEL=debug` in production-like sets
- Blank values for sensitive suffixes (`_SECRET`, `_PASSWORD`, `_TOKEN`, `_PRIVATE_KEY`)

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri 2 |
| Frontend | Vue 3 (Composition API, `<script setup>`) |
| Styling | Tailwind CSS 4, @stuntrocket/ui design system |
| Backend | Rust |
| Bundler | Vite |
| Type checking | TypeScript (strict) + vue-tsc |
| Persistence | localStorage |

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Rust](https://www.rust-lang.org/tools/install) toolchain
- Tauri 2 system dependencies — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Getting started

```bash
npm install              # Install frontend dependencies
npm run tauri dev        # Run dev mode (Vite dev server + Tauri window)
```

### Build

```bash
npm run build            # vue-tsc type check + Vite production build (frontend only)
npm run tauri build      # Full production build (frontend + Rust binary)
```

## Typical workflow

1. Create or select a project and set its root path.
2. Click **Scan Folder for .env*** to auto-import env files.
3. Review role coverage warnings (local/staging/live).
4. Compare reference vs target in the matrix.
5. Use the **Inline Drift Editor** to update a key in the target set or file.
6. Use **Patch Target File (Safe Append)** for missing-key bulk patching.
7. Confirm the status message and backup path.

## Architecture

### Frontend

Single-page Vue 3 app using Composition API with `<script setup>`. Entry point: `src/main.ts` mounts `App.vue`.

**Composables** (`src/composables/`) provide reactive state and logic:

- `useProjects` — project CRUD + localStorage persistence
- `useEnvSets` — env set management + persistence
- `useAnalysis` — drift analysis, unsafe evaluation, production-like detection
- `useFilters` — filter/search state
- `useEnvParser` — env file parsing utilities
- `useTemplates` — missing/merged template generation
- `useRoles` — role detection, sorting, type guards
- `useEnvMutations` — in-memory env key upsert
- `useTauriCommands` — typed wrappers for Tauri IPC commands
- `useStatus` — reactive status message with auto-clear
- `useSampleData` — sample data and baseline set generation

**Components** (`src/components/`):

- `layout/` — AppShell, AmbientBackground
- `ui/` — GlassCard, BaseButton, BaseSelect, BaseInput, BaseTextarea
- `kpi/` — KpiCard, KpiBar
- `project/` — ProjectManagementCard, ProjectSelector, ProjectForm, FileUploadActions, ManualSetForm, EnvSetList, EnvSetItem
- `comparison/` — ComparisonCard, FilterRow, TargetRow, InlineDriftEditor, ComparisonTable, ComparisonTableRow, StatusBadge, StatusMessage, WarningsList

### Backend

Three Tauri commands exposed via IPC (`src-tauri/src/lib.rs`):

- `scan_env_files` — recursively finds `.env*` files (max depth 8, 1.5 MB file cap)
- `append_missing_env_keys` — appends only missing keys to a file with timestamped `.bak` backups
- `upsert_env_key` — updates an existing key or appends a new one

### Data storage

All data is persisted in `localStorage` under the following keys:

- `edm.projects.v1` — project registry
- `edm.activeProject.v1` — currently active project
- `edm.envSets.v1` — env set definitions including raw content and file paths

## Licence

Private.
