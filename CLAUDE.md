# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Drift is a Tauri 2 desktop app for Laravel developers to manage `.env` file sets across projects, detect environment drift, and safely patch missing keys. Built with Vue 3 + Tailwind CSS 4 on the frontend and Rust on the backend, styled with the @stuntrocket/ui design system.

## Development Commands

```bash
npm install                # Install frontend dependencies
npm run tauri dev          # Run dev mode (Vite dev server + Tauri window)
npm run build              # vue-tsc type check + Vite production build (frontend only)
npm run tauri build        # Full production build (frontend + Rust binary)
```

No test framework is configured. No linter/formatter beyond TypeScript strict mode + vue-tsc.

## Architecture

### Frontend (Vue 3 + Tailwind CSS 4)

Single-page Vue 3 app using Composition API with `<script setup>`. Entry point: `src/main.ts` mounts `App.vue` to `#app`.

**Types** (`src/types/index.ts`): `ProjectProfile`, `EnvSet`, `KeyAnalysisRow`, `PersistedSet`, `PersistedProject`, `ScannedEnvFile`, `MissingEntry`, `PatchResult`, `UpsertResult`, `LocalUpsertResult`.

**Composables** (`src/composables/`):
- `useProjects` — reactive project CRUD + localStorage persistence (`edm.projects.v1`, `edm.activeProject.v1`)
- `useEnvSets` — reactive env set management + localStorage persistence (`edm.envSets.v1`)
- `useAnalysis` — drift analysis, unsafe evaluation, production-like detection
- `useFilters` — reactive filter/search state
- `useEnvParser` — pure-function env file parsing utilities
- `useTemplates` — missing/merged template generation
- `useRoles` — role detection, sorting, type guards
- `useEnvMutations` — in-memory env key upsert
- `useTauriCommands` — typed wrappers for Tauri IPC commands
- `useStatus` — reactive status message with auto-clear
- `useSampleData` — sample data and baseline set generation

**Components** (`src/components/`):
- `layout/` — AppShell (titlebar + container), AmbientBackground (animated blobs)
- `ui/` — GlassCard, BaseButton, BaseSelect, BaseInput, BaseTextarea
- `kpi/` — KpiCard, KpiBar
- `project/` — ProjectManagementCard, ProjectSelector, ProjectForm, FileUploadActions, ManualSetForm, EnvSetList, EnvSetItem
- `comparison/` — ComparisonCard, FilterRow, TargetRow, InlineDriftEditor, ComparisonTable, ComparisonTableRow, StatusBadge, StatusMessage, WarningsList

**Styling** (`src/styles/main.css`): Tailwind CSS 4 with @stuntrocket/ui design tokens in `@theme {}` block. Dark-mode-only with glassmorphic panels, ambient background blobs, and custom scrollbars.

### Backend (`src-tauri/src/lib.rs`)

Three Tauri commands exposed to the frontend:

- `scan_env_files(project_root)` — Recursively finds `.env*` files (max depth 8, skips node_modules/vendor/.git/etc., 1.5MB file cap)
- `append_missing_env_keys(target_path, entries, create_backup)` — Appends only missing keys to a file, creates timestamped `.bak` backups
- `upsert_env_key(target_path, key, value, create_backup)` — Updates existing key or appends new one

All Rust structs use `#[serde(rename_all = "camelCase")]` for JSON interop with the frontend.

### Entry Points

- Frontend: `index.html` → `src/main.ts` → `App.vue`
- Rust lib: `src-tauri/src/lib.rs` → `run()`
- Rust binary: `src-tauri/src/main.rs` → calls `env_drift_manager_lib::run()`

## Key Conventions

- Tauri 2.x APIs (not Tauri 1.x) — commands return `Result<T, String>`
- Rust serde structs use camelCase for JSON field names
- Vue 3 Composition API with `<script setup lang="ts">` — no Options API
- Tailwind CSS 4 with CSS-first `@theme {}` config — no `tailwind.config.js`
- @stuntrocket/ui design system: dark mode, glassmorphic cards, accent blue (#60A5FA)
- Composables use module-level `ref()` for singleton state (no provide/inject needed)
- Safe file operations: always validate paths, parse before write, backup before mutate
- localStorage is the only persistence layer (no database)
- Vite dev server runs on port 1420
- App identifier: `com.dannyharding.drift`
