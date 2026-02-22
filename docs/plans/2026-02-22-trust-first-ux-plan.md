# Trust-First UX Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign Drift's UX around trust, clarity, and reduced friction — adding diff previews, activity timeline, secret masking, plain-English labels, backup browser, auto-scan, and contextual empty states.

**Architecture:** Seven design sections implemented across 11 tasks in dependency order. New composables provide reactive state for masking and activity logging. New Vue components for diff preview, timeline, backup browser, and empty states. One new Rust backend command for backup discovery. Existing components receive label renames and integration points.

**Tech Stack:** Vue 3 Composition API, Tailwind CSS 4 (Spool tokens), Tauri 2 Rust backend, localStorage persistence.

**Design doc:** `docs/plans/2026-02-22-trust-first-ux-design.md`

---

## Task 1: Clear Language — Rename Labels and Terminology

Rename jargon to plain English across all components. Foundation task that all other work builds on.

**Files:**
- Modify: `src/components/comparison/TargetRow.vue`
- Modify: `src/components/comparison/FilterRow.vue`
- Modify: `src/components/comparison/InlineDriftEditor.vue`
- Modify: `src/components/comparison/ComparisonCard.vue`
- Modify: `src/components/comparison/ComparisonTable.vue`
- Modify: `src/components/project/EnvSetItem.vue`
- Modify: `src/components/project/EnvSetList.vue`
- Modify: `src/components/project/ProjectManagementCard.vue`
- Modify: `src/components/project/FileUploadActions.vue`
- Modify: `src/components/layout/SidebarPanel.vue`
- Modify: `src/components/help/OnboardingGuide.vue`

**Step 1: Rename TargetRow labels and props**

In `TargetRow.vue`:
- Change `label="Target set"` → `label="Compare to"`
- Change button text `Copy Missing-Key Template` → `Copy missing keys`
- Change button text `Copy Merged Template` → `Export combined .env`
- Change button text `Patch Missing Keys to Target` → a computed label showing: `Add ${count} missing keys to ${filename}` where count and filename come from new props

Add new props to TargetRow:
```typescript
defineProps<{
  sets: EnvSet[];
  missingCount?: number;
  targetFileName?: string;
}>();
```

Update button text:
```vue
<BaseButton variant="danger" @click="emit('patchTarget')">
  {{ missingCount && targetFileName
    ? `Add ${missingCount} missing keys to ${targetFileName}`
    : 'Add missing keys to file' }}
</BaseButton>
```

**Step 2: Rename FilterRow labels**

In `FilterRow.vue`:
- Change `label="Filter rows"` → `label="Filter"`
- Change `label="Reference set"` → `label="Compare from"`
- Add subtitles to filter options:
```vue
<option value="drift">Drift — values that differ</option>
<option value="unsafe">Unsafe — debug mode, defaults</option>
```

**Step 3: Rename InlineDriftEditor labels**

In `InlineDriftEditor.vue`:
- Change heading `Inline Drift Editor` → `Edit a key`
- Change `label="Source set"` → `label="Copy value from"`
- Change `label="Target set"` → `label="Apply to"`
- Change `Load Value From Source` → `Load value`
- Change `Apply to Target (In-App)` → `Update in Drift`
- Change `Apply to Target File` → `Write to file`

**Step 4: Rename ComparisonCard heading and section titles**

In `ComparisonCard.vue`:
- Change heading `Compare, Drift Control, and Write-Back` → `Compare .env files`
- Change `Warnings and coverage` → `Warnings and coverage`  (keep — already clear)
- Change `Inline editor` → `Edit a key`

**Step 5: Rename ProjectManagementCard labels**

In `ProjectManagementCard.vue`:
- Change heading `Environment Sets` → `.env files`
- Change count text `{{ sets.length }} set{{ ... }} loaded` → `{{ sets.length }} file{{ ... }} loaded`
- Change manual entry toggle `Paste .env content manually` → `Paste .env content`
- Change `Clear all loaded sets` → `Remove all .env files from Drift`

**Step 6: Rename EnvSetItem role to environment**

In `EnvSetItem.vue`:
- Where "role" appears in visible UI text, change to "environment" or just show the value directly (local, staging, live) without the label "Role:"
- Change source labels: `scan` → `folder scan`, `file` → `file picker`, `manual` → `pasted`

**Step 7: Rename OnboardingGuide terminology**

In `OnboardingGuide.vue`:
- Update all references to "reference set" → "compare from"
- Update all references to "target set" → "compare to"
- Update all references to "sets" → ".env files" where it means loaded files
- Update all references to "role" → "environment"

**Step 8: Pass missing count and filename to TargetRow from ComparisonCard**

In `ComparisonCard.vue`, compute missing count and target filename:
```typescript
const targetFileName = computed(() => {
  const target = targetSet.value;
  if (!target) return '';
  return target.filePath ? target.name : '';
});

const missingKeyCount = computed(() => {
  if (!referenceSet.value || !targetSet.value) return 0;
  return getMissingEntries(referenceSet.value, targetSet.value).length;
});
```

Pass to TargetRow:
```vue
<TargetRow
  v-model="targetSetId"
  :sets="sets"
  :missing-count="missingKeyCount"
  :target-file-name="targetFileName"
  @copy-missing="onCopyMissing"
  @copy-merged="onCopyMerged"
  @patch-target="requestPatch"
/>
```

**Step 9: Run type check and verify**

Run: `npm run build`
Expected: Clean compilation with no type errors.

**Step 10: Commit**

```bash
git add -A && git commit -m "refactor: rename jargon to plain English across all components"
```

---

## Task 2: Create useActivityLog Composable

New composable for persistent activity logging. Foundation for the timeline UI.

**Files:**
- Create: `src/composables/useActivityLog.ts`
- Modify: `src/types/index.ts`

**Step 1: Add activity log types**

In `src/types/index.ts`, append:
```typescript
export type ActivityCategory = "info" | "write" | "destructive" | "success" | "error";

export interface ActivityEntry {
  id: string;
  timestamp: number;
  category: ActivityCategory;
  summary: string;
  detail?: string;
  projectId?: string;
}
```

**Step 2: Create useActivityLog composable**

Create `src/composables/useActivityLog.ts`:
```typescript
import { ref, computed } from "vue";
import type { ActivityEntry, ActivityCategory } from "../types";

const MAX_ENTRIES = 200;
const STORAGE_KEY = "edm.activityLog.v1";

const entries = ref<ActivityEntry[]>(loadEntries());

function loadEntries(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useActivityLog() {
  function log(
    category: ActivityCategory,
    summary: string,
    detail?: string,
    projectId?: string,
  ) {
    const entry: ActivityEntry = {
      id: generateId(),
      timestamp: Date.now(),
      category,
      summary,
      detail,
      projectId,
    };

    entries.value.unshift(entry);

    if (entries.value.length > MAX_ENTRIES) {
      entries.value = entries.value.slice(0, MAX_ENTRIES);
    }

    persistEntries();
  }

  function clearLog() {
    entries.value = [];
    persistEntries();
  }

  const recentEntries = computed(() => entries.value.slice(0, 50));

  return { entries, recentEntries, log, clearLog };
}
```

**Step 3: Run type check**

Run: `npm run build`
Expected: Clean compilation.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add useActivityLog composable with localStorage persistence"
```

---

## Task 3: Integrate Activity Logging into Existing Actions

Wire up `useActivityLog.log()` calls throughout the app wherever `setStatus()` is called.

**Files:**
- Modify: `src/components/project/ProjectManagementCard.vue`
- Modify: `src/components/comparison/ComparisonCard.vue`

**Step 1: Add logging to ProjectManagementCard**

Import `useActivityLog` at the top of `ProjectManagementCard.vue`:
```typescript
import { useActivityLog } from "../../composables/useActivityLog";
const { log } = useActivityLog();
```

Add `log()` calls alongside existing `setStatus()` calls:
- `onSaveProject`: `log("success", "Project saved: ${name}", undefined, activeProject.value?.id)`
- `onDeleteProject`: `log("destructive", "Removed project: ${removedName}", "Backup: ${backupPath}", activeProject.value?.id)`
- `onScan`: `log("info", "Scanned ${project.name}: found ${scanned.length} .env files", undefined, project.id)`
- `onLoadFiles`: `log("info", "Loaded ${files.length} files into ${project.name}", undefined, project.id)`
- `onLoadSample`: `log("info", "Loaded sample data into ${project.name}", undefined, project.id)`
- `onClearSets`: `log("destructive", "Cleared .env files for ${project.name}", "Backup: ${backupPath}", project.id)`
- `onRemoveSet`: `log("destructive", "Removed ${set?.name} from ${activeProject.value?.name}", "Backup: ${backupPath}", activeProject.value?.id)`
- Error cases: `log("error", "Scan failed: ${message}", undefined, project?.id)`

**Step 2: Add logging to ComparisonCard**

Import `useActivityLog` in `ComparisonCard.vue`:
```typescript
import { useActivityLog } from "../../composables/useActivityLog";
const { log } = useActivityLog();
```

Add `log()` calls:
- `onCopyMissing`: `log("info", "Copied missing keys (${referenceSet.value?.name} → ${targetSet.value?.name})")`
- `onCopyMerged`: `log("info", "Copied combined .env to clipboard")`
- `executePatch`: `log("write", "Added ${result.appendedCount} keys to ${targetSet.value?.name}", "Backup: ${result.backupPath}")`
- `onApplyMemory`: `log("info", "${result.appended ? 'Added' : 'Updated'} ${key} in ${target.name} (in Drift)")`
- `onApplyFile`: `log("write", "Wrote ${key} to ${target.name}", "Backup: ${result.backupPath}")`
- Error cases: `log("error", "Patch failed: ${message}")`

**Step 3: Run type check**

Run: `npm run build`
Expected: Clean compilation.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: integrate activity logging into project and comparison actions"
```

---

## Task 4: Activity Timeline Component

New component that renders the activity log as a scrollable timeline.

**Files:**
- Create: `src/components/layout/ActivityTimeline.vue`
- Modify: `src/App.vue`

**Step 1: Create ActivityTimeline component**

Create `src/components/layout/ActivityTimeline.vue`:
```vue
<script setup lang="ts">
import { ref, computed } from "vue";
import { useActivityLog } from "../../composables/useActivityLog";
import type { ActivityCategory } from "../../types";

const { recentEntries, clearLog } = useActivityLog();
const expanded = ref(false);
const expandedEntryId = ref<string | null>(null);

function toggleEntry(id: string) {
  expandedEntryId.value = expandedEntryId.value === id ? null : id;
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const categoryStyles: Record<ActivityCategory, { dot: string; icon: string }> = {
  info: { dot: "bg-info", icon: "text-info" },
  write: { dot: "bg-warning", icon: "text-warning" },
  destructive: { dot: "bg-danger", icon: "text-danger" },
  success: { dot: "bg-success", icon: "text-success" },
  error: { dot: "bg-danger", icon: "text-danger" },
};
</script>

<template>
  <div class="border-t border-border-subtle">
    <button
      class="focus-ring w-full flex items-center gap-2 px-4 py-2.5 text-left"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <svg
        class="h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-200"
        :class="expanded ? 'rotate-90' : ''"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="text-xs font-medium text-text-secondary flex-1">Activity</span>
      <span v-if="recentEntries.length > 0" class="text-[11px] text-text-muted tabular-nums">
        {{ recentEntries.length }}
      </span>
    </button>

    <div v-if="expanded" class="px-4 pb-3 max-h-[280px] overflow-y-auto">
      <div v-if="recentEntries.length === 0" class="py-4 text-center text-xs text-text-muted">
        No activity yet this session.
      </div>

      <ol v-else class="space-y-1">
        <li
          v-for="entry in recentEntries"
          :key="entry.id"
          class="group"
        >
          <button
            class="focus-ring w-full flex items-start gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left hover:bg-surface-2/50 transition-colors"
            @click="entry.detail ? toggleEntry(entry.id) : undefined"
          >
            <span
              class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              :class="categoryStyles[entry.category].dot"
            />
            <div class="min-w-0 flex-1">
              <p class="text-xs text-text-secondary truncate">{{ entry.summary }}</p>
              <div
                v-if="expandedEntryId === entry.id && entry.detail"
                class="mt-1 text-[11px] text-text-muted break-all"
              >
                {{ entry.detail }}
              </div>
            </div>
            <span class="text-[11px] text-text-muted tabular-nums whitespace-nowrap shrink-0">
              {{ formatTime(entry.timestamp) }}
            </span>
          </button>
        </li>
      </ol>

      <button
        v-if="recentEntries.length > 0"
        class="focus-ring mt-2 text-[11px] text-text-muted hover:text-text-secondary transition-colors rounded"
        @click="clearLog"
      >
        Clear history
      </button>
    </div>
  </div>
</template>
```

**Step 2: Add ActivityTimeline to App.vue**

In `App.vue`, import the component and add it at the bottom of the main content area, after the page content `</div>` but still inside `<AppShell>`:

```vue
import ActivityTimeline from "./components/layout/ActivityTimeline.vue";
```

Add after the `<div class="space-y-5">...</div>` block:
```vue
<ActivityTimeline />
```

**Step 3: Run type check and verify**

Run: `npm run build`
Expected: Clean compilation. Timeline appears collapsed at bottom of every page.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add activity timeline component with collapsible log"
```

---

## Task 5: Create useMasking Composable

New composable for secret value masking with smart heuristics.

**Files:**
- Create: `src/composables/useMasking.ts`

**Step 1: Create useMasking composable**

Create `src/composables/useMasking.ts`:
```typescript
import { ref, computed } from "vue";

const STORAGE_KEY = "edm.masking.v1";
const MASK_PLACEHOLDER = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

const SENSITIVE_PATTERNS = [
  /_SECRET$/i,
  /_KEY$/i,
  /_PASSWORD$/i,
  /_TOKEN$/i,
  /^DB_/i,
  /^AWS_/i,
  /^STRIPE_/i,
  /^REDIS_PASSWORD$/i,
  /^MAIL_PASSWORD$/i,
  /^PUSHER_APP_SECRET$/i,
  /_PRIVATE/i,
  /^API_KEY$/i,
  /^SECRET$/i,
];

const SAFE_VALUES = new Set(["true", "false", "null", "", "0", "1", "yes", "no"]);

function loadMasked(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== "false";
  } catch {
    return true;
  }
}

const globalMasked = ref(loadMasked());

export function useMasking() {
  function toggleMasking() {
    globalMasked.value = !globalMasked.value;
    localStorage.setItem(STORAGE_KEY, String(globalMasked.value));
  }

  function isSensitiveKey(key: string): boolean {
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
  }

  function maskValue(key: string, value: string): string {
    if (SAFE_VALUES.has(value.toLowerCase())) return value;
    if (!globalMasked.value && !isSensitiveKey(key)) return value;
    return MASK_PLACEHOLDER;
  }

  function shouldMask(key: string, value: string): boolean {
    if (SAFE_VALUES.has(value.toLowerCase())) return false;
    if (globalMasked.value) return true;
    return isSensitiveKey(key);
  }

  return {
    globalMasked: computed(() => globalMasked.value),
    toggleMasking,
    isSensitiveKey,
    maskValue,
    shouldMask,
    MASK_PLACEHOLDER,
  };
}
```

**Step 2: Run type check**

Run: `npm run build`
Expected: Clean compilation.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add useMasking composable with smart secret detection"
```

---

## Task 6: Integrate Secret Masking into UI

Add masking toggle to app header. Apply masking to comparison table and inline editor.

**Files:**
- Modify: `src/components/layout/AppShell.vue`
- Modify: `src/components/comparison/ComparisonTableRow.vue`
- Modify: `src/components/comparison/InlineDriftEditor.vue`

**Step 1: Read AppShell.vue to understand the titlebar layout**

Read the current `AppShell.vue` to find the right insertion point for the masking toggle.

**Step 2: Add masking toggle to AppShell**

In `AppShell.vue`, import and add a toggle button to the titlebar area. The toggle should be a small eye/eye-off icon button:

```typescript
import { useMasking } from "../../composables/useMasking";
const { globalMasked, toggleMasking } = useMasking();
```

Add a button in the titlebar region (right-aligned, not in the drag region):
```vue
<button
  class="focus-ring rounded-[var(--radius-md)] p-1.5 text-text-muted hover:text-text-primary transition-colors"
  :title="globalMasked ? 'Reveal values' : 'Mask values'"
  style="-webkit-app-region: no-drag;"
  @click="toggleMasking"
>
  <!-- Eye-off icon when masked -->
  <svg v-if="globalMasked" class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>
  <!-- Eye icon when revealed -->
  <svg v-else class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
  </svg>
</button>
```

**Step 3: Apply masking in ComparisonTableRow**

Read `ComparisonTableRow.vue` first to understand its current value rendering, then:

Import `useMasking`:
```typescript
import { useMasking } from "../../composables/useMasking";
const { maskValue, shouldMask, isSensitiveKey } = useMasking();
```

Where values are displayed in the table cells, wrap them:
- Replace raw value display with `maskValue(row.key, value)`
- Add a click handler to temporarily reveal: use a local `ref<Set<string>>` of revealed cell IDs
- Show a small lock icon next to sensitive keys: `<span v-if="isSensitiveKey(row.key)">` with a lock SVG

**Step 4: Apply masking in InlineDriftEditor**

In `InlineDriftEditor.vue`:
- The value textarea should NOT be masked (you need to see what you're editing)
- But the source value preview (when loading from source) should use `maskValue()` with a click-to-reveal pattern

**Step 5: Run type check and verify**

Run: `npm run build`
Expected: Clean compilation. Toggle visible in titlebar. Table values masked by default.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: integrate secret masking into comparison table and app header"
```

---

## Task 7: Diff Preview Panel Component

New component replacing ConfirmDialog for file write operations.

**Files:**
- Create: `src/composables/useDiff.ts`
- Create: `src/components/comparison/DiffPreview.vue`
- Modify: `src/components/comparison/ComparisonCard.vue`

**Step 1: Create useDiff composable**

Create `src/composables/useDiff.ts` — a pure function that computes a simple line diff:
```typescript
export interface DiffLine {
  type: "context" | "added" | "removed";
  content: string;
  lineNumber: number;
}

export function computeDiff(original: string, updated: string): DiffLine[] {
  const oldLines = original.split("\n");
  const newLines = updated.split("\n");
  const result: DiffLine[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  let lineNum = 0;

  for (let i = 0; i < maxLen; i++) {
    lineNum++;
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      if (oldLine !== undefined) {
        result.push({ type: "context", content: oldLine, lineNumber: lineNum });
      }
    } else {
      if (oldLine !== undefined && !newLines.includes(oldLine)) {
        result.push({ type: "removed", content: oldLine, lineNumber: lineNum });
      }
      if (newLine !== undefined && !oldLines.includes(newLine)) {
        result.push({ type: "added", content: newLine, lineNumber: lineNum });
      }
    }
  }

  // Trim context lines: show only 2 lines around changes
  return trimContext(result, 2);
}

function trimContext(lines: DiffLine[], contextSize: number): DiffLine[] {
  const changeIndices = new Set<number>();
  lines.forEach((line, i) => {
    if (line.type !== "context") {
      for (let j = Math.max(0, i - contextSize); j <= Math.min(lines.length - 1, i + contextSize); j++) {
        changeIndices.add(j);
      }
    }
  });

  if (changeIndices.size === 0) return [];

  const result: DiffLine[] = [];
  let lastIncluded = -2;

  for (let i = 0; i < lines.length; i++) {
    if (changeIndices.has(i)) {
      if (i - lastIncluded > 1 && result.length > 0) {
        result.push({ type: "context", content: "···", lineNumber: 0 });
      }
      result.push(lines[i]);
      lastIncluded = i;
    }
  }

  return result;
}
```

**Step 2: Create DiffPreview component**

Create `src/components/comparison/DiffPreview.vue`:
```vue
<script setup lang="ts">
import { computed } from "vue";
import { computeDiff } from "../../composables/useDiff";
import BaseButton from "../ui/BaseButton.vue";

const props = defineProps<{
  title: string;
  filePath: string;
  original: string;
  updated: string;
  summary: string;
  confirmLabel?: string;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const diffLines = computed(() => computeDiff(props.original, props.updated));
const addedCount = computed(() => diffLines.value.filter((l) => l.type === "added").length);
const removedCount = computed(() => diffLines.value.filter((l) => l.type === "removed").length);
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="emit('cancel')">
    <div class="w-full max-w-2xl mx-4 rounded-[var(--radius-xl)] border border-border-default bg-surface-1 shadow-elevated overflow-hidden">
      <div class="px-5 py-4 border-b border-border-subtle">
        <h3 class="text-sm font-semibold text-text-primary">{{ title }}</h3>
        <p class="text-xs text-text-muted mt-1 font-mono truncate">{{ filePath }}</p>
      </div>

      <div class="px-5 py-3 border-b border-border-subtle">
        <p class="text-xs text-text-secondary">{{ summary }}</p>
        <div class="flex gap-3 mt-1.5">
          <span v-if="addedCount > 0" class="text-xs text-success font-medium">+{{ addedCount }} added</span>
          <span v-if="removedCount > 0" class="text-xs text-danger font-medium">-{{ removedCount }} removed</span>
        </div>
      </div>

      <div class="max-h-[360px] overflow-y-auto font-mono text-xs">
        <div
          v-for="(line, i) in diffLines"
          :key="i"
          class="flex"
          :class="{
            'bg-success/10': line.type === 'added',
            'bg-danger/10': line.type === 'removed',
          }"
        >
          <span class="w-10 shrink-0 text-right pr-2 text-text-muted select-none py-0.5">
            {{ line.lineNumber || '' }}
          </span>
          <span class="w-5 shrink-0 text-center py-0.5 select-none" :class="{
            'text-success': line.type === 'added',
            'text-danger': line.type === 'removed',
            'text-text-muted': line.type === 'context',
          }">
            {{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ' }}
          </span>
          <span class="flex-1 py-0.5 pr-4 whitespace-pre-wrap break-all" :class="{
            'text-success': line.type === 'added',
            'text-danger': line.type === 'removed',
            'text-text-secondary': line.type === 'context',
          }">{{ line.content }}</span>
        </div>

        <div v-if="diffLines.length === 0" class="px-5 py-8 text-center text-xs text-text-muted">
          No changes to preview.
        </div>
      </div>

      <div class="flex justify-end gap-2 px-5 py-3.5 border-t border-border-subtle">
        <BaseButton variant="tertiary" size="sm" @click="emit('cancel')">Cancel</BaseButton>
        <BaseButton variant="primary" size="sm" @click="emit('confirm')">{{ confirmLabel ?? 'Apply changes' }}</BaseButton>
      </div>
    </div>
  </div>
</template>
```

**Step 3: Replace ConfirmDialog with DiffPreview in ComparisonCard**

In `ComparisonCard.vue`:

Import the new components:
```typescript
import DiffPreview from "./DiffPreview.vue";
import { getMissingEntries } from "../../composables/useTemplates";
```

For the **patch operation**, instead of showing `ConfirmDialog`, compute a preview of what will change and show `DiffPreview`:

Add computed properties for preview data:
```typescript
const patchPreviewOriginal = ref("");
const patchPreviewUpdated = ref("");
const showPatchPreview = ref(false);
```

Modify `requestPatch()` to compute the diff preview:
```typescript
async function requestPatch() {
  if (!referenceSet.value || !targetSet.value) {
    setStatus("Choose a valid compare-from and compare-to file.");
    return;
  }
  if (!targetSet.value.filePath) {
    setStatus("Compare-to file has no filesystem path. Use folder scan for write-back.");
    return;
  }
  const entries = getMissingEntries(referenceSet.value, targetSet.value);
  if (entries.length === 0) {
    setStatus("No missing keys to add.");
    return;
  }

  // Build preview of what will be appended
  patchPreviewOriginal.value = targetSet.value.rawText;
  let preview = targetSet.value.rawText;
  if (!preview.endsWith("\n")) preview += "\n";
  preview += `# Added by Drift\n`;
  for (const entry of entries) {
    preview += `${entry.key}=${entry.value}\n`;
  }
  patchPreviewUpdated.value = preview;
  showPatchPreview.value = true;
}
```

Replace the `ConfirmDialog` in the template with:
```vue
<DiffPreview
  v-if="showPatchPreview"
  :title="`Add missing keys to ${targetSet?.name}`"
  :file-path="targetSet?.filePath ?? ''"
  :original="patchPreviewOriginal"
  :updated="patchPreviewUpdated"
  :summary="`Will append ${getMissingEntries(referenceSet!, targetSet!).length} missing keys. A backup will be created first.`"
  confirm-label="Apply changes"
  @confirm="showPatchPreview = false; executePatch()"
  @cancel="showPatchPreview = false"
/>
```

**Step 4: Run type check and verify**

Run: `npm run build`
Expected: Clean compilation. Patch action now shows diff preview instead of generic dialog.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add diff preview panel for file write operations"
```

---

## Task 8: Auto-Scan on Project Setup

Automatically scan for .env files when a project root path is saved.

**Files:**
- Modify: `src/components/project/ProjectManagementCard.vue`
- Modify: `src/components/project/ProjectForm.vue`

**Step 1: Trigger auto-scan after project save in ProjectManagementCard**

In `ProjectManagementCard.vue`, modify `onSaveProject` to auto-scan after saving:

```typescript
async function onSaveProject(name: string, rootPath: string) {
  if (!name || !rootPath) {
    setStatus("Project name and root path are required.");
    return;
  }
  const msg = saveProject(name, rootPath);
  if (msg) setStatus(msg);
  log("success", `Project saved: ${name}`);

  // Auto-scan if the project has a valid root path and no sets loaded yet
  const project = activeProject.value;
  if (project && project.rootPath.trim() && props.sets.length === 0) {
    await onScan();
  }
}
```

**Step 2: Demote scan button to refresh icon in ProjectManagementCard**

In the Environment Sets card header, replace the scan button in `FileUploadActions` with a small refresh icon next to the heading:

```vue
<div class="flex items-baseline justify-between gap-3 mb-4">
  <h2 class="text-[17px] font-semibold text-text-primary">.env files</h2>
  <div class="flex items-center gap-2">
    <button
      class="focus-ring rounded-[var(--radius-md)] p-1 text-text-muted hover:text-text-primary transition-colors"
      title="Re-scan project folder"
      :disabled="scanning"
      @click="onScan"
    >
      <svg class="h-3.5 w-3.5" :class="scanning ? 'animate-spin' : ''" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <span v-if="sets.length > 0" class="text-xs text-text-muted">
      {{ sets.length }} file{{ sets.length !== 1 ? 's' : '' }} loaded
    </span>
  </div>
</div>
```

Remove the `@scan` emit from `FileUploadActions` and remove the "Scan project" button from that component.

**Step 3: Run type check and verify**

Run: `npm run build`
Expected: Clean compilation. Saving a new project auto-scans. Scan demoted to refresh icon.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: auto-scan on project setup, demote scan to refresh icon"
```

---

## Task 9: Smart Compare Defaults

Auto-select the most useful compare-from and compare-to sets.

**Files:**
- Modify: `src/components/comparison/ComparisonCard.vue`

**Step 1: Add smart default logic**

In `ComparisonCard.vue`, replace the existing watcher that syncs reference/target defaults. The new logic:

```typescript
watch(
  () => props.sets,
  (sets) => {
    if (sets.length === 0) return;

    // Smart default for compare-from: set with the most keys
    if (!sets.some((s) => s.id === referenceSetId.value)) {
      const sorted = [...sets].sort((a, b) =>
        Object.keys(b.values).length - Object.keys(a.values).length
      );
      referenceSetId.value = sorted[0].id;
    }

    // Smart default for compare-to: prefer local environment
    if (!sets.some((s) => s.id === targetSetId.value)) {
      const local = sets.find((s) => s.role === "local");
      const fallback = sets.find((s) => s.id !== referenceSetId.value);
      targetSetId.value = local?.id ?? fallback?.id ?? sets[0].id;
    }

    // Ensure they differ
    if (referenceSetId.value === targetSetId.value && sets.length > 1) {
      const fallback = sets.find((s) => s.id !== referenceSetId.value);
      if (fallback) targetSetId.value = fallback.id;
    }
  },
  { immediate: true },
);
```

**Step 2: Run type check**

Run: `npm run build`
Expected: Clean compilation.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: smart compare defaults — most keys for from, local for to"
```

---

## Task 10: Contextual Empty States

Replace blank screens with guided empty states on the Dashboard.

**Files:**
- Create: `src/components/layout/EmptyState.vue`
- Modify: `src/App.vue`

**Step 1: Create EmptyState component**

Create `src/components/layout/EmptyState.vue`:
```vue
<script setup lang="ts">
defineProps<{
  heading: string;
  description: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 px-6 text-center">
    <h2 class="text-lg font-semibold text-text-primary">{{ heading }}</h2>
    <p class="text-sm text-text-secondary mt-2 max-w-md">{{ description }}</p>
    <div class="mt-5 flex flex-wrap justify-center gap-2">
      <slot />
    </div>
  </div>
</template>
```

**Step 2: Add empty states to App.vue Dashboard**

In `App.vue`, replace the dashboard template section with conditional empty states:

```vue
<template v-if="page === 'dashboard'">
  <PageHeader
    eyebrow="Overview"
    title="Dashboard"
    description="Compare .env files, identify drift, and apply targeted fixes."
  />

  <!-- Empty state: no project -->
  <EmptyState
    v-if="!activeProject"
    heading="Pick a Laravel project to get started"
    description="Browse to your project folder — Drift will scan for .env files and show you what's missing, what's different, and what's unsafe across environments."
  >
    <BaseButton variant="primary" @click="openPage('projects')">
      Set up a project
    </BaseButton>
  </EmptyState>

  <!-- Empty state: project but no sets -->
  <EmptyState
    v-else-if="currentSets.length === 0"
    :heading="`No .env files loaded for ${activeProject.name}`"
    description="Drift found your project but hasn't loaded any .env files yet."
  >
    <BaseButton variant="primary" @click="openPage('projects')">
      Load .env files
    </BaseButton>
  </EmptyState>

  <!-- Empty state: only one set -->
  <EmptyState
    v-else-if="currentSets.length === 1"
    heading="Add another .env file to start comparing"
    description="Drift needs at least two .env files to detect drift. Load your staging or production .env to see what's missing."
  >
    <BaseButton variant="primary" @click="openPage('projects')">
      Load another file
    </BaseButton>
  </EmptyState>

  <!-- Normal dashboard -->
  <template v-else>
    <KpiBar :sets="currentSets" :analysis="analysis" />
    <ComparisonCard
      :sets="currentSets"
      :analysis="analysis"
      :filtered-rows="analysis"
    />
  </template>
</template>
```

Import `EmptyState` and `BaseButton` in the script:
```typescript
import EmptyState from "./components/layout/EmptyState.vue";
import BaseButton from "./components/ui/BaseButton.vue";
```

**Step 3: Run type check and verify**

Run: `npm run build`
Expected: Clean compilation. Dashboard shows appropriate empty state when no project/sets.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add contextual empty states to Dashboard for guided onboarding"
```

---

## Task 11: Backup Browser — Rust Backend + Vue Component

New Rust command to discover backups, and a Vue component to browse them.

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/types/index.ts`
- Modify: `src/composables/useTauriCommands.ts`
- Create: `src/components/project/BackupBrowser.vue`
- Modify: `src/components/project/ProjectManagementCard.vue`

**Step 1: Add BackupEntry type to frontend types**

In `src/types/index.ts`, append:
```typescript
export interface BackupEntry {
  path: string;
  fileName: string;
  reason: string;
  timestamp: number;
  sizeBytes: number;
  backupType: "json" | "bak";
}
```

**Step 2: Add Rust command `list_project_backups`**

In `src-tauri/src/lib.rs`, add the struct and command:

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupEntry {
    path: String,
    file_name: String,
    reason: String,
    timestamp: u64,
    size_bytes: u64,
    backup_type: String,
}

#[tauri::command]
fn list_project_backups(project_root: String) -> Result<Vec<BackupEntry>, String> {
    let root = PathBuf::from(project_root.trim());
    let mut entries: Vec<BackupEntry> = Vec::new();

    // Scan .drift-backups/ directory for JSON backups
    let backup_dir = root.join(".drift-backups");
    if backup_dir.exists() && backup_dir.is_dir() {
        if let Ok(dir_entries) = fs::read_dir(&backup_dir) {
            for entry in dir_entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with("drift-") && name.ends_with(".json") {
                            let metadata = fs::metadata(&path).ok();
                            let size = metadata.map(|m| m.len()).unwrap_or(0);
                            let (reason, timestamp) = parse_backup_filename(name);
                            entries.push(BackupEntry {
                                path: path.to_string_lossy().to_string(),
                                file_name: name.to_string(),
                                reason,
                                timestamp,
                                size_bytes: size,
                                backup_type: "json".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    // Scan for .bak.* files alongside env files
    collect_bak_files(&root, &mut entries, 0);

    // Sort newest first
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(entries)
}

fn parse_backup_filename(name: &str) -> (String, u64) {
    // Format: drift-{project}-{reason}-{timestamp}.json
    let without_ext = name.strip_suffix(".json").unwrap_or(name);
    let without_prefix = without_ext.strip_prefix("drift-").unwrap_or(without_ext);

    // Find the last numeric segment as timestamp
    let parts: Vec<&str> = without_prefix.rsplitn(2, '-').collect();
    let timestamp = parts.first().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let reason = parts.get(1).unwrap_or(&"unknown").to_string();

    (reason, timestamp)
}

fn collect_bak_files(dir: &Path, entries: &mut Vec<BackupEntry>, depth: usize) {
    if depth > 3 { return; }
    let Ok(dir_entries) = fs::read_dir(dir) else { return };

    for entry in dir_entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if path.is_file() && name.contains(".bak.") {
                let metadata = fs::metadata(&path).ok();
                let size = metadata.map(|m| m.len()).unwrap_or(0);
                let timestamp = name.rsplit('.').next()
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);
                entries.push(BackupEntry {
                    path: path.to_string_lossy().to_string(),
                    file_name: name.to_string(),
                    reason: "file-backup".to_string(),
                    timestamp,
                    size_bytes: size,
                    backup_type: "bak".to_string(),
                });
            }
            if path.is_dir() && !should_skip_dir(name) {
                collect_bak_files(&path, entries, depth + 1);
            }
        }
    }
}
```

Register the new command in the handler:
```rust
.invoke_handler(tauri::generate_handler![
    scan_env_files,
    infer_project_name,
    append_missing_env_keys,
    upsert_env_key,
    write_project_backup,
    list_project_backups
])
```

**Step 3: Add Tauri command wrapper**

In `src/composables/useTauriCommands.ts`, add:
```typescript
import type { ..., BackupEntry } from "../types";

export function listProjectBackups(projectRoot: string): Promise<BackupEntry[]> {
  return invoke<BackupEntry[]>("list_project_backups", { projectRoot });
}
```

**Step 4: Create BackupBrowser component**

Create `src/components/project/BackupBrowser.vue`:
```vue
<script setup lang="ts">
import { ref, watch } from "vue";
import type { BackupEntry } from "../../types";
import { useProjects } from "../../composables/useProjects";
import { listProjectBackups } from "../../composables/useTauriCommands";
import GlassCard from "../ui/GlassCard.vue";
import BaseButton from "../ui/BaseButton.vue";

const { activeProject } = useProjects();
const backups = ref<BackupEntry[]>([]);
const loading = ref(false);
const expanded = ref(false);
const viewingContent = ref<string | null>(null);
const viewingPath = ref("");

async function loadBackups() {
  const project = activeProject.value;
  if (!project?.rootPath) return;

  loading.value = true;
  try {
    backups.value = await listProjectBackups(project.rootPath);
  } catch {
    backups.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => activeProject.value?.id,
  () => {
    backups.value = [];
    viewingContent.value = null;
    if (expanded.value) loadBackups();
  },
);

function toggleExpanded() {
  expanded.value = !expanded.value;
  if (expanded.value && backups.value.length === 0) {
    loadBackups();
  }
}

function formatTime(timestamp: number): string {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;

  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ` at ${time}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function humanReason(reason: string): string {
  return reason.replaceAll("-", " ");
}
</script>

<template>
  <GlassCard padding="p-0">
    <button
      class="focus-ring w-full flex items-center gap-2.5 px-5 py-3.5 text-left rounded-[var(--radius-xl)]"
      :aria-expanded="expanded"
      @click="toggleExpanded"
    >
      <svg class="h-4 w-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="text-sm font-medium text-text-primary flex-1">Backups</span>
      <span v-if="!expanded && backups.length > 0" class="text-xs text-text-muted">
        {{ backups.length }} backup{{ backups.length !== 1 ? 's' : '' }}
      </span>
      <svg
        class="h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-200"
        :class="expanded ? 'rotate-90' : ''"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div v-if="expanded" class="px-5 pb-5">
      <div v-if="loading" class="py-4 text-center text-xs text-text-muted">
        Scanning for backups...
      </div>

      <div v-else-if="backups.length === 0" class="py-4 text-center text-xs text-text-muted">
        No backups found for this project.
      </div>

      <ul v-else class="space-y-1.5">
        <li
          v-for="backup in backups"
          :key="backup.path"
          class="rounded-[var(--radius-md)] border border-border-subtle bg-surface-2/30 px-3 py-2"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-medium text-text-primary truncate">{{ backup.fileName }}</p>
              <p class="text-[11px] text-text-muted mt-0.5">
                {{ humanReason(backup.reason) }} · {{ formatSize(backup.sizeBytes) }}
              </p>
            </div>
            <span class="text-[11px] text-text-muted tabular-nums whitespace-nowrap">
              {{ formatTime(backup.timestamp) }}
            </span>
          </div>
        </li>
      </ul>

      <div class="mt-3 flex gap-2">
        <BaseButton variant="tertiary" size="sm" @click="loadBackups">
          Refresh
        </BaseButton>
      </div>
    </div>
  </GlassCard>
</template>
```

**Step 5: Add BackupBrowser to ProjectManagementCard area**

In `App.vue` or `ProjectManagementCard.vue`, add the `BackupBrowser` component below the project management cards on the Projects page:

In `App.vue`, update the projects template:
```vue
<template v-else-if="page === 'projects'">
  <PageHeader ... />
  <ProjectManagementCard :sets="currentSets" />
  <BackupBrowser />
</template>
```

Import:
```typescript
import BackupBrowser from "./components/project/BackupBrowser.vue";
```

**Step 6: Build the full stack**

Run: `npm run tauri dev` (ensure Rust compiles with the new command)
If only checking frontend types: `npm run build`

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: add backup browser with Rust backend discovery and Vue component"
```

---

## Verification Checklist

After all 11 tasks are complete, verify:

- [ ] All labels use plain English (no "template", "patch", "reference", "target")
- [ ] Activity timeline shows entries for project save, scan, load, patch, edit, delete
- [ ] Masking toggle in header defaults to masked; values hidden in comparison table
- [ ] Clicking a masked value reveals it temporarily
- [ ] Sensitive keys (DB_PASSWORD, APP_KEY, etc.) stay masked even when toggle is revealed
- [ ] Diff preview shows before confirming any file write
- [ ] Saving a new project with a root path auto-scans
- [ ] Compare-from defaults to set with most keys; compare-to defaults to local
- [ ] Dashboard shows appropriate empty state for each stage (no project, no sets, one set)
- [ ] Backup browser lists backups sorted newest-first
- [ ] `npm run build` compiles cleanly
- [ ] `npm run tauri dev` launches without errors
