<script setup lang="ts">
import type { EnvSet, KeyAnalysisRow } from "../../types";
import KpiCard from "./KpiCard.vue";
import { computed } from "vue";

const props = defineProps<{
  sets: EnvSet[];
  analysis: KeyAnalysisRow[];
}>();

const driftCount = computed(() => props.analysis.filter((r) => r.drift).length);
const unsafeCount = computed(() => props.analysis.filter((r) => r.unsafe).length);
</script>

<template>
  <section class="grid grid-cols-4 gap-3 mb-5 max-[1120px]:grid-cols-2">
    <KpiCard label="Loaded sets" :value="sets.length" style="animation-delay: 0ms;" />
    <KpiCard label="Total keys" :value="analysis.length" style="animation-delay: 60ms;" />
    <KpiCard label="Drift keys" :value="driftCount" :variant="driftCount > 0 ? 'warning' : 'default'" style="animation-delay: 120ms;" />
    <KpiCard label="Unsafe flags" :value="unsafeCount" :variant="unsafeCount > 0 ? 'danger' : 'default'" style="animation-delay: 180ms;" />
  </section>
</template>
