# Sidebar Rework: Premium Mac App Style

**Date:** 2026-02-22
**Status:** Approved
**Style reference:** Tower/Transmit — projects as first-class sidebar citizens

## Problem

The current sidebar is a `GlassCard` floating in a CSS grid column. It feels like a web dashboard widget rather than a structural navigation fixture. The project selector is a dropdown buried below navigation, making project switching feel secondary.

## Design

### Layout structure

Replace the current `grid[card | content]` layout with `flex[sidebar-panel | main-content]`.

- **Sidebar width:** 220px (down from 280px)
- **Background:** `surface-0` (#171717) — flat, no glassmorphic blur
- **Separator:** 1px `border-default` right border
- **Height:** Full window height, flush with edges
- **Titlebar:** Drag region integrated into both sidebar top and content top

### Sidebar content

**Projects group (top):**
- Group label: "Projects" (small uppercase muted) with `+` button aligned right
- Each project is a clickable row: folder icon + name + env set count badge
- Active project: `accent-muted` background fill, `accent` text, `font-medium`
- Inactive projects: `text-secondary`, hover shows `surface-2` background
- Clicking inactive project switches to it AND navigates to Dashboard
- Zero sets shown as middle dot (`·`), non-zero as number
- Empty state: "No projects yet" muted text

**Navigation group (below divider):**
- Thin `border-subtle` divider
- Dashboard and Help rows, same style as project rows
- Active page: same `accent-muted` fill + `accent` text treatment
- No "Projects" nav item — the sidebar project list replaces it

### Responsive (below 1024px)

Sidebar collapses entirely. An inline project selector dropdown returns at the top of the content area, matching current mobile behaviour.

### Component changes

| Component | Change |
|-----------|--------|
| **SidebarPanel.vue** (new) | Structural sidebar with projects list + nav |
| **AppShell.vue** | Wraps `flex[sidebar + main]` instead of just `<main>` |
| **App.vue** | Removes grid layout, GlassCard wrapper, moves project/page state to SidebarPanel |
| **ProjectSelector.vue** | Retained for mobile/responsive fallback only |

### Selected state treatment

Both project rows and nav rows use the same selected pattern:
- `rounded-md` (6px) corners
- `bg-accent-muted` (#60a5fa33) background
- `text-accent` (#60a5fa) text colour
- `font-medium` weight
- Compact padding: `px-2 py-1.5`

### Key removals

- GlassCard sidebar wrapper
- ProjectSelector dropdown (desktop)
- "Navigate" and "Project context" uppercase section labels
- "All comparisons and edits use this project" helper text
- "Projects" as a separate page navigation item (absorbed into sidebar)
