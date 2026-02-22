<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import type { EnvSet, KeyAnalysisRow } from "../../types";
import { useEnvSets } from "../../composables/useEnvSets";
import { useProjects } from "../../composables/useProjects";
import { useStatus } from "../../composables/useStatus";
import { upsertEnvKeyInRaw } from "../../composables/useEnvMutations";
import { buildMissingTemplate, buildMergedTemplate, getMissingEntries } from "../../composables/useTemplates";
import { appendMissingEnvKeys, upsertEnvKey } from "../../composables/useTauriCommands";
import { asFilter } from "../../composables/useRoles";
import ConfirmDialog from "../ui/ConfirmDialog.vue";
import GlassCard from "../ui/GlassCard.vue";
import BaseButton from "../ui/BaseButton.vue";
import FilterRow from "./FilterRow.vue";
import TargetRow from "./TargetRow.vue";
import InlineDriftEditor from "./InlineDriftEditor.vue";
import ComparisonTable from "./ComparisonTable.vue";
import WarningsList from "./WarningsList.vue";
import StatusMessage from "./StatusMessage.vue";

const props = defineProps<{
  sets: EnvSet[];
  analysis: KeyAnalysisRow[];
  filteredRows: KeyAnalysisRow[];
}>();

const { applyRawToSet } = useEnvSets();
const { statusMessage, setStatus } = useStatus();

const filter = ref("all");
const search = ref("");
const referenceSetId = ref("");
const targetSetId = ref("");
const editorRef = ref<InstanceType<typeof InlineDriftEditor> | null>(null);
const showEditor = ref(false);
const showWarnings = ref(true);
const confirmingPatch = ref(false);

const { activeProjectId } = useProjects();

// Reset filter state when project changes
watch(activeProjectId, () => {
  filter.value = "all";
  search.value = "";
  referenceSetId.value = "";
  targetSetId.value = "";
});

// Sync default reference/target when sets change
watch(
  () => props.sets,
  (sets) => {
    if (sets.length > 0) {
      if (!sets.some((s) => s.id === referenceSetId.value)) {
        referenceSetId.value = sets[0].id;
      }
      if (!sets.some((s) => s.id === targetSetId.value)) {
        targetSetId.value = sets.length > 1 ? sets[1].id : sets[0].id;
      }
      // Ensure reference and target differ
      if (referenceSetId.value === targetSetId.value && sets.length > 1) {
        const fallback = sets.find((s) => s.id !== referenceSetId.value);
        if (fallback) targetSetId.value = fallback.id;
      }
    }
  },
  { immediate: true },
);

const referenceSet = computed(() => props.sets.find((s) => s.id === referenceSetId.value));
const targetSet = computed(() => props.sets.find((s) => s.id === targetSetId.value));

const targetFileName = computed(() => {
  const target = targetSet.value;
  if (!target) return "";
  return target.filePath ? target.name : "";
});

const missingKeyCount = computed(() => {
  if (!referenceSet.value || !targetSet.value) return 0;
  return getMissingEntries(referenceSet.value, targetSet.value).length;
});

// Apply filters locally (the parent passes full analysis, we filter here)
const displayRows = computed(() => {
  const query = search.value.trim().toLowerCase();
  const f = asFilter(filter.value);

  return props.analysis.filter((row) => {
    if (query && !row.key.toLowerCase().includes(query)) return false;
    if (f === "all") return true;
    if (f === "missing") return row.missingCount > 0;
    if (f === "drift") return row.drift;
    if (f === "unsafe") return row.unsafe;
    return row.primaryStatus === "aligned";
  });
});

async function onCopyMissing() {
  if (!referenceSet.value || !targetSet.value) {
    setStatus("Choose a valid compare-from and compare-to file.");
    return;
  }
  const template = buildMissingTemplate(referenceSet.value, targetSet.value);
  await navigator.clipboard.writeText(template);
  setStatus(`Missing keys copied (${referenceSet.value.name} → ${targetSet.value.name}).`);
}

async function onCopyMerged() {
  if (props.sets.length === 0) {
    setStatus("Load at least one set first.");
    return;
  }
  const merged = buildMergedTemplate(props.sets);
  await navigator.clipboard.writeText(merged);
  setStatus("Combined .env copied to clipboard.");
}

function requestPatch() {
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

function onApplyMemory(targetId: string, key: string, value: string) {
  const target = props.sets.find((s) => s.id === targetId);
  if (!target || !key) {
    setStatus("Select a key and file to update.");
    return;
  }
  const result = upsertEnvKeyInRaw(target.rawText, key, value);
  applyRawToSet(target, result.updatedContent);

  if (result.appended) {
    setStatus(`Added ${key} to ${target.name} (in Drift).`);
  } else {
    setStatus(`Updated ${key} in ${target.name} (in Drift, matched ${result.matchedCount}).`);
  }
}

async function onApplyFile(targetId: string, key: string, value: string) {
  const target = props.sets.find((s) => s.id === targetId);
  if (!target || !key) {
    setStatus("Select a key and file to update.");
    return;
  }
  if (!target.filePath) {
    setStatus("This file has no filesystem path. Use folder scan for direct file updates.");
    return;
  }

  try {
    const result = await upsertEnvKey(target.filePath, key, value, true);
    applyRawToSet(target, result.updatedContent);
    const updateMode = result.appended ? "added" : "updated";
    const backupInfo = result.backupPath ? ` backup: ${result.backupPath}` : "";
    setStatus(`File ${updateMode} ${key} in ${target.name}.${backupInfo}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Inline file update failed: ${message}`);
  }
}

async function onSelectKey(key: string) {
  if (!showEditor.value) {
    showEditor.value = true;
    await nextTick();
  }
  editorRef.value?.selectKey(key);
  setStatus(`Loaded ${key} into inline editor.`);
}
</script>

<template>
  <GlassCard>
    <h2 class="text-[17px] font-semibold text-text-primary mb-4">Compare .env files</h2>

    <FilterRow
      v-model:filter="filter"
      v-model:search="search"
      v-model:reference-set-id="referenceSetId"
      :sets="sets"
    />

    <div class="mt-3">
      <TargetRow
        v-model="targetSetId"
        :sets="sets"
        :missing-count="missingKeyCount"
        :target-file-name="targetFileName"
        @copy-missing="onCopyMissing"
        @copy-merged="onCopyMerged"
        @patch-target="requestPatch"
      />
    </div>

    <StatusMessage :message="statusMessage" />

    <ComparisonTable
      :rows="displayRows"
      :sets="sets"
      @select-key="onSelectKey"
    />

    <div class="mt-5 rounded-[var(--radius-md)] border border-border-subtle bg-surface-1/45 p-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-secondary">Warnings and coverage</h3>
        <BaseButton variant="ghost" size="sm" @click="showWarnings = !showWarnings">
          {{ showWarnings ? "Hide" : "Show" }}
        </BaseButton>
      </div>
      <WarningsList v-if="showWarnings" :sets="sets" />
    </div>

    <div class="mt-3 rounded-[var(--radius-md)] border border-border-subtle bg-surface-1/45 p-3">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold text-text-secondary">Edit a key</h3>
          <p class="text-xs text-text-muted mt-0.5">Click any table row to load that key into the editor.</p>
        </div>
        <BaseButton variant="ghost" size="sm" @click="showEditor = !showEditor">
          {{ showEditor ? "Hide" : "Show" }}
        </BaseButton>
      </div>

      <InlineDriftEditor
        v-if="showEditor"
        ref="editorRef"
        :sets="sets"
        :analysis="analysis"
        @apply-memory="onApplyMemory"
        @apply-file="onApplyFile"
      />
    </div>
    <ConfirmDialog
      v-if="confirmingPatch"
      title="Add missing keys to file?"
      :message="`This will append missing keys to ${targetSet?.filePath ?? 'the file'}. A timestamped backup will be created first.`"
      confirm-label="Add keys"
      @confirm="executePatch"
      @cancel="confirmingPatch = false"
    />
  </GlassCard>
</template>
