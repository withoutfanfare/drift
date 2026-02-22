# UX Bugs and Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix data loss bugs, add confirmation dialogs for destructive actions, correct analysis logic, improve accessibility, and harden the backend — all without adding new features or increasing complexity.

**Architecture:** Minimal targeted fixes to existing files. New component: `ConfirmDialog.vue`. No new composables, no new dependencies, no architectural changes.

**Tech Stack:** Vue 3 (Composition API), Tailwind CSS 4, Rust (Tauri 2), TypeScript

**Verification:** No test framework is configured. Each task is verified via `npm run build` (vue-tsc type check) and manual smoke-test in `npm run tauri dev`. Rust changes verified via `cargo check` in `src-tauri/`.

---

## Batch 1: Data Integrity (Critical)

### Task 1: Add missing `persistSets()` call in `addOrReplaceSet` update path

**Files:**
- Modify: `src/composables/useEnvSets.ts:100-108`

**Step 1: Add `persistSets()` after the update path**

In `src/composables/useEnvSets.ts`, the `if (existing)` block at line 100 mutates the set but never persists. Add `persistSets()` before the `return`:

```typescript
    if (existing) {
      existing.name = input.name;
      existing.source = input.source;
      existing.rawText = input.rawText;
      existing.filePath = input.filePath;
      existing.values = values;
      existing.duplicates = duplicates;
      existing.role = role;
      persistSets();
      return;
    }
```

**Step 2: Add `persistSets()` after `push` path too**

The `push` path at line 111-121 also lacks `persistSets()`. Callers (e.g. `ProjectManagementCard.vue:103`) call `persistSets()` themselves after `addOrReplaceSet`, but the function should be self-contained. Add `persistSets()` after the push:

```typescript
    envSets.value.push({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      name: input.name,
      source: input.source,
      rawText: input.rawText,
      filePath: input.filePath,
      values,
      duplicates,
      role,
    });
    persistSets();
```

**Step 3: Remove redundant `persistSets()` calls from callers**

Since `addOrReplaceSet` now persists internally, remove the redundant `persistSets()` calls in `ProjectManagementCard.vue` after each call to `addOrReplaceSet`:

- Line 103: Remove `persistSets();` after the `for` loop in `onScan()`
- Line 137: Remove `persistSets();` after the `for` loop in `onLoadFiles()`
- Line 194: Remove `persistSets();` in `onAddManual()`

Also remove from `useSampleData.ts` if it calls `persistSets()` after `addOrReplaceSet`.

**Step 4: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 5: Commit**

```bash
git add src/composables/useEnvSets.ts src/components/project/ProjectManagementCard.vue src/composables/useSampleData.ts
git commit -m "fix: persist env sets on update path to prevent data loss on refresh"
```

---

### Task 2: Add `persistSets()` to `applyRawToSet`

**Files:**
- Modify: `src/composables/useEnvSets.ts:139-144`

**Step 1: Add persistence call**

```typescript
  function applyRawToSet(set: EnvSet, rawText: string) {
    const parsed = parseEnv(rawText);
    set.rawText = rawText;
    set.values = parsed.values;
    set.duplicates = parsed.duplicates;
    persistSets();
  }
```

**Step 2: Remove redundant `persistSets()` calls from callers**

In `ComparisonCard.vue`, remove the `persistSets()` calls that immediately follow `applyRawToSet()`:

- Line 114: Remove `persistSets();` in `onPatchTarget()`
- Line 131: Remove `persistSets();` in `onApplyMemory()`
- Line 154: Remove `persistSets();` in `onApplyFile()`

**Step 3: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/composables/useEnvSets.ts src/components/comparison/ComparisonCard.vue
git commit -m "fix: persist env sets after applyRawToSet to prevent data loss"
```

---

### Task 3: Add `persistSets()` to `removeSet` and `clearProjectSets`

**Files:**
- Modify: `src/composables/useEnvSets.ts:124-137`

**Step 1: Add persistence to both mutation functions**

```typescript
  function removeSet(setId: string) {
    const index = envSets.value.findIndex((s) => s.id === setId);
    if (index !== -1) {
      envSets.value.splice(index, 1);
      persistSets();
    }
  }

  function clearProjectSets(projectId: string) {
    for (let i = envSets.value.length - 1; i >= 0; i -= 1) {
      if (envSets.value[i].projectId === projectId) {
        envSets.value.splice(i, 1);
      }
    }
    persistSets();
  }
```

**Step 2: Remove redundant `persistSets()` calls from callers**

In `ProjectManagementCard.vue`:
- Line 78: Remove `persistSets();` in `onDeleteProject()` (after orphan removal loop)
- Line 163: Remove `persistSets();` in `onClearSets()`
- Line 173: Remove `persistSets();` in `onRemoveSet()`

**Step 3: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/composables/useEnvSets.ts src/components/project/ProjectManagementCard.vue
git commit -m "fix: persist env sets after remove and clear operations"
```

---

## Batch 2: Confirmation Dialogs for Destructive Actions

### Task 4: Create `ConfirmDialog` component

**Files:**
- Create: `src/components/ui/ConfirmDialog.vue`

**Step 1: Create the component**

```vue
<script setup lang="ts">
import BaseButton from "./BaseButton.vue";

defineProps<{
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    @click.self="emit('cancel')"
  >
    <div
      class="w-full max-w-md rounded-[var(--radius-xl)] border border-border-default bg-surface-1 p-5 shadow-elevated animate-[scale-in_200ms_ease-out]"
      role="alertdialog"
      aria-modal="true"
      :aria-label="title"
    >
      <h3 class="text-sm font-semibold text-text-primary">{{ title }}</h3>
      <p class="mt-2 text-sm text-text-secondary">{{ message }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <BaseButton variant="secondary" size="sm" @click="emit('cancel')">
          {{ cancelLabel ?? "Cancel" }}
        </BaseButton>
        <BaseButton variant="danger" size="sm" @click="emit('confirm')">
          {{ confirmLabel ?? "Confirm" }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
```

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/components/ui/ConfirmDialog.vue
git commit -m "feat: add ConfirmDialog component for destructive action confirmation"
```

---

### Task 5: Add confirmation to "Remove project from Drift"

**Files:**
- Modify: `src/components/project/ProjectForm.vue:111-115`

**Step 1: Add confirm state and dialog**

In `ProjectForm.vue`, add a `confirmingDelete` ref and wrap the emit:

```vue
<script setup lang="ts">
import { ref, watch } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { useStatus } from "../../composables/useStatus";
import { inferProjectName } from "../../composables/useTauriCommands";
import type { ProjectProfile } from "../../types";
import BaseInput from "../ui/BaseInput.vue";
import BaseButton from "../ui/BaseButton.vue";
import ConfirmDialog from "../ui/ConfirmDialog.vue";

// ... existing props/emits/refs unchanged ...

const confirmingDelete = ref(false);
</script>
```

**Step 2: Replace the danger button and add dialog in template**

Replace lines 111-115:

```html
    <div class="border-t border-border-subtle pt-2">
      <p class="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Drift record action</p>
      <BaseButton variant="danger" size="sm" @click="confirmingDelete = true">
        Remove project from Drift
      </BaseButton>
    </div>

    <ConfirmDialog
      v-if="confirmingDelete"
      title="Remove project?"
      :message="`This will remove ${activeProject?.name ?? 'this project'} and all its linked env sets from Drift. A backup will be created first. Your project files are not affected.`"
      confirm-label="Remove project"
      @confirm="confirmingDelete = false; emit('delete')"
      @cancel="confirmingDelete = false"
    />
```

**Step 3: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/components/project/ProjectForm.vue
git commit -m "fix: add confirmation dialog before removing project from Drift"
```

---

### Task 6: Add confirmation to "Clear loaded sets"

**Files:**
- Modify: `src/components/project/FileUploadActions.vue:30-38`

**Step 1: Add confirm state and import**

Add to script:

```vue
<script setup lang="ts">
import { ref } from "vue";
import BaseButton from "../ui/BaseButton.vue";
import ConfirmDialog from "../ui/ConfirmDialog.vue";

// ... existing emit/refs ...

const confirmingClear = ref(false);
</script>
```

**Step 2: Replace danger button and add dialog**

Replace lines 30-38:

```html
    <div class="border-t border-border-subtle pt-2">
      <p class="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Loaded data action</p>
      <BaseButton
        variant="danger"
        size="sm"
        @click="confirmingClear = true"
      >
        Clear loaded sets (Drift only)
      </BaseButton>
    </div>

    <ConfirmDialog
      v-if="confirmingClear"
      title="Clear all loaded sets?"
      message="This will remove all env sets loaded for the active project in Drift. A backup will be created first. Your .env files are not affected."
      confirm-label="Clear sets"
      @confirm="confirmingClear = false; emit('clearSets')"
      @cancel="confirmingClear = false"
    />
```

**Step 3: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/components/project/FileUploadActions.vue
git commit -m "fix: add confirmation dialog before clearing loaded env sets"
```

---

### Task 7: Add confirmation to "Patch Missing Keys to Target"

**Files:**
- Modify: `src/components/comparison/ComparisonCard.vue:95-121`

**Step 1: Add confirm state and import**

In `ComparisonCard.vue`, add:

```typescript
import ConfirmDialog from "../ui/ConfirmDialog.vue";

// ... existing setup ...

const confirmingPatch = ref(false);
```

**Step 2: Split the patch flow**

Replace `onPatchTarget()` to set `confirmingPatch = true` first, and extract the actual patch logic:

```typescript
function requestPatch() {
  if (!referenceSet.value || !targetSet.value) {
    setStatus("Choose a valid reference and target set.");
    return;
  }
  if (!targetSet.value.filePath) {
    setStatus("Target set has no filesystem path. Use folder scan import for safe write-back.");
    return;
  }
  const entries = getMissingEntries(referenceSet.value, targetSet.value);
  if (entries.length === 0) {
    setStatus("No missing keys to append.");
    return;
  }
  confirmingPatch.value = true;
}

async function executePatch() {
  confirmingPatch.value = false;
  if (!referenceSet.value || !targetSet.value?.filePath) return;

  const entries = getMissingEntries(referenceSet.value, targetSet.value);
  try {
    const result = await appendMissingEnvKeys(targetSet.value.filePath, entries, true);
    applyRawToSet(targetSet.value, result.updatedContent);
    const backupInfo = result.backupPath ? ` backup: ${result.backupPath}` : "";
    setStatus(`Patched ${targetSet.value.name}: appended ${result.appendedCount}, skipped ${result.skippedExisting}.${backupInfo}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Patch failed: ${message}`);
  }
}
```

**Step 3: Update template**

Change `@patch-target="onPatchTarget"` to `@patch-target="requestPatch"` on the `TargetRow` component.

Add the dialog at the end of the template:

```html
    <ConfirmDialog
      v-if="confirmingPatch"
      title="Patch target file?"
      :message="`This will append missing keys to ${targetSet?.filePath ?? 'the target file'}. A timestamped backup will be created first.`"
      confirm-label="Patch file"
      @confirm="executePatch"
      @cancel="confirmingPatch = false"
    />
```

**Step 4: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 5: Commit**

```bash
git add src/components/comparison/ComparisonCard.vue
git commit -m "fix: add confirmation dialog before patching target file"
```

---

### Task 8: Add confirmation to "Remove from Drift" on individual env sets

**Files:**
- Modify: `src/components/project/EnvSetItem.vue`

**Step 1: Add confirm state and dialog**

```vue
<script setup lang="ts">
import { ref } from "vue";
import type { EnvSet } from "../../types";
import BaseButton from "../ui/BaseButton.vue";
import ConfirmDialog from "../ui/ConfirmDialog.vue";

defineProps<{
  set: EnvSet;
}>();

const emit = defineEmits<{
  remove: [setId: string];
}>();

const confirming = ref(false);
</script>

<template>
  <li class="flex items-start justify-between gap-2 py-1.5">
    <div class="min-w-0">
      <span class="font-medium text-sm text-text-primary">{{ set.name }}</span>
      <span class="text-xs text-text-tertiary ml-1.5">
        ({{ set.role }}, {{ set.source }}, {{ Object.keys(set.values).length }} keys<template v-if="set.duplicates.length">, {{ set.duplicates.length }} duplicates</template>)
      </span>
      <div v-if="set.filePath" class="text-xs text-text-muted truncate">{{ set.filePath }}</div>
    </div>
    <BaseButton variant="tertiary" size="sm" @click="confirming = true">Remove from Drift</BaseButton>

    <ConfirmDialog
      v-if="confirming"
      title="Remove env set?"
      :message="`Remove ${set.name} from Drift? A backup will be created first. The original file is not affected.`"
      confirm-label="Remove set"
      @confirm="confirming = false; emit('remove', set.id)"
      @cancel="confirming = false"
    />
  </li>
</template>
```

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/components/project/EnvSetItem.vue
git commit -m "fix: add confirmation dialog before removing individual env set"
```

---

## Batch 3: Correctness Fixes

### Task 9: Reset filter/set IDs on project switch

**Files:**
- Modify: `src/components/comparison/ComparisonCard.vue:28-55`

**Step 1: Watch for project change and reset filters**

Import `useProjects` and add a watcher for `activeProjectId`:

```typescript
import { useProjects } from "../../composables/useProjects";

// ... existing setup ...

const { activeProjectId } = useProjects();

// Reset filter state when project changes
watch(activeProjectId, () => {
  filter.value = "all";
  search.value = "";
  referenceSetId.value = "";
  targetSetId.value = "";
});
```

The existing `watch(() => props.sets, ...)` at line 37 will then assign valid set IDs from the new project's sets.

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/components/comparison/ComparisonCard.vue
git commit -m "fix: reset filter and set selection when switching projects"
```

---

### Task 10: Clean up orphaned env sets when deleting a project

**Files:**
- Modify: `src/composables/useProjects.ts:88-101`
- Modify: `src/components/project/ProjectManagementCard.vue:63-80`

**Step 1: Move orphan cleanup into `deleteProject` in `useProjects.ts`**

The orphan cleanup currently lives in `ProjectManagementCard.vue:73-77`. This is a data integrity concern and belongs in the composable. Update `useProjects.ts`:

```typescript
  function deleteProject(cleanupSets?: (projectId: string) => void): string | null {
    const index = projects.value.findIndex((p) => p.id === activeProjectId.value);
    if (index < 0) return null;

    const [removed] = projects.value.splice(index, 1);

    if (cleanupSets) {
      cleanupSets(removed.id);
    }

    if (projects.value.length === 0) {
      projects.value.push(createDefaultProject());
    }

    saveActiveProjectId(projects.value[0].id);
    persistProjects();
    return removed.name;
  }
```

**Step 2: Simplify `onDeleteProject` in `ProjectManagementCard.vue`**

```typescript
async function onDeleteProject() {
  const backupPath = await createProjectBackup("before-delete-project");
  if (!backupPath) return;

  const removedName = deleteProject(clearProjectSets);
  if (!removedName) {
    setStatus("No active project selected.");
    return;
  }
  setStatus(`Removed ${removedName} from Drift (linked loaded sets removed). Backup: ${backupPath}`);
}
```

Remove the manual orphan-removal `for` loop (lines 73-77) and the `envSets` import (if no longer needed).

**Step 3: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/composables/useProjects.ts src/components/project/ProjectManagementCard.vue
git commit -m "fix: clean up orphaned env sets when deleting a project"
```

---

### Task 11: Fix `APP_KEY` unsafe check to only fire on production-like sets

**Files:**
- Modify: `src/composables/useAnalysis.ts:67-69`

**Step 1: Guard `APP_KEY` check with `productionLike`**

Change lines 67-69 from:

```typescript
  if (key === "APP_KEY" && blank) {
    return "APP_KEY is empty or missing";
  }
```

To:

```typescript
  if (productionLike && key === "APP_KEY" && blank) {
    return "APP_KEY is empty or missing";
  }
```

This stops local/staging starter templates from being flagged as unsafe when `APP_KEY` is intentionally blank.

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/composables/useAnalysis.ts
git commit -m "fix: only flag empty APP_KEY as unsafe on production-like sets"
```

---

### Task 12: Fix drift detection for partially-missing keys

**Files:**
- Modify: `src/composables/useAnalysis.ts:37`

**Step 1: Treat keys present in some but not all sets as drift**

Change line 37 from:

```typescript
    const drift = normalizedValues.size > 1;
```

To:

```typescript
    const drift = normalizedValues.size > 1 || (missingCount > 0 && normalizedValues.size > 0);
```

This ensures a key that exists in some sets but is missing from others is correctly flagged as drift, making the "drift" filter show these rows.

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/composables/useAnalysis.ts
git commit -m "fix: detect drift when key exists in some sets but missing from others"
```

---

## Batch 4: Accessibility and UX Polish

### Task 13: Add `id`/`for` pairing to `BaseInput`

**Files:**
- Modify: `src/components/ui/BaseInput.vue`

**Step 1: Generate unique ID and wire up label**

```vue
<script setup lang="ts">
import { useId } from "vue";

const model = defineModel<string>({ required: true });
const inputId = useId();

defineProps<{
  label?: string;
  placeholder?: string;
  type?: string;
}>();
</script>

<template>
  <div>
    <label v-if="label" :for="inputId" class="block mb-1 text-xs text-text-tertiary">{{ label }}</label>
    <input
      :id="inputId"
      v-model="model"
      :type="type ?? 'text'"
      :placeholder="placeholder"
      class="w-full rounded-[var(--radius-md)] border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-ring"
    />
  </div>
</template>
```

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors. Clicking a label now focuses the input.

**Step 3: Commit**

```bash
git add src/components/ui/BaseInput.vue
git commit -m "fix: add id/for pairing to BaseInput for accessibility"
```

---

### Task 14: Add `id`/`for` pairing to `BaseSelect` and dropdown chevron

**Files:**
- Modify: `src/components/ui/BaseSelect.vue`

**Step 1: Add ID, label association, and chevron**

```vue
<script setup lang="ts">
import { useId } from "vue";

const model = defineModel<string>({ required: true });
const selectId = useId();

defineProps<{
  label?: string;
}>();
</script>

<template>
  <div>
    <label v-if="label" :for="selectId" class="block mb-1 text-xs text-text-tertiary">{{ label }}</label>
    <div class="relative">
      <select
        :id="selectId"
        v-model="model"
        class="w-full rounded-[var(--radius-md)] border border-border-default bg-surface-1 px-3 py-2 pr-8 text-sm text-text-primary focus-ring appearance-none"
      >
        <slot />
      </select>
      <svg
        class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
      </svg>
    </div>
  </div>
</template>
```

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors. Dropdown now shows a chevron icon.

**Step 3: Commit**

```bash
git add src/components/ui/BaseSelect.vue
git commit -m "fix: add id/for pairing and dropdown chevron to BaseSelect"
```

---

### Task 15: Add `id`/`for` pairing to `BaseTextarea`

**Files:**
- Modify: `src/components/ui/BaseTextarea.vue`

**Step 1: Add ID and label association**

```vue
<script setup lang="ts">
import { useId } from "vue";

const model = defineModel<string>({ required: true });
const textareaId = useId();

defineProps<{
  label?: string;
  placeholder?: string;
  rows?: number;
}>();
</script>

<template>
  <div>
    <label v-if="label" :for="textareaId" class="block mb-1 text-xs text-text-tertiary">{{ label }}</label>
    <textarea
      :id="textareaId"
      v-model="model"
      :placeholder="placeholder"
      :rows="rows ?? 5"
      class="w-full rounded-[var(--radius-md)] border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary font-mono placeholder:text-text-muted focus-ring resize-y"
    />
  </div>
</template>
```

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/components/ui/BaseTextarea.vue
git commit -m "fix: add id/for pairing to BaseTextarea for accessibility"
```

---

### Task 16: Add `aria-live` to `StatusMessage`

**Files:**
- Modify: `src/components/comparison/StatusMessage.vue:8-13`

**Step 1: Add `role` and `aria-live` attributes**

```vue
<template>
  <p
    v-if="message"
    role="status"
    aria-live="polite"
    class="min-h-[1.4rem] text-sm text-accent transition-opacity duration-200"
  >
    {{ message }}
  </p>
</template>
```

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/components/comparison/StatusMessage.vue
git commit -m "fix: add aria-live to StatusMessage for screen reader announcements"
```

---

### Task 17: Add `aria-current` to active nav item

**Files:**
- Modify: `src/App.vue:55-87`

**Step 1: Add `:aria-current` to each nav button**

On each of the three nav buttons, add the attribute:

Dashboard button (line 55-64):
```html
            <button
              class="w-full rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-sm transition-colors flex items-center gap-2"
              :class="page === 'dashboard' ? 'text-accent font-semibold' : 'text-text-muted hover:text-text-primary'"
              :aria-current="page === 'dashboard' ? 'page' : undefined"
              @click="openPage('dashboard')"
            >
```

Projects button (line 66-74):
```html
              :aria-current="page === 'projects' ? 'page' : undefined"
```

Help button (line 76-87):
```html
              :aria-current="page === 'help' ? 'page' : undefined"
```

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/App.vue
git commit -m "fix: add aria-current to active nav item for screen readers"
```

---

### Task 18: Add empty-state placeholder to `ProjectSelector`

**Files:**
- Modify: `src/components/project/ProjectSelector.vue:13-15`

**Step 1: Add a disabled placeholder option when no projects exist**

```vue
<template>
  <BaseSelect v-model="activeProjectId" label="Active project">
    <option v-if="projects.length === 0" value="" disabled>No projects - create one first</option>
    <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
  </BaseSelect>
</template>
```

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/components/project/ProjectSelector.vue
git commit -m "fix: add empty-state placeholder to ProjectSelector dropdown"
```

---

### Task 19: Add loading state to "Scan .env files" button

**Files:**
- Modify: `src/components/project/ProjectForm.vue:103-105`
- Modify: `src/components/project/ProjectManagementCard.vue`

**Step 1: Add `scanning` prop to ProjectForm**

In `ProjectForm.vue`, add a `scanning` prop:

```typescript
const props = defineProps<{
  activeProject: ProjectProfile | undefined;
  scanning?: boolean;
}>();
```

Update the scan button (line 103):

```html
      <BaseButton variant="tertiary" size="sm" :loading="scanning" @click="emit('scan')">
        Scan .env files
      </BaseButton>
```

**Step 2: Add `scanning` ref to `ProjectManagementCard.vue`**

```typescript
const scanning = ref(false);

async function onScan() {
  const project = activeProject.value;
  if (!project) {
    setStatus("No active project selected.");
    return;
  }
  if (!project.rootPath.trim()) {
    setStatus("Set a valid project root path first.");
    return;
  }
  scanning.value = true;
  try {
    const scanned = await scanEnvFiles(project.rootPath);
    for (const file of scanned) {
      addOrReplaceSet({
        projectId: project.id,
        name: file.name,
        source: "scan",
        rawText: file.content,
        filePath: file.path,
      });
    }
    setStatus(`Discovered ${scanned.length} .env file${scanned.length === 1 ? "" : "s"} in ${project.name}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Scan failed: ${message}`);
  } finally {
    scanning.value = false;
  }
}
```

Pass it to the template:

```html
      <ProjectForm
        :active-project="activeProject"
        :scanning="scanning"
        @save="onSaveProject"
        @delete="onDeleteProject"
        @scan="onScan"
        @baseline="onBaseline"
      />
```

**Step 3: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/components/project/ProjectForm.vue src/components/project/ProjectManagementCard.vue
git commit -m "fix: show loading spinner on scan button during filesystem scan"
```

---

### Task 20: Fix `BaseButton` to show label alongside spinner during loading

**Files:**
- Modify: `src/components/ui/BaseButton.vue:114-115`

**Step 1: Show slot content alongside spinner**

Change line 115 from `<slot v-if="!loading" />` to always show:

```html
    <!-- Loading spinner -->
    <svg
      v-if="loading"
      class="h-4 w-4 animate-spin shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>

    <!-- Content (always visible) -->
    <slot />
```

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors. Button label now remains visible alongside the spinner.

**Step 3: Commit**

```bash
git add src/components/ui/BaseButton.vue
git commit -m "fix: show button label alongside spinner to prevent layout shift"
```

---

### Task 21: Clear `ManualSetForm` after successful submission

**Files:**
- Modify: `src/components/project/ManualSetForm.vue:27-33`

**Step 1: Reset fields after emit**

```typescript
function submit() {
  const name = manualName.value.trim();
  const rawText = manualContent.value;
  if (!name || rawText.trim().length === 0) return;

  emit("addManual", name, asRole(manualRole.value), rawText);

  manualName.value = "";
  manualRole.value = "local";
  manualContent.value = "";
}
```

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/components/project/ManualSetForm.vue
git commit -m "fix: clear ManualSetForm fields after successful submission"
```

---

### Task 22: Add `max-height` to `ComparisonTable` for large datasets

**Files:**
- Modify: `src/components/comparison/ComparisonTable.vue:16`

**Step 1: Add max-height to the scrollable wrapper**

Change line 16 from:

```html
  <div class="mt-4 overflow-auto rounded-[var(--radius-lg)] border border-border-default">
```

To:

```html
  <div class="mt-4 max-h-[60vh] overflow-auto rounded-[var(--radius-lg)] border border-border-default">
```

The `sticky top-0` on `thead` at line 19 already handles the fixed header within the scroll container.

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/components/comparison/ComparisonTable.vue
git commit -m "fix: cap comparison table height at 60vh to prevent unbounded growth"
```

---

### Task 23: Add scroll fade indicator to `EnvSetList` and `WarningsList`

**Files:**
- Modify: `src/components/project/EnvSetList.vue:17`
- Modify: `src/components/comparison/WarningsList.vue:41-44`

**Step 1: Increase max-height and add gradient overlay to `EnvSetList`**

Replace lines 17-24:

```html
    <div v-if="sets.length > 0" class="relative">
      <ul class="max-h-56 overflow-y-auto space-y-0.5">
        <EnvSetItem
          v-for="s in sets"
          :key="s.id"
          :set="s"
          @remove="emit('remove', $event)"
        />
      </ul>
      <div
        v-if="sets.length > 4"
        class="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-surface-base/80 to-transparent"
      />
    </div>
```

**Step 2: Same pattern for `WarningsList`**

Replace lines 41-48:

```html
    <div v-if="warnings.length > 0" class="relative">
      <ul class="max-h-56 overflow-y-auto space-y-1 text-sm text-text-secondary">
        <li v-for="(w, i) in warnings" :key="i" class="pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-text-muted">
          {{ w }}
        </li>
      </ul>
      <div
        v-if="warnings.length > 6"
        class="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-surface-base/80 to-transparent"
      />
    </div>
```

**Step 3: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/components/project/EnvSetList.vue src/components/comparison/WarningsList.vue
git commit -m "fix: increase list max-height and add scroll fade indicators"
```

---

### Task 24: Warn when inline editor source and target are the same set

**Files:**
- Modify: `src/components/comparison/InlineDriftEditor.vue:94-98`

**Step 1: Add a computed warning and display it**

In the script section:

```typescript
const sameSetWarning = computed(() => editorSourceId.value === editorTargetId.value && editorSourceId.value !== "");
```

In the template, add a warning between the textarea and the buttons (after line 92):

```html
    <p v-if="sameSetWarning" class="mt-2 text-xs text-warning">
      Source and target are the same set. Changes will be applied to the same set they were loaded from.
    </p>
```

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/components/comparison/InlineDriftEditor.vue
git commit -m "fix: warn when inline editor source and target are the same set"
```

---

### Task 25: Make `OnboardingGuide` status badge dynamic

**Files:**
- Modify: `src/components/help/OnboardingGuide.vue:128-131`

**Step 1: Add computed for completed steps count**

In the script:

```typescript
const completedSteps = computed(() => quickSteps.value.filter((s) => s.complete).length);
const allComplete = computed(() => completedSteps.value === quickSteps.value.length);
```

**Step 2: Replace hardcoded badge**

Replace lines 129-131:

```html
          <span
            class="inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-semibold"
            :class="allComplete
              ? 'border-success/35 bg-success/15 text-success'
              : 'border-warning/35 bg-warning/15 text-warning'"
          >
            {{ allComplete ? 'All steps complete' : `${completedSteps} of ${quickSteps.length} complete` }}
          </span>
```

**Step 3: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/components/help/OnboardingGuide.vue
git commit -m "fix: make onboarding guide status badge reflect actual progress"
```

---

## Batch 5: Backend Hardening

### Task 26: Make file writes atomic in Rust backend

**Files:**
- Modify: `src-tauri/src/lib.rs:148-169` (append_missing_env_keys)
- Modify: `src-tauri/src/lib.rs:227-242` (upsert_env_key)

**Step 1: Create an `atomic_write` helper**

Add this helper function near the bottom of `lib.rs` (before `run()`):

```rust
fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let tmp_path = path.with_extension("drift-tmp");
    fs::write(&tmp_path, content)
        .map_err(|error| format!("Failed to write temporary file: {}", error))?;
    fs::rename(&tmp_path, path)
        .map_err(|error| {
            // Clean up temp file on rename failure
            let _ = fs::remove_file(&tmp_path);
            format!("Failed to rename temporary file: {}", error)
        })?;
    Ok(())
}
```

**Step 2: Replace `fs::write(&path, &updated)` in `append_missing_env_keys`**

Change line 169 from:

```rust
    fs::write(&path, &updated).map_err(|error| format!("Failed to update target env file: {}", error))?;
```

To:

```rust
    atomic_write(&path, &updated)?;
```

**Step 3: Replace `fs::write(&path, &updated)` in `upsert_env_key`**

Change line 242 from:

```rust
    fs::write(&path, &updated).map_err(|error| format!("Failed to update target env file: {}", error))?;
```

To:

```rust
    atomic_write(&path, &updated)?;
```

**Step 4: Verify**

Run: `cd src-tauri && cargo check`
Expected: No errors.

**Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "fix: use atomic write (tmp + rename) to prevent partial file corruption"
```

---

### Task 27: Skip symlinks in `collect_env_files`

**Files:**
- Modify: `src-tauri/src/lib.rs:319-331`

**Step 1: Check file type from `DirEntry` before following**

Replace the directory/file check logic (lines 325-335):

```rust
        // Skip symlinks to prevent traversal outside the project tree
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            if should_skip_dir(file_name) {
                continue;
            }
            collect_env_files(&path, root, files, depth + 1)?;
            continue;
        }

        if !file_type.is_file() || !is_env_file(file_name) {
            continue;
        }
```

**Step 2: Verify**

Run: `cd src-tauri && cargo check`
Expected: No errors.

**Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "fix: skip symlinks in env file scanner to prevent traversal"
```

---

### Task 28: Strip newlines from env values in `format_env_value`

**Files:**
- Modify: `src-tauri/src/lib.rs:538-549`

**Step 1: Sanitise newlines and carriage returns**

```rust
fn format_env_value(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }

    // Strip newlines and carriage returns that would corrupt .env format
    let sanitised: String = value.chars().filter(|&ch| ch != '\n' && ch != '\r').collect();

    if sanitised.contains(char::is_whitespace) || sanitised.contains('#') {
        let escaped = sanitised.replace('"', "\\\"");
        return format!("\"{}\"", escaped);
    }

    sanitised
}
```

**Step 2: Verify**

Run: `cd src-tauri && cargo check`
Expected: No errors.

**Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "fix: strip newlines from env values to prevent file corruption"
```

---

### Task 29: Fix `unix_timestamp` to avoid backup collisions

**Files:**
- Modify: `src-tauri/src/lib.rs:572-577`

**Step 1: Use fallback based on process ID to avoid collisions**

```rust
fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_else(|_| {
            eprintln!("Warning: system clock before UNIX epoch, using fallback timestamp");
            std::process::id() as u64
        })
}
```

**Step 2: Verify**

Run: `cd src-tauri && cargo check`
Expected: No errors.

**Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "fix: use process ID fallback for timestamp to avoid backup collisions"
```

---

### Task 30: Set a restrictive CSP in Tauri config

**Files:**
- Modify: `src-tauri/tauri.conf.json:24`

**Step 1: Replace null CSP with a restrictive policy**

Change:

```json
    "security": {
      "csp": null
    }
```

To:

```json
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' asset: https://asset.localhost"
    }
```

**Step 2: Verify**

Run: `npm run tauri dev`
Expected: App loads without CSP violations in the console. If there are violations, adjust the policy.

**Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "fix: enable restrictive Content Security Policy for webview"
```

---

### Task 31: Preserve line endings in frontend `upsertEnvKeyInRaw`

**Files:**
- Modify: `src/composables/useEnvMutations.ts:5,30`

**Step 1: Detect and preserve original line endings**

```typescript
export function upsertEnvKeyInRaw(rawText: string, key: string, value: string): LocalUpsertResult {
  const lineEnding = rawText.includes("\r\n") ? "\r\n" : "\n";
  const lines = rawText.split(/\r?\n/);
  let matchedCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const parsedKey = parseKeyFromEnvLine(lines[index]);
    if (parsedKey !== key) {
      continue;
    }

    lines[index] = `${key}=${formatValue(value)}`;
    matchedCount += 1;
  }

  let appended = false;
  if (matchedCount === 0) {
    appended = true;

    if (lines.length > 0 && lines[lines.length - 1].trim().length > 0) {
      lines.push("");
    }

    lines.push(`# Added by Drift at ${Date.now()}`);
    lines.push(`${key}=${formatValue(value)}`);
  }

  const updatedContent = `${lines.join(lineEnding)}${lineEnding}`;

  return {
    updatedContent,
    matchedCount,
    appended,
  };
}
```

**Step 2: Verify**

Run: `npm run build`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/composables/useEnvMutations.ts
git commit -m "fix: preserve original line endings (CRLF/LF) in env file mutations"
```

---

## Summary

| Batch | Tasks | Focus |
|-------|-------|-------|
| 1 | 1-3 | Data integrity: persist all state mutations |
| 2 | 4-8 | Confirmation dialogs for all destructive actions |
| 3 | 9-12 | Correctness: stale state, analysis logic |
| 4 | 13-25 | Accessibility and UX polish |
| 5 | 26-31 | Backend hardening: atomic writes, symlinks, CSP |

Total: 31 tasks across 5 batches. Each task is independently verifiable and committable.
