<script setup lang="ts">
import type { EnvSet, KeyAnalysisRow } from "../../types";
import { computed } from "vue";

const props = defineProps<{
  sets: EnvSet[];
  analysis: KeyAnalysisRow[];
}>();

const driftCount = computed(() => props.analysis.filter((r) => r.drift).length);
const unsafeCount = computed(() => props.analysis.filter((r) => r.unsafe).length);

const stats = computed(() => [
  { label: "Files", value: props.sets.length, variant: "default" as const },
  { label: "Keys", value: props.analysis.length, variant: "default" as const },
  { label: "Drift", value: driftCount.value, variant: (driftCount.value > 0 ? "warning" : "default") as const },
  { label: "Unsafe", value: unsafeCount.value, variant: (unsafeCount.value > 0 ? "danger" : "default") as const },
]);
</script>

<template>
  <div class="card-glass flex divide-x divide-border/30 animate-scale-in">
    <div
      v-for="stat in stats"
      :key="stat.label"
      class="flex-1 flex items-center justify-center gap-2 py-2.5 px-3"
    >
      <span class="text-[11px] text-text-tertiary">{{ stat.label }}</span>
      <strong
        class="text-base font-semibold tabular-nums"
        :class="{
          'text-text-primary': stat.variant === 'default',
          'text-danger': stat.variant === 'danger',
          'text-warning': stat.variant === 'warning',
        }"
      >
        {{ stat.value }}
      </strong>
    </div>
  </div>
</template>
