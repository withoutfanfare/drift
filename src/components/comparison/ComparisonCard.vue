<script setup lang="ts">
import { ref, computed, watch, shallowRef } from "vue";
import type { EnvSet, KeyAnalysisRow, DriftWarning } from "../../types";
import { useEnvSets } from "../../composables/useEnvSets";
import { useProjects } from "../../composables/useProjects";
import { useStatus } from "../../composables/useStatus";
import { useActivityLog } from "../../composables/useActivityLog";
import { useChangeHistory } from "../../composables/useChangeHistory";
import { useGrouping } from "../../composables/useGrouping";
import { useDriftAnalysis } from "../../composables/useDriftAnalysis";
import { useEnvExample } from "../../composables/useEnvExample";
import { useKeyboardShortcuts } from "../../composables/useKeyboardShortcuts";
import { useDebouncedComputed } from "../../composables/useDebounce";
import { upsertEnvKeyInRaw } from "../../composables/useEnvMutations";
import { buildMissingTemplate, buildMergedTemplate, getMissingEntries } from "../../composables/useTemplates";
import { appendMissingEnvKeys, upsertEnvKey, writeEnvFile, writeEnvExample, rotateBackups } from "../../composables/useTauriCommands";
import { asFilter } from "../../composables/useRoles";
import { SCard, SButton, SSelect, SInput } from "@stuntrocket/ui";
import DiffPreview from "./DiffPreview.vue";
import ComparisonTable from "./ComparisonTable.vue";
import WarningsList from "./WarningsList.vue";
import StatusMessage from "./StatusMessage.vue";
import KeyboardShortcutsOverlay from "./KeyboardShortcutsOverlay.vue";
import ValidationPanel from "./ValidationPanel.vue";
import DriftWarningsPanel from "./DriftWarningsPanel.vue";

const props = defineProps<{
  sets: EnvSet[];
  analysis: KeyAnalysisRow[];
}>();

const { applyRawToSet } = useEnvSets();
const { statusMessage, setStatus } = useStatus();
const { log } = useActivityLog();
const { recordChange } = useChangeHistory();
const { groupingEnabled, toggleGrouping, groupRows } = useGrouping();
const { analyseValueDrift } = useDriftAnalysis();
const { generateEnvExample } = useEnvExample();

const { activeProject, activeProjectId } = useProjects();

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
const showValidation = ref(false);
const showDriftWarnings = ref(false);
const focusedRowIndex = ref(-1);

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
  focusedRowIndex.value = -1;
});

// Smart defaults: compare-from = most keys, compare-to = local env
watch(
  () => props.sets,
  (sets) => {
    if (sets.length === 0) return;

    if (!sets.some((s) => s.id === referenceSetId.value)) {
      const sorted = [...sets].sort(
        (a, b) => Object.keys(b.values).length - Object.keys(a.values).length,
      );
      referenceSetId.value = sorted[0].id;
    }

    if (!sets.some((s) => s.id === targetSetId.value)) {
      const local = sets.find((s) => s.role === "local");
      const fallback = sets.find((s) => s.id !== referenceSetId.value);
      targetSetId.value = local?.id ?? fallback?.id ?? sets[0].id;
    }

    if (referenceSetId.value === targetSetId.value && sets.length > 1) {
      const fallback = sets.find((s) => s.id !== referenceSetId.value);
      if (fallback) targetSetId.value = fallback.id;
    }
  },
  { immediate: true },
);

const referenceSet = computed(() => props.sets.find((s) => s.id === referenceSetId.value));
const targetSet = computed(() => props.sets.find((s) => s.id === targetSetId.value));

const missingKeyCount = computed(() => {
  if (!referenceSet.value || !targetSet.value) return 0;
  return getMissingEntries(referenceSet.value, targetSet.value).length;
});

// Debounced display rows — batches filter, search, and mutation triggers
const displayRows = useDebouncedComputed(
  () => [props.analysis, filter.value, search.value],
  () => {
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
  },
  150,
);

// Cross-environment value drift warnings
const driftWarnings = computed<DriftWarning[]>(() => analyseValueDrift(props.sets));

// Validation warnings count across all sets
const totalValidationWarnings = computed(() =>
  props.sets.reduce((sum, s) => sum + s.validationWarnings.length, 0),
);

// Variable groups for the grouping feature
const groups = computed(() => groupRows(displayRows.value));

// Keyboard shortcuts
const { helpVisible, SHORTCUT_HELP } = useKeyboardShortcuts({
  onSearch() {
    const input = document.querySelector<HTMLInputElement>('[data-search-input]');
    input?.focus();
  },
  onSave() {
    const first = unsavedSets.value[0];
    if (first) onSaveFile(first.id);
  },
  onNavigateUp() {
    if (focusedRowIndex.value > 0) {
      focusedRowIndex.value -= 1;
    }
  },
  onNavigateDown() {
    if (focusedRowIndex.value < displayRows.value.length - 1) {
      focusedRowIndex.value += 1;
    }
  },
  onEnter() {
    // Enter is handled by ComparisonTable via focusedRowIndex
  },
  onEscape() {
    focusedRowIndex.value = -1;
  },
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

async function onGenerateEnvExample() {
  if (props.sets.length === 0) {
    setStatus("Load at least one set first.");
    return;
  }
  if (!activeProject.value) {
    setStatus("No active project selected.");
    return;
  }

  const content = generateEnvExample(props.sets);

  try {
    const writtenPath = await writeEnvExample(activeProject.value.rootPath, content);
    setStatus(`Generated .env.example at ${writtenPath}`);
    log("write", `Generated .env.example`, `Path: ${writtenPath}`, activeProject.value.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await navigator.clipboard.writeText(content);
      setStatus(`.env.example copied to clipboard (file write failed: ${message}).`);
    } catch {
      setStatus(`Failed to generate .env.example: ${message}`);
    }
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
    const result = await appendMissingEnvKeys(targetSet.value.filePath, activeProject.value!.rootPath, entries, true);
    applyRawToSet(targetSet.value, result.updatedContent);

    for (const entry of entries) {
      recordChange(entry.key, undefined, entry.value, targetSet.value.filePath!, targetSet.value.name);
    }

    if (result.backupPath && targetSet.value.filePath) {
      rotateBackups(targetSet.value.filePath, 5).catch(() => {});
    }

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
  const previousValue = target.values[key];
  const result = upsertEnvKeyInRaw(target.rawText, key, value);
  applyRawToSet(target, result.updatedContent);

  recordChange(key, previousValue, value, target.filePath ?? target.name, target.name);

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
  const previousValue = target.values[key];
  try {
    const result = await upsertEnvKey(target.filePath, activeProject.value!.rootPath, key, value, true);
    applyRawToSet(target, result.updatedContent);

    recordChange(key, previousValue, value, target.filePath!, target.name);

    if (result.backupPath) {
      rotateBackups(target.filePath!, 5).catch(() => {});
    }

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

  const result = upsertEnvKeyInRaw(target.rawText, key, original);
  applyRawToSet(target, result.updatedContent);

  recordChange(key, target.values[key], original, target.filePath ?? target.name, target.name);

  const next = new Map(sessionEdits.value);
  next.delete(mapKey);
  sessionEdits.value = next;

  setStatus(`Reverted ${key} in ${target.name}.`);
  log("info", `Reverted ${key} in ${target.name}`);
}

async function onCopyValueToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    setStatus("Value copied to clipboard.");
  } catch {
    setStatus("Clipboard access denied — copy failed.");
  }
}

function onCopyValueToEnv(targetId: string, key: string, value: string) {
  onApplyMemory(targetId, key, value);
}

async function onSaveFile(setId: string) {
  const set = props.sets.find((s) => s.id === setId);
  if (!set?.filePath || savingSetId.value) return;

  savingSetId.value = setId;
  try {
    const result = await writeEnvFile(set.filePath, activeProject.value!.rootPath, set.rawText, true);
    const backupInfo = result.backupPath ? ` (backup created)` : "";

    if (result.backupPath) {
      rotateBackups(set.filePath!, 5).catch(() => {});
    }

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
  <SCard variant="glass" class="p-4">
    <!-- Compact toolbar: selects + actions -->
    <div class="flex flex-wrap items-end gap-2 mb-3">
      <div class="w-[120px] max-[900px]:w-full max-[900px]:flex-1">
        <SSelect v-model="filter" aria-label="Filter rows">
          <option value="all">All</option>
          <option value="missing">Missing</option>
          <option value="drift">Drift</option>
          <option value="unsafe">Unsafe</option>
          <option value="aligned">Aligned</option>
        </SSelect>
      </div>
      <div class="w-[140px] max-[900px]:w-full max-[900px]:flex-1">
        <SInput v-model="search" data-search-input placeholder="Search keys..." />
      </div>
      <div class="flex-1 min-w-[140px]">
        <SSelect v-model="referenceSetId" aria-label="Compare from">
          <option v-for="s in sets" :key="s.id" :value="s.id">From: {{ s.name }} ({{ s.role }})</option>
        </SSelect>
      </div>
      <div class="flex-1 min-w-[140px]">
        <SSelect v-model="targetSetId" aria-label="Compare to">
          <option v-for="s in sets" :key="s.id" :value="s.id">To: {{ s.name }} ({{ s.role }})</option>
        </SSelect>
      </div>
      <div class="flex gap-1.5 max-[900px]:w-full max-[900px]:mt-1">
        <SButton variant="primary" size="sm" @click="onCopyMissing">Copy missing</SButton>
        <SButton variant="secondary" size="sm" @click="onCopyMerged">Export .env</SButton>
        <SButton variant="secondary" size="sm" @click="onGenerateEnvExample">.env.example</SButton>
        <SButton
          variant="secondary"
          size="sm"
          @click="toggleGrouping"
          :title="groupingEnabled ? 'Disable grouping' : 'Group by service prefix'"
        >
          <svg class="h-3.5 w-3.5" :class="groupingEnabled ? 'text-accent' : ''" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </SButton>
        <SButton v-if="targetSet?.filePath" variant="danger" size="sm" @click="requestPatch">
          {{ missingKeyCount ? `Patch ${missingKeyCount} keys` : 'Patch file' }}
        </SButton>
      </div>
    </div>

    <!-- Feature indicators -->
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <button
        v-if="totalValidationWarnings > 0"
        class="focus-ring inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-0.5 text-[11px] font-medium transition-colors"
        :class="showValidation ? 'bg-warning/15 text-warning' : 'bg-warning/5 text-warning/60 hover:text-warning'"
        @click="showValidation = !showValidation"
      >
        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 9v3m0 3h.01M10.29 3.86l-8.7 14.91A1.71 1.71 0 0 0 3.12 21h17.76a1.71 1.71 0 0 0 1.53-2.23l-8.7-14.91a1.71 1.71 0 0 0-3.02 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        {{ totalValidationWarnings }} syntax {{ totalValidationWarnings === 1 ? 'warning' : 'warnings' }}
      </button>

      <button
        v-if="driftWarnings.length > 0"
        class="focus-ring inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-0.5 text-[11px] font-medium transition-colors"
        :class="showDriftWarnings ? 'bg-accent/15 text-accent' : 'bg-accent/5 text-accent/60 hover:text-accent'"
        @click="showDriftWarnings = !showDriftWarnings"
      >
        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 8v4m0 4h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        {{ driftWarnings.length }} drift {{ driftWarnings.length === 1 ? 'suggestion' : 'suggestions' }}
      </button>
    </div>

    <!-- Validation warnings panel -->
    <ValidationPanel
      v-if="showValidation"
      :sets="sets"
      @dismiss="showValidation = false"
    />

    <!-- Cross-environment drift warnings panel -->
    <DriftWarningsPanel
      v-if="showDriftWarnings"
      :warnings="driftWarnings"
      @dismiss="showDriftWarnings = false"
    />

    <StatusMessage :message="statusMessage" />

    <ComparisonTable
      :rows="displayRows"
      :sets="sets"
      :reference-set-id="referenceSetId"
      :session-edits="sessionEdits"
      :grouping-enabled="groupingEnabled"
      :groups="groups"
      :drift-warnings="driftWarnings"
      :focused-row-index="focusedRowIndex"
      @apply-memory="onApplyMemory"
      @apply-file="onApplyFile"
      @revert-memory="onRevertMemory"
      @copy-value="onCopyValueToClipboard"
      @copy-to-env="onCopyValueToEnv"
      @update:focused-row-index="focusedRowIndex = $event"
    />

    <!-- Per-file save bar -->
    <div
      v-if="unsavedSets.length > 0"
      class="mt-2 rounded-[var(--radius-md)] border border-accent/20 bg-accent/5 px-3 py-2"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-text-muted">Session changes — not yet written to disk:</span>
        <SButton
          v-for="s in unsavedSets"
          :key="s.id"
          variant="primary"
          size="sm"
          :disabled="savingSetId !== null"
          @click="onSaveFile(s.id)"
        >{{ savingSetId === s.id ? 'Saving...' : `Save ${s.name} (${s.editCount} ${s.editCount === 1 ? 'edit' : 'edits'})` }}</SButton>
      </div>
      <p class="text-[11px] text-text-muted mt-1">A backup is created automatically before each save.</p>
    </div>

    <div class="mt-3 rounded-[var(--radius-md)] border border-border-subtle bg-surface-1/45 p-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-secondary">Warnings and coverage</h3>
        <SButton variant="ghost" size="sm" @click="showWarnings = !showWarnings">
          {{ showWarnings ? "Hide" : "Show" }}
        </SButton>
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

    <!-- Keyboard shortcuts overlay -->
    <KeyboardShortcutsOverlay
      v-if="helpVisible"
      :shortcuts="SHORTCUT_HELP"
      @close="helpVisible = false"
    />
  </SCard>
</template>
