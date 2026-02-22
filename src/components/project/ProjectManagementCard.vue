<script setup lang="ts">
import { ref } from "vue";
import type { EnvSet, EnvRole } from "../../types";
import { useProjects } from "../../composables/useProjects";
import { useEnvSets } from "../../composables/useEnvSets";
import { useSampleData } from "../../composables/useSampleData";
import { useStatus } from "../../composables/useStatus";
import { useActivityLog } from "../../composables/useActivityLog";
import { scanEnvFiles, writeProjectBackup } from "../../composables/useTauriCommands";
import GlassCard from "../ui/GlassCard.vue";
import BaseButton from "../ui/BaseButton.vue";
import ConfirmDialog from "../ui/ConfirmDialog.vue";
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
const { log } = useActivityLog();
const showManualForm = ref(false);
const scanning = ref(false);
const settingsExpanded = ref(false);
const confirmingClear = ref(false);

async function onSaveProject(name: string, rootPath: string) {
  if (!name || !rootPath) {
    setStatus("Project name and root path are required.");
    return;
  }
  const msg = saveProject(name, rootPath);
  if (msg) setStatus(msg);
  log("success", `Project saved: ${name}`, undefined, activeProject.value?.id);

  // Auto-scan if the project has a valid root path and no sets loaded yet
  const project = activeProject.value;
  if (project && project.rootPath.trim() && props.sets.length === 0) {
    await onScan();
  }
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
  log("destructive", `Removed project: ${removedName}`, `Backup: ${backupPath}`);
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
    log("info", `Scanned ${project.name}: found ${scanned.length} .env files`, undefined, project.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Scan failed: ${message}`);
    log("error", `Scan failed: ${message}`, undefined, project.id);
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
  log("info", `Loaded ${files.length} file${files.length > 1 ? "s" : ""} into ${project.name}`, undefined, project.id);
}

function onLoadSample() {
  const project = activeProject.value;
  if (!project) {
    setStatus("No active project selected.");
    return;
  }
  loadSampleData(project.id);
  setStatus(`Loaded sample local/staging/live sets into ${project.name}.`);
  log("info", `Loaded sample data into ${project.name}`, undefined, project.id);
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
  setStatus(`Cleared loaded .env files for ${project.name} in Drift. Backup: ${backupPath}`);
  log("destructive", `Cleared .env files for ${project.name}`, `Backup: ${backupPath}`, project.id);
}

async function onRemoveSet(setId: string) {
  const backupPath = await createProjectBackup("before-remove-set");
  if (!backupPath) return;

  const set = props.sets.find((s) => s.id === setId);
  removeSet(setId);
  if (set) {
    setStatus(`Removed ${set.name} from Drift. Backup: ${backupPath}`);
    log("destructive", `Removed ${set.name} from ${activeProject.value?.name}`, `Backup: ${backupPath}`, activeProject.value?.id);
  }
}

function triggerFileInput() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".env,.txt";
  input.multiple = true;
  input.addEventListener("change", () => {
    const files = Array.from(input.files ?? []);
    if (files.length > 0) {
      onLoadFiles(files);
    }
  });
  input.click();
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
      :aria-expanded="settingsExpanded"
      aria-controls="project-settings-panel"
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

    <div v-if="settingsExpanded" id="project-settings-panel" class="px-5 pb-5">
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

    <!-- Loading actions -->
    <div class="mb-4">
      <FileUploadActions
        @load-files="onLoadFiles"
        @load-sample="onLoadSample"
      />
    </div>

    <!-- Set list -->
    <EnvSetList :sets="sets" @remove="onRemoveSet" @scan="onScan" @load-files="triggerFileInput" />

    <!-- Manual entry (collapsible) -->
    <div v-if="sets.length > 0" class="mt-4 border-t border-border-subtle pt-3">
      <button
        class="focus-ring flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors rounded"
        :aria-expanded="showManualForm"
        aria-controls="manual-entry-panel"
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
        Paste .env content
      </button>
      <div v-if="showManualForm" id="manual-entry-panel">
        <ManualSetForm @add-manual="onAddManual" />
      </div>
    </div>

    <!-- Danger zone -->
    <div v-if="sets.length > 0" class="mt-4 border-t border-border-subtle pt-3">
      <BaseButton variant="danger" size="sm" @click="confirmingClear = true">
        Remove all .env files from Drift
      </BaseButton>
    </div>

    <ConfirmDialog
      v-if="confirmingClear"
      title="Remove all .env files from Drift?"
      message="This will remove all .env files loaded for the active project in Drift. A backup will be created first. Your actual .env files are not affected."
      confirm-label="Remove files"
      @confirm="confirmingClear = false; onClearSets()"
      @cancel="confirmingClear = false"
    />
  </GlassCard>
</template>
