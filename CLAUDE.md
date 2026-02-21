# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Drift is a Tauri 2 desktop app for Laravel developers to manage `.env` file sets across projects, detect environment drift, and safely patch missing keys. Built with vanilla TypeScript (no framework) on the frontend and Rust on the backend.

## Development Commands

```bash
npm install                # Install frontend dependencies
npm run tauri dev          # Run dev mode (Vite dev server + Tauri window)
npm run build              # TypeScript check + Vite production build (frontend only)
npm run tauri build        # Full production build (frontend + Rust binary)
```

No test framework is configured. No linter/formatter beyond TypeScript strict mode.

## Architecture

### Frontend (`src/main.ts`)

Single monolithic TypeScript file (~1600 lines) using vanilla DOM manipulation. No framework — all UI is built with HTML string templates and direct DOM APIs.

Key data types: `ProjectProfile`, `EnvSet`, `KeyAnalysisRow`, `PersistedSet`, `PersistedProject`.

Data flow: localStorage (`edm.projects.v1`, `edm.activeProject.v1`, `edm.envSets.v1`) → in-memory state → DOM render cycle. Every mutation persists immediately.

The frontend calls Rust commands via `@tauri-apps/api` invoke.

### Backend (`src-tauri/src/lib.rs`)

Three Tauri commands exposed to the frontend:

- `scan_env_files(project_root)` — Recursively finds `.env*` files (max depth 8, skips node_modules/vendor/.git/etc., 1.5MB file cap)
- `append_missing_env_keys(target_path, entries, create_backup)` — Appends only missing keys to a file, creates timestamped `.bak` backups
- `upsert_env_key(target_path, key, value, create_backup)` — Updates existing key or appends new one

All Rust structs use `#[serde(rename_all = "camelCase")]` for JSON interop with the frontend.

### Entry Points

- Frontend: `index.html` → `src/main.ts`
- Rust lib: `src-tauri/src/lib.rs` → `run()`
- Rust binary: `src-tauri/src/main.rs` → calls `env_drift_manager_lib::run()`

## Key Conventions

- Tauri 2.x APIs (not Tauri 1.x) — commands return `Result<T, String>`
- Rust serde structs use camelCase for JSON field names
- Frontend uses no framework — avoid introducing React/Vue/etc. without discussion
- Safe file operations: always validate paths, parse before write, backup before mutate
- localStorage is the only persistence layer (no database)
- Vite dev server runs on port 1420
- App identifier: `com.dannyharding.drift`
