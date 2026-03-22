<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { EnvSet, KeyAnalysisRow, DriftWarning } from "../../types";
import { useMasking } from "../../composables/useMasking";
import { useSecretDetection } from "../../composables/useSecretDetection";
import { useChangeHistory } from "../../composables/useChangeHistory";
import StatusBadge from "./StatusBadge.vue";
import { SButton as BaseButton } from "@stuntrocket/ui";

const props = defineProps<{
  row: KeyAnalysisRow;
  sets: EnvSet[];
  referenceSetId: string;
  expanded: boolean;
  sessionEdits: Map<string, string | undefined>;
  driftWarnings: DriftWarning[];
  focused: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  applyMemory: [args: [targetSetId: string, key: string, value: string]];
  applyFile: [args: [targetSetId: string, key: string, value: string]];
  revertMemory: [args: [targetSetId: string, key: string]];
  copyValue: [value: string];
  copyToEnv: [args: [targetSetId: string, key: string, value: string]];
}>();

const { maskValue, shouldMask, isSensitiveKey, MASK_PLACEHOLDER } = useMasking();
const { detectSecret } = useSecretDetection();
const { getKeyHistory, formatRelativeTime } = useChangeHistory();
const revealedCells = ref<Set<string>>(new Set());
const editValue = ref("");
const showHistory = ref(false);
const referenceSet = computed(() => props.sets.find(s => s.id === props.referenceSetId));

// Pre-fill editValue from reference set when expanded
watch(() => props.expanded, (isExpanded) => {
  if (isExpanded) {
    const refSet = props.sets.find(s => s.id === props.referenceSetId);
    editValue.value = refSet?.values[props.row.key] ?? "";
    showHistory.value = false;
  }
});

// Get comments for this key across all sets
const keyComments = computed(() => {
  const comments: Array<{ setName: string; above: string[]; inline: string | null }> = [];
  for (const set of props.sets) {
    const comment = set.comments[props.row.key];
    if (comment && (comment.above.length > 0 || comment.inline)) {
      comments.push({ setName: set.name, ...comment });
    }
  }
  return comments;
});

const hasComments = computed(() => keyComments.value.length > 0);

// Build tooltip text from comments
const commentTooltip = computed(() => {
  if (keyComments.value.length === 0) return "";
  if (keyComments.value.length === 1) {
    const c = keyComments.value[0];
    const parts: string[] = [];
    if (c.above.length > 0) parts.push(c.above.join("\n"));
    if (c.inline) parts.push(c.inline);
    return parts.join("\n");
  }
  return keyComments.value.map((c) => {
    const parts: string[] = [];
    if (c.above.length > 0) parts.push(c.above.join(" "));
    if (c.inline) parts.push(c.inline);
    return `[${c.setName}] ${parts.join(" — ")}`;
  }).join("\n");
});

// Secret detection for values in each set
function getSecretWarning(setId: string): string | null {
  const val = props.row.valuesBySet[setId];
  if (val === undefined) return null;
  return detectSecret(props.row.key, val);
}

// Change history for this key
const keyHistory = computed(() => getKeyHistory(props.row.key));

function toggleReveal(cellId: string) {
  const next = new Set(revealedCells.value);
  if (next.has(cellId)) {
    next.delete(cellId);
  } else {
    next.add(cellId);
  }
  revealedCells.value = next;
}

function isRevealed(cellId: string): boolean {
  return revealedCells.value.has(cellId);
}

function valueMatches(setId: string): boolean {
  return props.row.valuesBySet[setId] === editValue.value;
}

function isEdited(setId: string): boolean {
  return props.sessionEdits.has(`${props.row.key}::${setId}`);
}

function wasAdded(setId: string): boolean {
  return props.sessionEdits.get(`${props.row.key}::${setId}`) === undefined && isEdited(setId);
}

function canRevert(setId: string): boolean {
  return isEdited(setId) && !wasAdded(setId);
}

function originalValue(setId: string): string | undefined {
  return props.sessionEdits.get(`${props.row.key}::${setId}`);
}

function hasValueChange(setId: string): boolean {
  return isEdited(setId) && !wasAdded(setId) && props.row.valuesBySet[setId] !== originalValue(setId);
}

function cellIsMasked(setId: string): boolean {
  const val = props.row.valuesBySet[setId];
  return val !== undefined && shouldMask(props.row.key, val) && !isRevealed(`${props.row.key}-${setId}`);
}
</script>

<template>
  <!-- Summary row -->
  <tr
    class="cursor-pointer hover:bg-white/[0.03] transition-colors"
    :class="{
      'bg-white/[0.02]': expanded,
      'ring-1 ring-inset ring-accent/30': focused,
    }"
    @click="emit('toggle')"
  >
    <td class="px-3 py-2 text-sm font-mono text-text-primary">
      <span class="flex items-center gap-1.5">
        <svg
          class="h-3 w-3 shrink-0 text-text-muted transition-transform duration-150"
          :class="{ 'rotate-90': expanded }"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span :title="commentTooltip || undefined">{{ row.key }}</span>
        <!-- Comment indicator -->
        <svg
          v-if="hasComments"
          class="h-3 w-3 shrink-0 text-accent/40"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          :title="commentTooltip"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <!-- Sensitive key indicator -->
        <svg v-if="isSensitiveKey(row.key)" class="h-3 w-3 shrink-0 text-warning/60" viewBox="0 0 24 24" fill="none" aria-hidden="true" title="Sensitive key">
          <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </span>
    </td>
    <td class="px-3 py-2">
      <div class="flex gap-1.5 flex-wrap">
        <StatusBadge v-if="row.missingCount > 0" status="missing" :count="row.missingCount" />
        <StatusBadge v-if="row.drift" status="drift" />
        <StatusBadge
          v-if="row.unsafe"
          status="unsafe"
          :tooltip="row.unsafeReasons.join(' | ')"
        />
        <StatusBadge
          v-if="!row.missingCount && !row.drift && !row.unsafe"
          status="aligned"
        />
      </div>
    </td>
    <td
      v-for="set in sets"
      :key="set.id"
      class="px-3 py-2 text-sm transition-colors group/cell relative"
      :class="isEdited(set.id) ? 'bg-accent/5' : ''"
    >
      <!-- Copy button (shown on hover) -->
      <button
        v-if="row.valuesBySet[set.id] !== undefined && !cellIsMasked(set.id)"
        class="absolute top-1 right-1 p-0.5 rounded text-text-muted/0 group-hover/cell:text-text-muted hover:!text-accent transition-colors z-[1]"
        title="Copy value to clipboard"
        @click.stop="emit('copyValue', row.valuesBySet[set.id]!)"
      >
        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>

      <!-- Secret warning indicator -->
      <span
        v-if="getSecretWarning(set.id)"
        class="absolute bottom-1 right-1 text-warning/40"
        :title="getSecretWarning(set.id)!"
      >
        <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 9v3m0 3h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </span>

      <!-- Changed value, unmasked: full old -> new diff -->
      <template v-if="hasValueChange(set.id) && !cellIsMasked(set.id)">
        <div class="space-y-0.5" @click.stop>
          <code class="font-mono text-[11px] text-danger/50 line-through block truncate max-w-[200px]">{{
            originalValue(set.id) || '(empty)'
          }}</code>
          <code class="font-mono text-xs text-success block truncate max-w-[200px]">{{
            row.valuesBySet[set.id]
          }}</code>
        </div>
      </template>

      <!-- Changed value, masked -->
      <template v-else-if="hasValueChange(set.id)">
        <span
          class="inline-flex items-center gap-1.5 cursor-pointer select-none"
          @click.stop="toggleReveal(`${row.key}-${set.id}`)"
        >
          <code class="font-mono text-xs text-text-muted">{{ MASK_PLACEHOLDER }}</code>
          <span class="text-[10px] font-medium text-accent shrink-0">edited</span>
        </span>
      </template>

      <!-- Added value -->
      <template v-else-if="wasAdded(set.id) && row.valuesBySet[set.id] !== undefined">
        <code
          class="font-mono text-xs text-success break-all max-w-[200px] inline-block whitespace-pre-wrap"
          :class="cellIsMasked(set.id) ? 'cursor-pointer select-none' : ''"
          @click.stop="cellIsMasked(set.id) && toggleReveal(`${row.key}-${set.id}`)"
        >{{ cellIsMasked(set.id) ? MASK_PLACEHOLDER : row.valuesBySet[set.id] }}</code>
      </template>

      <!-- Unchanged value -->
      <template v-else-if="row.valuesBySet[set.id] !== undefined">
        <code
          class="font-mono text-xs break-all max-w-[200px] inline-block whitespace-pre-wrap"
          :class="cellIsMasked(set.id) ? 'text-text-muted cursor-pointer select-none' : 'text-text-secondary'"
          @click.stop="cellIsMasked(set.id) && toggleReveal(`${row.key}-${set.id}`)"
        >{{ cellIsMasked(set.id) ? MASK_PLACEHOLDER : row.valuesBySet[set.id] }}</code>
      </template>

      <!-- Missing -->
      <span v-else class="text-danger font-semibold text-xs">Missing</span>
    </td>
  </tr>

  <!-- Expanded action panel -->
  <tr v-if="expanded" class="bg-surface-secondary/25">
    <td :colspan="2 + sets.length" class="px-4 py-3">
      <div class="space-y-3">
        <!-- Panel heading -->
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-semibold text-text-secondary">
            Set <code class="font-mono text-accent">{{ row.key }}</code> across your environments
          </p>
          <div class="flex items-center gap-2">
            <button
              v-if="keyHistory.length > 0"
              class="focus-ring text-[11px] text-text-muted hover:text-text-secondary transition-colors"
              @click.stop="showHistory = !showHistory"
            >
              {{ showHistory ? 'Hide history' : `${keyHistory.length} change${keyHistory.length !== 1 ? 's' : ''}` }}
            </button>
          </div>
        </div>

        <!-- Comment documentation -->
        <div v-if="hasComments" class="rounded-[var(--radius-md)] bg-accent/5 border border-accent/10 px-3 py-2">
          <p class="text-[11px] font-medium text-accent/80 mb-1">Documentation</p>
          <div v-for="c in keyComments" :key="c.setName" class="text-[11px] text-text-secondary">
            <template v-if="keyComments.length > 1">
              <span class="text-text-muted">[{{ c.setName }}]</span>
            </template>
            <span v-for="(line, i) in c.above" :key="i" class="block">{{ line }}</span>
            <span v-if="c.inline" class="block italic">{{ c.inline }}</span>
          </div>
        </div>

        <!-- Drift warnings -->
        <div
          v-if="driftWarnings.length > 0"
          class="rounded-[var(--radius-md)] bg-warning/5 border border-warning/10 px-3 py-2"
        >
          <div v-for="w in driftWarnings" :key="`${w.ruleId}-${w.setId}`" class="text-[11px]">
            <span class="text-warning font-medium">{{ w.message }}</span>
            <span class="text-text-muted block">{{ w.suggestion }}</span>
          </div>
        </div>

        <!-- Change history (collapsible) -->
        <div
          v-if="showHistory && keyHistory.length > 0"
          class="rounded-lg border border-border/60 bg-surface-secondary/28 px-3 py-2 max-h-[120px] overflow-y-auto"
        >
          <p class="text-[11px] font-medium text-text-tertiary mb-1">Change history</p>
          <div v-for="entry in keyHistory.slice(0, 20)" :key="entry.timestamp" class="text-[11px] flex items-center gap-2 py-0.5">
            <span class="text-text-muted shrink-0" :title="new Date(entry.timestamp).toLocaleString()">{{ formatRelativeTime(entry.timestamp) }}</span>
            <span class="text-text-muted shrink-0">{{ entry.envSetName }}</span>
            <code v-if="entry.previousValue !== undefined" class="text-danger/50 font-mono truncate max-w-[100px]">{{ entry.previousValue || '(empty)' }}</code>
            <span v-if="entry.previousValue !== undefined" class="text-text-muted shrink-0">&rarr;</span>
            <code class="text-success font-mono truncate max-w-[100px]">{{ entry.newValue }}</code>
          </div>
        </div>

        <!-- Editable value with source hint -->
        <div class="flex items-center gap-2">
          <label class="text-xs font-medium text-text-tertiary shrink-0">
            New value<template v-if="referenceSet"> (from {{ referenceSet.name }})</template>:
          </label>
          <input
            v-model="editValue"
            type="text"
            class="flex-1 rounded-md border border-border bg-surface/60 px-2.5 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            @click.stop
            @keydown.stop
          />
        </div>

        <!-- Action legend -->
        <p class="text-[11px] text-text-muted leading-relaxed">
          <strong class="text-text-tertiary">Apply</strong> = update in this session only, no files touched
          <span class="mx-1.5 text-border-default">&middot;</span>
          <strong class="text-text-tertiary">Write</strong> = save to disk (backup created automatically)
          <span class="mx-1.5 text-border-default">&middot;</span>
          <strong class="text-text-tertiary">Copy to</strong> = copy value to another environment
        </p>

        <!-- Per-set action rows -->
        <div class="space-y-1.5">
          <div
            v-for="set in sets"
            :key="set.id"
            class="rounded-[var(--radius-sm)] px-2 py-1.5 text-xs transition-all"
            :class="[
              set.id === referenceSetId ? 'bg-accent/5' : '',
              isEdited(set.id) ? 'ring-1 ring-accent/20' : '',
            ]"
          >
            <div class="flex items-center gap-3">
              <span
                class="w-[140px] shrink-0 truncate font-medium"
                :class="set.id === referenceSetId ? 'text-accent' : 'text-text-secondary'"
              >{{ set.name }}</span>

              <!-- Value + change preview -->
              <div class="flex-1 min-w-0 flex items-center gap-1.5">
                <template v-if="valueMatches(set.id)">
                  <code class="font-mono truncate text-text-muted">{{ row.valuesBySet[set.id] ?? editValue }}</code>
                  <span
                    v-if="isEdited(set.id)"
                    class="inline-flex items-center gap-1 text-success text-[11px] font-medium shrink-0"
                  >
                    <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    {{ wasAdded(set.id) ? 'Added' : 'Applied' }}
                  </span>
                  <span
                    v-if="canRevert(set.id)"
                    class="text-[11px] text-text-muted shrink-0 max-w-[140px] truncate"
                    :title="`Original: ${originalValue(set.id)}`"
                  >&middot; was: {{ originalValue(set.id) }}</span>
                  <span v-if="!isEdited(set.id)" class="text-success/60 text-[11px] shrink-0">&check;</span>
                </template>
                <template v-else-if="row.valuesBySet[set.id] !== undefined">
                  <code class="font-mono truncate text-text-muted">{{ row.valuesBySet[set.id] }}</code>
                  <span class="text-text-muted/60 shrink-0">&rarr;</span>
                  <code class="font-mono truncate text-accent">{{ editValue }}</code>
                </template>
                <template v-else>
                  <span class="text-danger/60 text-[11px]">missing</span>
                  <span class="text-text-muted/60 shrink-0">&rarr;</span>
                  <code class="font-mono truncate text-accent">{{ editValue }}</code>
                </template>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-1.5 shrink-0 min-w-[100px] justify-end">
                <template v-if="valueMatches(set.id)">
                  <BaseButton
                    v-if="canRevert(set.id)"
                    variant="ghost"
                    size="sm"
                    @click.stop="emit('revertMemory', [set.id, row.key])"
                  >Revert</BaseButton>
                </template>
                <template v-else>
                  <BaseButton
                    variant="primary"
                    size="sm"
                    @click.stop="emit('applyMemory', [set.id, row.key, editValue])"
                    title="Update in this session only — no files touched"
                  >Apply</BaseButton>
                  <BaseButton
                    v-if="set.filePath"
                    variant="danger"
                    size="sm"
                    @click.stop="emit('applyFile', [set.id, row.key, editValue])"
                    :title="`Save to ${set.name} on disk — backup created automatically`"
                  >Write to {{ set.name }}</BaseButton>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </td>
  </tr>
</template>
