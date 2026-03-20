<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { EnvSet, KeyAnalysisRow } from "../../types";
import { useMasking } from "../../composables/useMasking";
import StatusBadge from "./StatusBadge.vue";
import { SButton } from "@stuntrocket/ui";

const props = defineProps<{
  row: KeyAnalysisRow;
  sets: EnvSet[];
  referenceSetId: string;
  expanded: boolean;
  sessionEdits: Map<string, string | undefined>;
}>();

const emit = defineEmits<{
  toggle: [];
  applyMemory: [args: [targetSetId: string, key: string, value: string]];
  applyFile: [args: [targetSetId: string, key: string, value: string]];
  revertMemory: [args: [targetSetId: string, key: string]];
}>();

const { maskValue, shouldMask, isSensitiveKey, MASK_PLACEHOLDER } = useMasking();
const revealedCells = ref<Set<string>>(new Set());
const editValue = ref("");
const referenceSet = computed(() => props.sets.find(s => s.id === props.referenceSetId));

// Pre-fill editValue from reference set when expanded
watch(() => props.expanded, (isExpanded) => {
  if (isExpanded) {
    const refSet = props.sets.find(s => s.id === props.referenceSetId);
    editValue.value = refSet?.values[props.row.key] ?? "";
  }
});

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
    :class="{ 'bg-white/[0.02]': expanded }"
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
        {{ row.key }}
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
      class="px-3 py-2 text-sm transition-colors"
      :class="isEdited(set.id) ? 'bg-accent/5' : ''"
    >
      <!-- Changed value, unmasked: full old → new diff -->
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

      <!-- Changed value, masked: show dots + "edited" label (click to reveal diff) -->
      <template v-else-if="hasValueChange(set.id)">
        <span
          class="inline-flex items-center gap-1.5 cursor-pointer select-none"
          @click.stop="toggleReveal(`${row.key}-${set.id}`)"
        >
          <code class="font-mono text-xs text-text-muted">{{ MASK_PLACEHOLDER }}</code>
          <span class="text-[10px] font-medium text-accent shrink-0">edited</span>
        </span>
      </template>

      <!-- Added value: show in green (masked or not) -->
      <template v-else-if="wasAdded(set.id) && row.valuesBySet[set.id] !== undefined">
        <code
          class="font-mono text-xs text-success break-all max-w-[200px] inline-block whitespace-pre-wrap"
          :class="cellIsMasked(set.id) ? 'cursor-pointer select-none' : ''"
          @click.stop="cellIsMasked(set.id) && toggleReveal(`${row.key}-${set.id}`)"
        >{{ cellIsMasked(set.id) ? MASK_PLACEHOLDER : row.valuesBySet[set.id] }}</code>
      </template>

      <!-- Unchanged value: normal display -->
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
  <tr v-if="expanded" class="bg-surface-1/40">
    <td :colspan="2 + sets.length" class="px-4 py-3">
      <div class="space-y-3">
        <!-- Panel heading -->
        <p class="text-xs font-semibold text-text-secondary">
          Set <code class="font-mono text-accent">{{ row.key }}</code> across your environments
        </p>

        <!-- Editable value with source hint -->
        <div class="flex items-center gap-2">
          <label class="text-xs font-medium text-text-tertiary shrink-0">
            New value<template v-if="referenceSet"> (from {{ referenceSet.name }})</template>:
          </label>
          <input
            v-model="editValue"
            type="text"
            class="flex-1 rounded-[var(--radius-md)] border border-border-default bg-surface-0/60 px-2.5 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
            @click.stop
            @keydown.stop
          />
        </div>

        <!-- Action legend -->
        <p class="text-[11px] text-text-muted leading-relaxed">
          <strong class="text-text-tertiary">Apply</strong> = update in this session only, no files touched
          <span class="mx-1.5 text-border-default">·</span>
          <strong class="text-text-tertiary">Write</strong> = save to disk (backup created automatically)
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
                  >· was: {{ originalValue(set.id) }}</span>
                  <span v-if="!isEdited(set.id)" class="text-success/60 text-[11px] shrink-0">✓</span>
                </template>
                <template v-else-if="row.valuesBySet[set.id] !== undefined">
                  <code class="font-mono truncate text-text-muted">{{ row.valuesBySet[set.id] }}</code>
                  <span class="text-text-muted/60 shrink-0">→</span>
                  <code class="font-mono truncate text-accent">{{ editValue }}</code>
                </template>
                <template v-else>
                  <span class="text-danger/60 text-[11px]">missing</span>
                  <span class="text-text-muted/60 shrink-0">→</span>
                  <code class="font-mono truncate text-accent">{{ editValue }}</code>
                </template>
              </div>

              <!-- Actions: min-width prevents layout jump when switching between buttons/status -->
              <div class="flex items-center gap-1.5 shrink-0 min-w-[100px] justify-end">
                <template v-if="valueMatches(set.id)">
                  <SButton
                    v-if="canRevert(set.id)"
                    variant="ghost"
                    size="sm"
                    @click.stop="emit('revertMemory', [set.id, row.key])"
                  >Revert</SButton>
                </template>
                <template v-else>
                  <SButton
                    variant="primary"
                    size="sm"
                    @click.stop="emit('applyMemory', [set.id, row.key, editValue])"
                    title="Update in this session only — no files touched"
                  >Apply</SButton>
                  <SButton
                    v-if="set.filePath"
                    variant="danger"
                    size="sm"
                    @click.stop="emit('applyFile', [set.id, row.key, editValue])"
                    :title="`Save to ${set.name} on disk — backup created automatically`"
                  >Write to {{ set.name }}</SButton>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </td>
  </tr>
</template>
