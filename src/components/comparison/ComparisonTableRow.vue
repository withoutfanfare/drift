<script setup lang="ts">
import { ref } from "vue";
import type { EnvSet, KeyAnalysisRow } from "../../types";
import { useMasking } from "../../composables/useMasking";
import StatusBadge from "./StatusBadge.vue";

defineProps<{
  row: KeyAnalysisRow;
  sets: EnvSet[];
}>();

const emit = defineEmits<{
  selectKey: [key: string];
}>();

const { maskValue, shouldMask, isSensitiveKey } = useMasking();
const revealedCells = ref<Set<string>>(new Set());

function toggleReveal(cellId: string) {
  if (revealedCells.value.has(cellId)) {
    revealedCells.value.delete(cellId);
  } else {
    revealedCells.value.add(cellId);
  }
}

function isRevealed(cellId: string): boolean {
  return revealedCells.value.has(cellId);
}
</script>

<template>
  <tr
    class="cursor-pointer hover:bg-white/[0.03] transition-colors"
    @click="emit('selectKey', row.key)"
  >
    <td class="px-3 py-2 text-sm font-mono text-text-primary">
      <span class="flex items-center gap-1.5">
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
      class="px-3 py-2 text-sm"
    >
      <template v-if="row.valuesBySet[set.id] !== undefined">
        <code
          class="font-mono text-xs break-all max-w-[260px] inline-block whitespace-pre-wrap"
          :class="shouldMask(row.key, row.valuesBySet[set.id]!) && !isRevealed(`${row.key}-${set.id}`)
            ? 'text-text-muted cursor-pointer select-none'
            : 'text-text-secondary'"
          @click.stop="shouldMask(row.key, row.valuesBySet[set.id]!) ? toggleReveal(`${row.key}-${set.id}`) : emit('selectKey', row.key)"
        >{{ shouldMask(row.key, row.valuesBySet[set.id]!) && !isRevealed(`${row.key}-${set.id}`)
            ? maskValue(row.key, row.valuesBySet[set.id]!)
            : row.valuesBySet[set.id] }}</code>
      </template>
      <span v-else class="text-danger font-semibold text-xs">Missing</span>
    </td>
  </tr>
</template>
