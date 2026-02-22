# Projects Page Rework: Two-Card Split

**Date:** 2026-02-22
**Status:** Approved

## Problem

The Projects page is a single monolithic GlassCard with all functionality stacked vertically: project name/path inputs, action buttons, file upload, manual entry form, and env set list. It looks like a web form — no visual hierarchy, no separation between "configure the project" (one-time setup) and "manage env sets" (the primary workflow).

## Design

### Card 1: Project Settings (collapsible)

A GlassCard that is **collapsed by default**, since project settings are a one-time configuration.

**Collapsed state:**
- Settings icon (cog SVG) + "Project Settings" title on the left
- Chevron `▸` + active project name on the right
- Clicking the header toggles expand/collapse
- Compact: single row, no padding beyond the header

**Expanded state:**
- Name input and Root path input with Browse button
- Action buttons grouped: Save project (primary), Scan .env files (tertiary), Create starter templates (tertiary)
- Subtle divider before danger zone
- "Remove project from Drift" danger button at the bottom
- No section micro-labels ("Project setup", "Drift record action") — the card title is sufficient

### Card 2: Environment Sets (main focus)

The primary card on the page. Takes visual priority.

**Header:**
- "Environment Sets" title on the left
- Set count badge on the right (e.g. "3 sets loaded") in muted text
- Action buttons below the title: Load .env files (primary), Scan project (tertiary), Load sample trio (tertiary)

**Set list — each item is a proper row:**
- Each env set gets its own inner container with `surface-1/50` background and `border-subtle` border, `rounded-md`
- **Line 1:** Set name (bold, `text-primary`) on the left, Remove button on the right
- **Line 2:** Role badge (coloured: local=accent/blue, staging=warning/amber, live=danger/red, other=surface-3/grey) + source text (scanned/file/manual) + key count + duplicate count if any, all in muted/secondary text
- **Line 3 (optional):** File path in `text-muted`, monospace, truncated — only shown when `filePath` exists

Role badges use the existing Spool status colours:
- local: `bg-accent-muted text-accent` (blue)
- staging: `bg-warning/15 text-warning` (amber)
- live: `bg-danger/15 text-danger` (red)
- other: `bg-surface-2 text-text-tertiary` (grey)

**Footer:**
- Subtle divider
- "Paste .env content manually" as a clickable text link with expand chevron `▸`/`▾`
- When expanded: shows the manual entry form (name, role select, textarea, submit button)
- "Clear all loaded sets" danger button at the bottom

**Empty state** (no sets loaded):
- Centred text: "No environment sets loaded yet." + "Scan your project or load .env files to begin."
- Two action buttons below: Scan project + Load .env files
- No manual entry link in empty state

### Component changes

| Component | Change |
|-----------|--------|
| **ProjectManagementCard.vue** | Split into two cards. Collapsed settings card + env sets card. Restructure template. |
| **ProjectForm.vue** | Remove section micro-labels. Keep inputs, browse, save, scan, baseline, delete. |
| **FileUploadActions.vue** | Move buttons to env sets card header. Remove its own section label. |
| **EnvSetItem.vue** | Restyle as a proper inner card with role badge, better layout. |
| **EnvSetList.vue** | Remove the cramped `max-h-56 overflow-y-auto` scroll container. Let items flow naturally. |
| **ManualSetForm.vue** | No structural changes — just rendered inside the expandable section. |

### Key removals

- All `text-[10px] font-bold uppercase tracking-wider text-text-muted` section micro-labels
- "Project + Env Set Management" title and subtitle
- "Sets in Active Project" heading
- `max-h-56` scroll constraint on the set list
- Gradient fade overlay on the set list
