<script setup lang="ts">
import type { EnvSet, KeyAnalysisRow } from "../../types";
import StatusBadge from "./StatusBadge.vue";

defineProps<{
  row: KeyAnalysisRow;
  sets: EnvSet[];
}>();

const emit = defineEmits<{
  selectKey: [key: string];
}>();
</script>

<template>
  <tr
    class="cursor-pointer hover:bg-white/[0.03] transition-colors"
    @click="emit('selectKey', row.key)"
  >
    <td class="px-3 py-2 text-sm font-mono text-text-primary">{{ row.key }}</td>
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
      class="px-3 py-2 text-sm"
    >
      <template v-if="row.valuesBySet[set.id] !== undefined">
        <code class="font-mono text-xs text-text-secondary break-all max-w-[260px] inline-block whitespace-pre-wrap">{{ row.valuesBySet[set.id] }}</code>
      </template>
      <span v-else class="text-danger font-semibold text-xs">Missing</span>
    </td>
  </tr>
</template>
