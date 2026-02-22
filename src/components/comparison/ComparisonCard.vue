<script setup lang="ts">
import { ref, computed, watch, shallowRef } from "vue";
import type { EnvSet, KeyAnalysisRow } from "../../types";
import { useEnvSets } from "../../composables/useEnvSets";
import { useProjects } from "../../composables/useProjects";
import { useStatus } from "../../composables/useStatus";
import { useActivityLog } from "../../composables/useActivityLog";
import { upsertEnvKeyInRaw } from "../../composables/useEnvMutations";
import { buildMissingTemplate, buildMergedTemplate, getMissingEntries } from "../../composables/useTemplates";
import { appendMissingEnvKeys, upsertEnvKey, writeEnvFile } from "../../composables/useTauriCommands";
import { asFilter } from "../../composables/useRoles";
import DiffPreview from "./DiffPreview.vue";
import GlassCard from "../ui/GlassCard.vue";
import BaseButton from "../ui/BaseButton.vue";
import BaseSelect from "../ui/BaseSelect.vue";
import BaseInput from "../ui/BaseInput.vue";
import ComparisonTable from "./ComparisonTable.vue";
import WarningsList from "./WarningsList.vue";
import StatusMessage from "./StatusMessage.vue";

const props = defineProps<{
  sets: EnvSet[];
  analysis: KeyAnalysisRow[];
}>();

const { applyRawToSet } = useEnvSets();
const { statusMessage, setStatus } = useStatus();
const { log } = useActivityLog();

const filter = ref("all");
const search = ref("");
const referenceSetId = ref("");
const targetSetId = ref("");
const showWarnings = ref(true);
const showPatchPreview = ref(false);
const patchPreviewOriginal = ref("");
const patchPreviewUpdated = ref("");
const pendingPatchEntries = ref<{ key: string; value: string }[]>([]);
const savingSetId = ref<string | null>(null);

const { activeProjectId } = useProjects();

// Session edit tracking: key = "envKey::setId", value = original value before first edit (undefined = was missing)
const sessionEdits = shallowRef(new Map<string, string | undefined>());

function recordOriginalValue(setId: string, key: string) {
  const mapKey = `${key}::${setId}`;
  if (sessionEdits.value.has(mapKey)) return;
  const set = props.sets.find((s) => s.id === setId);
  const next = new Map(sessionEdits.value);
  next.set(mapKey, set?.values[key]);
  sessionEdits.value = next;
}

// Compute sets with unsaved in-memory edits that have file paths, with edit counts
const unsavedSets = computed(() => {
  const editCounts = new Map<string, number>();
  for (const mapKey of sessionEdits.value.keys()) {
    const setId = mapKey.split("::")[1];
    editCounts.set(setId, (editCounts.get(setId) ?? 0) + 1);
  }
  return props.sets
    .filter((s) => s.filePath && editCounts.has(s.id))
    .map((s) => ({ ...s, editCount: editCounts.get(s.id)! }));
});

// Reset filter state and edit tracking when project changes
watch(activeProjectId, () => {
  filter.value = "all";
  search.value = "";
  referenceSetId.value = "";
  targetSetId.value = "";
  sessionEdits.value = new Map();
});

// Smart defaults: compare-from = most keys, compare-to = local env
watch(
  () => props.sets,
  (sets) => {
    if (sets.length === 0) return;

    // Smart default for compare-from: set with the most keys
    if (!sets.some((s) => s.id === referenceSetId.value)) {
      const sorted = [...sets].sort(
        (a, b) => Object.keys(b.values).length - Object.keys(a.values).length,
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
  try {
    await navigator.clipboard.writeText(template);
    setStatus(`Missing keys copied (${referenceSet.value.name} → ${targetSet.value.name}).`);
    log("info", `Copied missing keys (${referenceSet.value.name} → ${targetSet.value.name})`);
  } catch {
    setStatus("Clipboard access denied — copy failed.");
  }
}

async function onCopyMerged() {
  if (props.sets.length === 0) {
    setStatus("Load at least one set first.");
    return;
  }
  const merged = buildMergedTemplate(props.sets);
  try {
    await navigator.clipboard.writeText(merged);
    setStatus("Combined .env copied to clipboard.");
    log("info", "Copied combined .env to clipboard");
  } catch {
    setStatus("Clipboard access denied — copy failed.");
  }
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
  pendingPatchEntries.value = entries;

  // Build preview of what will be appended
  patchPreviewOriginal.value = targetSet.value.rawText;
  let preview = targetSet.value.rawText;
  if (!preview.endsWith("\n")) preview += "\n";
  preview += "\n# Added by Drift\n";
  for (const entry of entries) {
    preview += `${entry.key}=${entry.value}\n`;
  }
  patchPreviewUpdated.value = preview;
  showPatchPreview.value = true;
}

async function executePatch() {
  showPatchPreview.value = false;
  if (!referenceSet.value || !targetSet.value?.filePath) return;

  const entries = pendingPatchEntries.value;
  pendingPatchEntries.value = [];
  if (entries.length === 0) return;

  try {
    for (const entry of entries) {
      recordOriginalValue(targetSet.value.id, entry.key);
    }
    const result = await appendMissingEnvKeys(targetSet.value.filePath, entries, true);
    applyRawToSet(targetSet.value, result.updatedContent);
    const backupInfo = result.backupPath ? ` backup: ${result.backupPath}` : "";
    setStatus(`Patched ${targetSet.value.name}: appended ${result.appendedCount}, skipped ${result.skippedExisting}.${backupInfo}`);
    log("write", `Added ${result.appendedCount} keys to ${targetSet.value.name}`, result.backupPath ? `Backup: ${result.backupPath}` : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Patch failed: ${message}`);
    log("error", `Patch failed: ${message}`);
  }
}

function onApplyMemory(targetId: string, key: string, value: string) {
  const target = props.sets.find((s) => s.id === targetId);
  if (!target || !key) {
    setStatus("Select a key and file to update.");
    return;
  }
  recordOriginalValue(targetId, key);
  const result = upsertEnvKeyInRaw(target.rawText, key, value);
  applyRawToSet(target, result.updatedContent);

  if (result.appended) {
    setStatus(`Added ${key} to ${target.name} (in Drift).`);
  } else {
    setStatus(`Updated ${key} in ${target.name} (in Drift, matched ${result.matchedCount}).`);
  }
  log("info", `${result.appended ? "Added" : "Updated"} ${key} in ${target.name} (in Drift)`);
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

  recordOriginalValue(targetId, key);
  try {
    const result = await upsertEnvKey(target.filePath, key, value, true);
    applyRawToSet(target, result.updatedContent);
    const updateMode = result.appended ? "added" : "updated";
    const backupInfo = result.backupPath ? ` backup: ${result.backupPath}` : "";
    setStatus(`File ${updateMode} ${key} in ${target.name}.${backupInfo}`);
    log("write", `Wrote ${key} to ${target.name}`, result.backupPath ? `Backup: ${result.backupPath}` : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Inline file update failed: ${message}`);
    log("error", `File write failed: ${message}`);
  }
}

function onRevertMemory(targetId: string, key: string) {
  const mapKey = `${key}::${targetId}`;
  const original = sessionEdits.value.get(mapKey);

  const target = props.sets.find((s) => s.id === targetId);
  if (!target) return;

  if (original === undefined) {
    // Key was added — remove it from rawText
    const lines = target.rawText.split("\n");
    const filtered = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) return true;
      const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
      const eqIdx = withoutExport.indexOf("=");
      if (eqIdx <= 0) return true;
      return withoutExport.slice(0, eqIdx).trim() !== key;
    });
    applyRawToSet(target, filtered.join("\n"));

    const next = new Map(sessionEdits.value);
    next.delete(mapKey);
    sessionEdits.value = next;

    setStatus(`Removed ${key} from ${target.name}.`);
    log("info", `Removed added key ${key} from ${target.name}`);
    return;
  }

  // Existing revert logic for changed values
  const result = upsertEnvKeyInRaw(target.rawText, key, original);
  applyRawToSet(target, result.updatedContent);

  const next = new Map(sessionEdits.value);
  next.delete(mapKey);
  sessionEdits.value = next;

  setStatus(`Reverted ${key} in ${target.name}.`);
  log("info", `Reverted ${key} in ${target.name}`);
}

async function onSaveFile(setId: string) {
  const set = props.sets.find((s) => s.id === setId);
  if (!set?.filePath || savingSetId.value) return;

  savingSetId.value = setId;
  try {
    const result = await writeEnvFile(set.filePath, set.rawText, true);
    const backupInfo = result.backupPath ? ` (backup created)` : "";

    // Remove all session edit entries for this set
    const next = new Map(sessionEdits.value);
    for (const mapKey of next.keys()) {
      if (mapKey.endsWith(`::${setId}`)) next.delete(mapKey);
    }
    sessionEdits.value = next;

    setStatus(`Saved ${set.name}${backupInfo}.`);
    log("write", `Saved ${set.name} to disk`, result.backupPath ? `Backup: ${result.backupPath}` : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Save failed: ${message}`);
    log("error", `Save ${set.name} failed: ${message}`);
  } finally {
    savingSetId.value = null;
  }
}

</script>

<template>
  <GlassCard padding="p-4">
    <!-- Compact toolbar: selects + actions -->
    <div class="flex flex-wrap items-end gap-2 mb-3">
      <div class="w-[120px] max-[900px]:w-full max-[900px]:flex-1">
        <BaseSelect v-model="filter" aria-label="Filter rows">
          <option value="all">All</option>
          <option value="missing">Missing</option>
          <option value="drift">Drift</option>
          <option value="unsafe">Unsafe</option>
          <option value="aligned">Aligned</option>
        </BaseSelect>
      </div>
      <div class="w-[140px] max-[900px]:w-full max-[900px]:flex-1">
        <BaseInput v-model="search" aria-label="Search keys" placeholder="Search keys..." />
      </div>
      <div class="flex-1 min-w-[140px]">
        <BaseSelect v-model="referenceSetId" aria-label="Compare from">
          <option v-for="s in sets" :key="s.id" :value="s.id">From: {{ s.name }} ({{ s.role }})</option>
        </BaseSelect>
      </div>
      <div class="flex-1 min-w-[140px]">
        <BaseSelect v-model="targetSetId" aria-label="Compare to">
          <option v-for="s in sets" :key="s.id" :value="s.id">To: {{ s.name }} ({{ s.role }})</option>
        </BaseSelect>
      </div>
      <div class="flex gap-1.5 max-[900px]:w-full max-[900px]:mt-1">
        <BaseButton variant="primary" size="sm" @click="onCopyMissing">Copy missing</BaseButton>
        <BaseButton variant="tertiary" size="sm" @click="onCopyMerged">Export .env</BaseButton>
        <BaseButton v-if="targetSet?.filePath" variant="danger" size="sm" @click="requestPatch">
          {{ missingKeyCount ? `Patch ${missingKeyCount} keys` : 'Patch file' }}
        </BaseButton>
      </div>
    </div>

    <StatusMessage :message="statusMessage" />

    <ComparisonTable
      :rows="displayRows"
      :sets="sets"
      :reference-set-id="referenceSetId"
      :session-edits="sessionEdits"
      @apply-memory="onApplyMemory"
      @apply-file="onApplyFile"
      @revert-memory="onRevertMemory"
    />

    <!-- Per-file save bar -->
    <div
      v-if="unsavedSets.length > 0"
      class="mt-2 rounded-[var(--radius-md)] border border-accent/20 bg-accent/5 px-3 py-2"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-text-muted">Session changes — not yet written to disk:</span>
        <BaseButton
          v-for="s in unsavedSets"
          :key="s.id"
          variant="primary"
          size="sm"
          :disabled="savingSetId !== null"
          @click="onSaveFile(s.id)"
        >{{ savingSetId === s.id ? 'Saving...' : `Save ${s.name} (${s.editCount} ${s.editCount === 1 ? 'edit' : 'edits'})` }}</BaseButton>
      </div>
      <p class="text-[11px] text-text-muted mt-1">A backup is created automatically before each save.</p>
    </div>

    <div class="mt-3 rounded-[var(--radius-md)] border border-border-subtle bg-surface-1/45 p-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-secondary">Warnings and coverage</h3>
        <BaseButton variant="ghost" size="sm" @click="showWarnings = !showWarnings">
          {{ showWarnings ? "Hide" : "Show" }}
        </BaseButton>
      </div>
      <WarningsList v-if="showWarnings" :sets="sets" :analysis="analysis" />
    </div>
    <DiffPreview
      v-if="showPatchPreview"
      :title="`Add missing keys to ${targetSet?.name}`"
      :file-path="targetSet?.filePath ?? ''"
      :original="patchPreviewOriginal"
      :updated="patchPreviewUpdated"
      :summary="`Will append ${missingKeyCount} missing keys. A backup will be created first.`"
      confirm-label="Apply changes"
      @confirm="executePatch"
      @cancel="showPatchPreview = false"
    />
  </GlassCard>
</template>
