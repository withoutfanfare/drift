<script setup lang="ts">
import { ref, watch } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { useStatus } from "../../composables/useStatus";
import { inferProjectName } from "../../composables/useTauriCommands";
import type { ProjectProfile } from "../../types";
import { SFormField, SInput, SButton, SConfirmDialog } from "@stuntrocket/ui";

const props = defineProps<{
  activeProject: ProjectProfile | undefined;
  scanning?: boolean;
  creating?: boolean;
}>();

const emit = defineEmits<{
  save: [name: string, rootPath: string];
  delete: [];
  scan: [];
  baseline: [];
}>();

const projectName = ref(props.activeProject?.name ?? "");
const projectPath = ref(props.activeProject?.rootPath ?? "");
const lastSuggestedName = ref(projectName.value);
const selectingFolder = ref(false);
const { setStatus } = useStatus();
const confirmingDelete = ref(false);

watch(
  () => props.activeProject,
  (p) => {
    if (!props.creating) {
      projectName.value = p?.name ?? "";
      projectPath.value = p?.rootPath ?? "";
      lastSuggestedName.value = p?.name ?? "";
    }
  },
);

watch(
  () => props.creating,
  (val) => {
    if (val) {
      projectName.value = "";
      projectPath.value = "";
      lastSuggestedName.value = "";
    }
  },
);

function shouldReplaceProjectNameWithSuggestion(suggestedName: string): boolean {
  const currentName = projectName.value.trim();
  const activeName = props.activeProject?.name?.trim() ?? "";
  if (!currentName) return true;
  if (currentName === suggestedName) return false;

  return currentName === lastSuggestedName.value || currentName === activeName;
}

async function suggestProjectNameFromPath(selectedPath: string) {
  try {
    const suggestedName = (await inferProjectName(selectedPath)).trim();
    if (!suggestedName) return;

    if (shouldReplaceProjectNameWithSuggestion(suggestedName)) {
      projectName.value = suggestedName;
      lastSuggestedName.value = suggestedName;
      return;
    }

    setStatus(`Folder selected. Suggested project name: ${suggestedName}. Kept your custom name.`);
  } catch {
    // Ignore inference failures and allow manual naming fallback.
  }
}

async function browseForProjectPath() {
  selectingFolder.value = true;
  try {
    const selected = await open({
      title: "Select Project Root Folder",
      directory: true,
      multiple: false,
    });

    if (typeof selected === "string" && selected.trim().length > 0) {
      projectPath.value = selected;
      await suggestProjectNameFromPath(selected);
    }
  } catch {
    setStatus("Folder picker failed. Restart the app to apply dialog permissions, or paste the path manually.");
  } finally {
    selectingFolder.value = false;
  }
}
</script>

<template>
  <div class="space-y-3">
    <SFormField label="Project name">
      <SInput v-model="projectName" placeholder="Client Platform" />
    </SFormField>
    <SFormField label="Project root path">
      <SInput v-model="projectPath" placeholder="/Users/you/Code/client-platform" />
    </SFormField>
    <div class="flex flex-wrap gap-2">
      <SButton
        variant="secondary"
        size="sm"
        :loading="selectingFolder"
        @click="browseForProjectPath"
      >
        Browse for folder
      </SButton>
      <SButton variant="primary" size="sm" @click="emit('save', projectName.trim(), projectPath.trim())">
        {{ creating ? 'Add project' : 'Save project' }}
      </SButton>
      <template v-if="!creating">
        <SButton variant="secondary" size="sm" :loading="scanning" @click="emit('scan')">
          Scan .env files
        </SButton>
        <SButton variant="secondary" size="sm" @click="emit('baseline')">
          Create starter templates
        </SButton>
      </template>
    </div>

    <div v-if="!creating" class="border-t border-border-subtle pt-3">
      <SButton variant="danger" size="sm" @click="confirmingDelete = true">
        Remove project from Drift
      </SButton>
    </div>

    <SConfirmDialog
      v-if="confirmingDelete"
      :open="true"
      title="Remove project?"
      :message="`This will remove ${activeProject?.name ?? 'this project'} and all its linked env sets from Drift. A backup will be created first. Your project files are not affected.`"
      confirm-label="Remove project"
      danger
      @confirm="confirmingDelete = false; emit('delete')"
      @cancel="confirmingDelete = false"
      @close="confirmingDelete = false"
    />
  </div>
</template>
