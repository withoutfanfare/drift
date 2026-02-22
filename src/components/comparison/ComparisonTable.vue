<script setup lang="ts">
import { ref, watch } from "vue";
import type { EnvSet, KeyAnalysisRow } from "../../types";
import ComparisonTableRow from "./ComparisonTableRow.vue";

const props = defineProps<{
  rows: KeyAnalysisRow[];
  sets: EnvSet[];
  referenceSetId: string;
  sessionEdits: Map<string, string | undefined>;
}>();

const emit = defineEmits<{
  applyMemory: [targetSetId: string, key: string, value: string];
  applyFile: [targetSetId: string, key: string, value: string];
  revertMemory: [targetSetId: string, key: string];
}>();

const expandedKey = ref<string | null>(null);

// Collapse expanded row when visible keys change (filter/search), not on value mutations
watch(
  () => props.rows.map((r) => r.key).join("\0"),
  () => { expandedKey.value = null; },
);

function onToggle(key: string) {
  expandedKey.value = expandedKey.value === key ? null : key;
}
</script>

<template>
  <div class="mt-4 max-h-[60vh] overflow-auto rounded-[var(--radius-lg)] border border-border-default">
    <table class="w-full min-w-[760px] text-sm border-collapse">
      <thead>
        <tr class="bg-surface-1/80 sticky top-0 z-10 shadow-[0_1px_0_0_var(--color-border-subtle)]">
          <th class="px-3 py-2 text-left text-xs font-medium text-text-tertiary">Key</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-text-tertiary">Status</th>
          <th
            v-for="set in sets"
            :key="set.id"
            class="px-3 py-2 text-left text-xs font-medium text-text-tertiary"
          >
            {{ set.name }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border-subtle">
        <ComparisonTableRow
          v-for="row in rows"
          :key="row.key"
          :row="row"
          :sets="sets"
          :reference-set-id="referenceSetId"
          :expanded="expandedKey === row.key"
          :session-edits="sessionEdits"
          @toggle="onToggle(row.key)"
          @apply-memory="emit('applyMemory', $event[0], $event[1], $event[2])"
          @apply-file="emit('applyFile', $event[0], $event[1], $event[2])"
          @revert-memory="emit('revertMemory', $event[0], $event[1])"
        />
        <tr v-if="rows.length === 0">
          <td :colspan="2 + sets.length" class="px-3 py-6 text-center text-sm text-text-muted">
            No rows match current filters.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
