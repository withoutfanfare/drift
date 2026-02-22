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
  <GlassCard>
    <h2 class="text-[17px] font-semibold text-text-primary mb-4">Project + Env Set Management</h2>
    <p class="text-sm text-text-secondary mb-4">
      Keep project records, starter templates, and loaded env sets organised in one place.
    </p>

    <div>
      <p class="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Project setup</p>
      <ProjectForm
        :active-project="activeProject"
        :scanning="scanning"
        @save="onSaveProject"
        @delete="onDeleteProject"
        @scan="onScan"
        @baseline="onBaseline"
      />
    </div>

    <div class="mt-4">
      <p class="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Set loading</p>
      <FileUploadActions
        @load-files="onLoadFiles"
        @load-sample="onLoadSample"
        @clear-sets="onClearSets"
      />
    </div>

    <div class="mt-4 rounded-[var(--radius-md)] border border-border-subtle bg-surface-1/45 p-3">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold text-text-secondary">Manual set entry</h3>
          <p class="text-xs text-text-muted mt-0.5">Use this when scan/import is not available.</p>
        </div>
        <BaseButton variant="ghost" size="sm" @click="showManualForm = !showManualForm">
          {{ showManualForm ? "Hide" : "Show" }}
        </BaseButton>
      </div>
      <ManualSetForm v-if="showManualForm" @add-manual="onAddManual" />
    </div>

    <EnvSetList :sets="sets" @remove="onRemoveSet" />
  </GlassCard>
</template>
