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

Tests use Vitest (run via `npx vitest`; no npm script defined yet) — see `src/composables/__tests__/`. No linter/formatter beyond TypeScript strict mode + vue-tsc.

## Architecture

### Frontend (Vue 3 + Tailwind CSS 4)

Single-page Vue 3 app using Composition API with `<script setup>`. Entry point: `src/main.ts` mounts `App.vue` to `#app`.

**Types** (`src/types/index.ts`): `ProjectProfile`, `EnvSet`, `KeyAnalysisRow`, `PersistedSet`, `PersistedProject`, `ScannedEnvFile`, `MissingEntry`, `PatchResult`, `UpsertResult`, `LocalUpsertResult`.

**Composables** (`src/composables/`) — env parsing/mutation, drift analysis, git tracking, file watching, secret detection/masking, backups, and UI state (filtering, grouping, keyboard shortcuts). See the directory for the full list.

**Components** (`src/components/`):
- `layout/` — AppShell (titlebar + container), AmbientBackground (animated blobs)
- `ui/` — GlassCard, BaseButton, BaseSelect, BaseInput, BaseTextarea
- `kpi/` — KpiCard, KpiBar
- `project/` — ProjectManagementCard, ProjectSelector, ProjectForm, FileUploadActions, ManualSetForm, EnvSetList, EnvSetItem
- `comparison/` — ComparisonCard, FilterRow, TargetRow, InlineDriftEditor, ComparisonTable, ComparisonTableRow, StatusBadge, StatusMessage, WarningsList

**Styling** (`src/styles/main.css`): Tailwind CSS 4 with @stuntrocket/ui design tokens in `@theme {}` block. Dark-mode-only with glassmorphic panels, ambient background blobs, and custom scrollbars.

### Backend (`src-tauri/src/lib.rs`)

17 Tauri commands as of Aug 2026 (see the `#[tauri::command]` functions in `src-tauri/src/lib.rs`), covering env scanning/writing, backups & rotation, schema validation, git status, and unused-key detection.

All Rust structs use `#[serde(rename_all = "camelCase")]` for JSON interop with the frontend.

### Entry Points

- Frontend: `index.html` → `src/main.ts` → `App.vue`
- Rust lib: `src-tauri/src/lib.rs` → `run()`
- Rust binary: `src-tauri/src/main.rs` → calls `env_drift_manager_lib::run()`

## Key Conventions

- Tauri 2.x APIs (not Tauri 1.x) — commands return `Result<T, String>`
- Rust serde structs use camelCase for JSON field names
- @stuntrocket/ui design system: dark mode, glassmorphic cards, accent blue (#60A5FA)
- Composables use module-level `ref()` for singleton state (no provide/inject needed)
- localStorage is the only persistence layer (no database)
- App identifier: `com.dannyharding.drift`
