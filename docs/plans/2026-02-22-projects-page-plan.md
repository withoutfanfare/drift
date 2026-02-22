# Projects Page Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the monolithic Projects page with a two-card layout: a collapsible Project Settings card and a prominent Environment Sets card with role badges and proper item styling.

**Architecture:** The single `ProjectManagementCard` GlassCard is split into two GlassCards. Card 1 (Project Settings) is collapsible, collapsed by default, containing the project form inputs and actions. Card 2 (Environment Sets) is the primary focus, with action buttons at the top, properly styled set items with role badges, and a collapsible manual entry section at the bottom. `EnvSetItem` is restyled from a cramped `<li>` to a proper inner card with role badge.

**Tech Stack:** Vue 3 Composition API, Tailwind CSS 4, Spool design tokens

**Design doc:** `docs/plans/2026-02-22-projects-page-design.md`

---

### Task 1: Restyle EnvSetItem with role badges and inner card

**Files:**
- Modify: `src/components/project/EnvSetItem.vue`

**Step 1: Replace the component template and script**

The current `EnvSetItem` is a cramped `<li>` with everything on one line. Replace it with a proper inner card that has:
- Role badge (coloured by role type)
- Set name as primary text
- Metadata line (role badge + source + key count + duplicates)
- Optional file path line
- Remove button

```vue
<script setup lang="ts">
import { ref, computed } from "vue";
import type { EnvSet } from "../../types";
import BaseButton from "../ui/BaseButton.vue";
import ConfirmDialog from "../ui/ConfirmDialog.vue";

const props = defineProps<{
  set: EnvSet;
}>();

const emit = defineEmits<{
  remove: [setId: string];
}>();

const confirming = ref(false);

const keyCount = computed(() => Object.keys(props.set.values).length);

const roleBadgeClasses = computed(() => {
  switch (props.set.role) {
    case "local":
      return "bg-accent-muted text-accent";
    case "staging":
      return "bg-warning/15 text-warning";
    case "live":
      return "bg-danger/15 text-danger";
    default:
      return "bg-surface-2 text-text-tertiary";
  }
});
</script>

<template>
  <li class="rounded-[var(--radius-md)] border border-border-subtle bg-surface-1/50 p-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-text-primary truncate">{{ set.name }}</p>
        <div class="flex flex-wrap items-center gap-1.5 mt-1">
          <span
            class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            :class="roleBadgeClasses"
          >
            {{ set.role }}
          </span>
          <span class="text-xs text-text-muted">&middot;</span>
          <span class="text-xs text-text-muted">{{ set.source }}</span>
          <span class="text-xs text-text-muted">&middot;</span>
          <span class="text-xs text-text-muted">{{ keyCount }} key{{ keyCount !== 1 ? 's' : '' }}</span>
          <template v-if="set.duplicates.length > 0">
            <span class="text-xs text-text-muted">&middot;</span>
            <span class="text-xs text-warning">{{ set.duplicates.length }} dup{{ set.duplicates.length !== 1 ? 's' : '' }}</span>
          </template>
        </div>
        <p v-if="set.filePath" class="text-xs text-text-muted font-mono truncate mt-1">{{ set.filePath }}</p>
      </div>
      <BaseButton variant="ghost" size="sm" @click="confirming = true">Remove</BaseButton>
    </div>

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

**Key changes from current:**
- Changed from flat `<li>` with inline metadata to a bordered inner card with `bg-surface-1/50`
- Role is now a coloured badge instead of plain parenthesised text
- Key count is a separate labelled item instead of being buried in parentheses
- Duplicates highlighted in warning colour
- File path on its own line with monospace font
- Remove button changed from `variant="tertiary"` to `variant="ghost"` and shortened to "Remove"

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/project/EnvSetItem.vue
git commit -m "feat: restyle env set items with role badges and inner cards"
```

---

### Task 2: Update EnvSetList to remove scroll constraints

**Files:**
- Modify: `src/components/project/EnvSetList.vue`

**Step 1: Remove the cramped scroll container and heading**

Replace the current template. Remove:
- The "Sets in Active Project" heading
- The `max-h-56 overflow-y-auto` scroll constraint
- The gradient fade overlay
- The `mt-5` top margin (parent will handle spacing)

```vue
<script setup lang="ts">
import type { EnvSet } from "../../types";
import EnvSetItem from "./EnvSetItem.vue";

defineProps<{
  sets: EnvSet[];
}>();

const emit = defineEmits<{
  remove: [setId: string];
}>();
</script>

<template>
  <ul v-if="sets.length > 0" class="space-y-2">
    <EnvSetItem
      v-for="s in sets"
      :key="s.id"
      :set="s"
      @remove="emit('remove', $event)"
    />
  </ul>
  <div v-else class="py-8 text-center">
    <p class="text-sm text-text-secondary">No environment sets loaded yet.</p>
    <p class="text-xs text-text-muted mt-1">Scan your project or load .env files to begin.</p>
  </div>
</template>
```

**Key changes:**
- Removed the outer `<div>` wrapper, heading, scroll constraint, and gradient overlay
- `<ul>` gets `space-y-2` for proper spacing between the new inner-card items
- Empty state is now a centred message with two lines (moved from the parent to here)
- The parent (ProjectManagementCard) will add action buttons to the empty state

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/project/EnvSetList.vue
git commit -m "refactor: remove scroll constraint, add centred empty state to EnvSetList"
```

---

### Task 3: Clean up ProjectForm — remove micro-labels

**Files:**
- Modify: `src/components/project/ProjectForm.vue`

**Step 1: Remove the "Drift record action" micro-label**

In the template, remove the `<p>` with the uppercase micro-label above the danger button:

Replace lines 114-115 (the border-t section):
```html
    <div class="border-t border-border-subtle pt-2">
      <p class="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Drift record action</p>
```

With just:
```html
    <div class="border-t border-border-subtle pt-3">
```

This removes the "Drift record action" label. The divider + red danger button are self-explanatory.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/project/ProjectForm.vue
git commit -m "chore: remove micro-label from ProjectForm danger zone"
```

---

### Task 4: Clean up FileUploadActions — remove micro-label

**Files:**
- Modify: `src/components/project/FileUploadActions.vue`

**Step 1: Remove the "Loaded data action" micro-label**

In the template, replace lines 32-33:
```html
    <div class="border-t border-border-subtle pt-2">
      <p class="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Loaded data action</p>
```

With:
```html
    <div class="border-t border-border-subtle pt-3">
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/project/FileUploadActions.vue
git commit -m "chore: remove micro-label from FileUploadActions danger zone"
```

---

### Task 5: Restructure ProjectManagementCard into two-card layout

**Files:**
- Modify: `src/components/project/ProjectManagementCard.vue`

**Step 1: Replace the template and add collapse state**

This is the main restructuring task. The single GlassCard becomes two separate GlassCards.

```vue
<script setup lang="ts">
import { ref } from "vue";
import type { EnvSet, EnvRole } from "../../types";
import { useProjects } from "../../composables/useProjects";
import { useEnvSets } from "../../composables/useEnvSets";
import { useSampleData } from "../../composables/useSampleData";
import { useStatus } from "../../composables/useStatus";
import { scanEnvFiles, writeProjectBackup } from "../../composables/useTauriCommands";
import GlassCard from "../ui/GlassCard.vue";
import BaseButton from "../ui/BaseButton.vue";
import ProjectForm from "./ProjectForm.vue";
import FileUploadActions from "./FileUploadActions.vue";
import ManualSetForm from "./ManualSetForm.vue";
import EnvSetList from "./EnvSetList.vue";

const props = defineProps<{
  sets: EnvSet[];
}>();

const { activeProject, saveProject, deleteProject } = useProjects();
const { addOrReplaceSet, removeSet, clearProjectSets } = useEnvSets();
const { loadSampleData, createBaselineSets } = useSampleData();
const { setStatus } = useStatus();
const showManualForm = ref(false);
const scanning = ref(false);
const settingsExpanded = ref(false);

function onSaveProject(name: string, rootPath: string) {
  if (!name || !rootPath) {
    setStatus("Project name and root path are required.");
    return;
  }
  const msg = saveProject(name, rootPath);
  if (msg) setStatus(msg);
}

async function createProjectBackup(reason: string): Promise<string | null> {
  const project = activeProject.value;
  if (!project) {
    setStatus("No active project selected.");
    return null;
  }

  try {
    const result = await writeProjectBackup(
      project.name,
      project.rootPath,
      reason,
      props.sets.map((set) => ({
        name: set.name,
        role: set.role,
        source: set.source,
        filePath: set.filePath,
        rawText: set.rawText,
      })),
    );
    return result.backupPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Backup failed. Destructive action cancelled: ${message}`);
    return null;
  }
}

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

function onBaseline() {
  const project = activeProject.value;
  if (!project) {
    setStatus("No active project selected.");
    return;
  }
  const created = createBaselineSets(project.id);
  setStatus(created > 0 ? `Created ${created} starter template set${created > 1 ? "s" : ""}.` : "Starter templates already complete.");
}

async function onLoadFiles(files: File[]) {
  const project = activeProject.value;
  if (!project) {
    setStatus("No active project selected.");
    return;
  }
  for (const file of files) {
    const raw = await file.text();
    addOrReplaceSet({
      projectId: project.id,
      name: file.name,
      source: "file",
      rawText: raw,
    });
  }
  setStatus(`Loaded ${files.length} file${files.length > 1 ? "s" : ""} into ${project.name}.`);
}

function onLoadSample() {
  const project = activeProject.value;
  if (!project) {
    setStatus("No active project selected.");
    return;
  }
  loadSampleData(project.id);
  setStatus(`Loaded sample local/staging/live sets into ${project.name}.`);
}

async function onClearSets() {
  const project = activeProject.value;
  if (!project) {
    setStatus("No active project selected.");
    return;
  }

  const backupPath = await createProjectBackup("before-clear-project-sets");
  if (!backupPath) return;

  clearProjectSets(project.id);
  setStatus(`Cleared loaded env sets for ${project.name} in Drift. Backup: ${backupPath}`);
}

async function onRemoveSet(setId: string) {
  const backupPath = await createProjectBackup("before-remove-set");
  if (!backupPath) return;

  const set = props.sets.find((s) => s.id === setId);
  removeSet(setId);
  if (set) setStatus(`Removed ${set.name} from Drift. Backup: ${backupPath}`);
}

function onAddManual(name: string, role: EnvRole, rawText: string) {
  const project = activeProject.value;
  if (!project) {
    setStatus("No active project selected.");
    return;
  }
  if (!name || rawText.trim().length === 0) {
    setStatus("Manual set name and content are required.");
    return;
  }
  addOrReplaceSet({
    projectId: project.id,
    name,
    source: "manual",
    rawText,
    role,
  });
  setStatus(`Added ${name} to ${project.name}.`);
}
</script>

<template>
  <!-- Card 1: Project Settings (collapsible) -->
  <GlassCard padding="p-0">
    <button
      class="focus-ring w-full flex items-center gap-2.5 px-5 py-3.5 text-left rounded-[var(--radius-xl)]"
      @click="settingsExpanded = !settingsExpanded"
    >
      <svg class="h-4 w-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.8" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" stroke-width="1.8" />
      </svg>
      <span class="text-sm font-medium text-text-primary flex-1">Project Settings</span>
      <span v-if="!settingsExpanded" class="text-xs text-text-muted truncate max-w-[200px]">
        {{ activeProject?.name ?? "No project" }}
      </span>
      <svg
        class="h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-200"
        :class="settingsExpanded ? 'rotate-90' : ''"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div v-if="settingsExpanded" class="px-5 pb-5">
      <ProjectForm
        :active-project="activeProject"
        :scanning="scanning"
        @save="onSaveProject"
        @delete="onDeleteProject"
        @scan="onScan"
        @baseline="onBaseline"
      />
    </div>
  </GlassCard>

  <!-- Card 2: Environment Sets (main focus) -->
  <GlassCard>
    <div class="flex items-baseline justify-between gap-3 mb-4">
      <h2 class="text-[17px] font-semibold text-text-primary">Environment Sets</h2>
      <span v-if="sets.length > 0" class="text-xs text-text-muted">
        {{ sets.length }} set{{ sets.length !== 1 ? 's' : '' }} loaded
      </span>
    </div>

    <!-- Action buttons -->
    <div class="flex flex-wrap gap-2 mb-4">
      <FileUploadActions
        @load-files="onLoadFiles"
        @load-sample="onLoadSample"
        @clear-sets="onClearSets"
      />
    </div>

    <!-- Set list -->
    <EnvSetList :sets="sets" @remove="onRemoveSet" />

    <!-- Manual entry (collapsible) -->
    <div class="mt-4 border-t border-border-subtle pt-3">
      <button
        class="focus-ring flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors rounded"
        @click="showManualForm = !showManualForm"
      >
        <svg
          class="h-3 w-3 transition-transform duration-200"
          :class="showManualForm ? 'rotate-90' : ''"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Paste .env content manually
      </button>
      <ManualSetForm v-if="showManualForm" @add-manual="onAddManual" />
    </div>
  </GlassCard>
</template>
```

**Key changes from current:**
- Single GlassCard split into two separate GlassCards
- Card 1 (Project Settings): Uses `padding="p-0"` on GlassCard and manages its own padding. The header is a `<button>` that toggles `settingsExpanded`. Shows a cog icon, "Project Settings" title, collapsed project name preview, and chevron. Content hidden by default.
- Card 2 (Environment Sets): Has title + count badge header, action buttons, set list, and collapsible manual entry at the bottom
- Removed: "Project + Env Set Management" heading, "Keep project records..." subtitle, "Project setup" label, "Set loading" label, "Manual set entry" bordered section with Show/Hide toggle
- Manual entry is now a subtle text link with chevron instead of a bordered section
- The template now renders two sibling elements (both GlassCards), which sit inside the `space-y-5` wrapper in App.vue

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/project/ProjectManagementCard.vue
git commit -m "feat: split Projects page into collapsible settings + env sets cards"
```

---

### Task 6: Adjust FileUploadActions for inline rendering

**Files:**
- Modify: `src/components/project/FileUploadActions.vue`

**Step 1: Remove the outer wrapper div for inline rendering**

The `FileUploadActions` is now rendered inside a `flex flex-wrap gap-2` container in `ProjectManagementCard`. Its own outer `<div class="space-y-2">` wrapper creates unwanted nesting. Flatten it so the buttons render directly.

Replace the template with:

```vue
<template>
  <BaseButton variant="primary" size="sm" @click="fileInputRef?.click()">Load .env files</BaseButton>
  <BaseButton variant="tertiary" size="sm" :loading="scanning" @click="emit('scan')">Scan project</BaseButton>
  <BaseButton variant="tertiary" size="sm" @click="emit('loadSample')">Load sample trio</BaseButton>

  <input
    ref="fileInputRef"
    type="file"
    accept=".env,.txt"
    multiple
    class="hidden"
    @change="onFileChange"
  />
</template>
```

Wait — FileUploadActions currently also contains the "Clear loaded sets" danger button and the ConfirmDialog. These need to move somewhere.

**Revised approach:** FileUploadActions should keep its clear functionality but the danger button moves to the bottom of the env sets card, after the manual entry section. Update ProjectManagementCard to render the clear button separately.

Actually, the simplest approach is to update FileUploadActions to emit a `scan` event too and have it render all the loading action buttons, plus keep the clear danger button inside it but at the bottom. Let me reconsider...

The cleanest solution: Keep FileUploadActions as-is (it works fine structurally) but just remove the outer wrapper and the section micro-label (already done in Task 4). The parent's `flex flex-wrap` will handle button layout. The clear button + confirm dialog stay inside FileUploadActions — they'll just be separated from the load buttons visually since the clear button has its own border-t divider.

So actually, the current `FileUploadActions` structure with its inner `space-y-2` div is fine — it contains the load buttons at the top AND the clear danger section at the bottom. We should NOT flatten it. Instead, we just need to adjust `ProjectManagementCard` to NOT wrap it in `flex flex-wrap gap-2`.

**Revised ProjectManagementCard template for the action buttons area:**

Replace the "Action buttons" section in ProjectManagementCard from Task 5:

```html
    <!-- Action buttons -->
    <div class="flex flex-wrap gap-2 mb-4">
      <FileUploadActions
        @load-files="onLoadFiles"
        @load-sample="onLoadSample"
        @clear-sets="onClearSets"
      />
    </div>
```

With:
```html
    <!-- Loading actions -->
    <div class="mb-4">
      <FileUploadActions
        @load-files="onLoadFiles"
        @load-sample="onLoadSample"
        @clear-sets="onClearSets"
      />
    </div>
```

This removes the `flex flex-wrap gap-2` wrapper (FileUploadActions handles its own layout internally) and just uses a simple `mb-4` wrapper for spacing.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/project/ProjectManagementCard.vue src/components/project/FileUploadActions.vue
git commit -m "fix: adjust FileUploadActions layout in restructured env sets card"
```

---

### Task 7: Move clear-sets danger button to bottom of env sets card

**Files:**
- Modify: `src/components/project/FileUploadActions.vue`
- Modify: `src/components/project/ProjectManagementCard.vue`

**Step 1: Remove clear functionality from FileUploadActions**

FileUploadActions should only handle loading actions (load files, load sample). The "clear sets" danger action belongs at the bottom of the env sets card, not mixed in with the loading buttons.

Update `FileUploadActions.vue` — remove the `clearSets` emit, the `confirmingClear` ref, the danger button, and the ConfirmDialog:

```vue
<script setup lang="ts">
import { ref } from "vue";
import BaseButton from "../ui/BaseButton.vue";

const emit = defineEmits<{
  loadFiles: [files: File[]];
  loadSample: [];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length > 0) {
    emit("loadFiles", files);
  }
  input.value = "";
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <BaseButton variant="primary" size="sm" @click="fileInputRef?.click()">Load .env files</BaseButton>
    <BaseButton variant="tertiary" size="sm" @click="emit('loadSample')">Load sample trio</BaseButton>
  </div>

  <input
    ref="fileInputRef"
    type="file"
    accept=".env,.txt"
    multiple
    class="hidden"
    @change="onFileChange"
  />
</template>
```

**Step 2: Add clear-sets danger button to ProjectManagementCard**

In the ProjectManagementCard template, add the clear button and confirm dialog at the very bottom of Card 2, after the manual entry section. Also add the `confirmingClear` ref and import `ConfirmDialog`:

Add to the script:
```typescript
import ConfirmDialog from "../ui/ConfirmDialog.vue";
// ...
const confirmingClear = ref(false);
```

Add to the bottom of Card 2's template (after the manual entry div, before the closing `</GlassCard>`):

```html
    <!-- Danger zone -->
    <div v-if="sets.length > 0" class="mt-4 border-t border-border-subtle pt-3">
      <BaseButton variant="danger" size="sm" @click="confirmingClear = true">
        Clear all loaded sets
      </BaseButton>
    </div>

    <ConfirmDialog
      v-if="confirmingClear"
      title="Clear all loaded sets?"
      message="This will remove all env sets loaded for the active project in Drift. A backup will be created first. Your .env files are not affected."
      confirm-label="Clear sets"
      @confirm="confirmingClear = false; onClearSets()"
      @cancel="confirmingClear = false"
    />
```

Note: The clear button is only shown when there are sets loaded (`v-if="sets.length > 0"`).

Also update the FileUploadActions usage in the template to remove the `@clear-sets` listener:

```html
    <FileUploadActions
      @load-files="onLoadFiles"
      @load-sample="onLoadSample"
    />
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/project/FileUploadActions.vue src/components/project/ProjectManagementCard.vue
git commit -m "refactor: move clear-sets to bottom of env sets card"
```

---

### Task 8: Final build verification

**Files:** None (verification only)

**Step 1: Full build check**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Visual QA checklist**

Run: `npm run tauri dev` and verify:

- [ ] Project Settings card is collapsed by default showing cog icon + "Project Settings" + project name + chevron
- [ ] Clicking the settings header expands to show name/path inputs and action buttons
- [ ] Save, Scan, Browse, Create templates buttons work
- [ ] Remove project danger button shows confirmation dialog
- [ ] Clicking settings header again collapses the card
- [ ] Environment Sets card shows title + set count badge
- [ ] Load .env files button opens file picker
- [ ] Load sample trio button works
- [ ] Each env set item shows role badge with correct colour (local=blue, staging=amber, live=red)
- [ ] Each item shows source, key count, optional duplicates, optional file path
- [ ] Remove button on each item shows confirmation dialog
- [ ] "Paste .env content manually" link expands to show manual entry form
- [ ] Manual entry form works (name, role, content, submit)
- [ ] Clear all loaded sets button appears when sets exist
- [ ] Clear button shows confirmation dialog
- [ ] Empty state shows centred message when no sets loaded

**Step 3: Commit if any adjustments were made**

```bash
git add -A
git commit -m "feat: complete Projects page rework with two-card layout"
```
