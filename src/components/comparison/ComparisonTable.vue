<script setup lang="ts">
import type { EnvSet, KeyAnalysisRow } from "../../types";
import ComparisonTableRow from "./ComparisonTableRow.vue";

defineProps<{
  rows: KeyAnalysisRow[];
  sets: EnvSet[];
}>();

const emit = defineEmits<{
  selectKey: [key: string];
}>();
</script>

<template>
  <div class="mt-4 max-h-[60vh] overflow-auto rounded-[var(--radius-lg)] border border-border-default">
    <table class="w-full min-w-[760px] text-sm border-collapse">
      <thead>
        <tr class="bg-surface-1/80 sticky top-0 z-10">
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
          @select-key="emit('selectKey', $event)"
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
