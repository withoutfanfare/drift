<script setup lang="ts">
defineProps<{
  status: "missing" | "drift" | "unsafe" | "aligned";
  count?: number;
  tooltip?: string;
}>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-semibold"
    :class="{
      'bg-danger/20 text-danger': status === 'missing',
      'bg-warning/20 text-warning': status === 'drift',
      'bg-orange-500/20 text-orange-400': status === 'unsafe',
      'bg-success/20 text-success': status === 'aligned',
    }"
    :title="tooltip"
  >
    <template v-if="status === 'missing'">Missing<template v-if="count"> ({{ count }})</template></template>
    <template v-else-if="status === 'drift'">Drift</template>
    <template v-else-if="status === 'unsafe'">Unsafe</template>
    <template v-else>Aligned</template>
  </span>
</template>
