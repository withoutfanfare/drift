# Drift MVP

Tauri desktop MVP for Laravel developers to manage local/staging/live `.env` sets across multiple projects, detect drift, and safely patch missing keys.

## What this MVP does

- Maintains a **multi-project registry** (project name + root path).
- Supports an **active project** workflow so each project keeps its own env set group.
- Discovers `.env*` files by scanning a project path recursively (with common heavy folders skipped).
- Imports env sets from:
  - folder scan (with filesystem path retained)
  - manual file upload
  - manual paste
- Auto-classifies each set as `local`, `staging`, `live`, or `other`.
- Compares two or more sets in a key matrix with status badges:
  - missing
  - drift
  - unsafe
  - aligned
- Adds role coverage warnings when local/staging/live sets are missing.
- Generates helper outputs:
  - missing-key template (reference -> target)
  - merged template across all sets
- Provides an inline key editor to resolve drift:
  - load value from a source set
  - apply to target set in-app
  - apply directly to target file (with backup)
- Performs **safe write-back** to target files:
  - appends only truly missing keys
  - re-checks existing keys before writing
  - creates timestamped backup file (`.bak.<timestamp>`)

## Heuristic unsafe checks

- `APP_KEY` missing/empty
- `APP_DEBUG=true` in production-like sets
- `APP_ENV=local` in production-like sets
- `DB_PASSWORD` empty in production-like sets
- `QUEUE_CONNECTION=sync` in production-like sets
- `MAIL_MAILER=log` in production-like sets
- `APP_URL` using `http://` in production-like sets
- `LOG_LEVEL=debug` in production-like sets
- blank values for sensitive suffixes (`_SECRET`, `_PASSWORD`, `_TOKEN`, `_PRIVATE_KEY`)

## How to run

```bash
cd /Users/dannyharding/Development/Code/Project/tauri-app-ideas/env-drift-manager/tauri-app
npm install
npm run tauri dev
```

## Typical workflow

1. Create/select a project and set its root path.
2. Click `Scan Folder for .env*` to auto-import env files.
3. Review role coverage warnings (local/staging/live).
4. Compare reference vs target in the matrix.
5. Use `Inline Drift Editor` to update a key in the target set or file.
6. Use `Patch Target File (Safe Append)` for missing-key bulk patching.
7. Confirm status message and backup path.

## Local data storage

- `localStorage` key: `edm.projects.v1`
- `localStorage` key: `edm.activeProject.v1`
- `localStorage` key: `edm.envSets.v1`

Stored payload includes project metadata and env set definitions (including raw content and optional file path for scanned sets).

## MVP boundaries

- No direct value editing UI for individual keys yet.
- No schema/secret provider integration yet.
- Unsafe checks are heuristic and advisory.
- Inline write-back can mutate existing key values in scanned target files.
