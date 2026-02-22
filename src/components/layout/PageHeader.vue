<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  eyebrow?: string;
}>();
</script>

<template>
  <header class="px-1 pb-3 border-b border-border-subtle">
    <p v-if="eyebrow" class="text-[10px] font-bold uppercase tracking-wider text-text-muted">
      {{ eyebrow }}
    </p>
    <h1 class="text-[20px] leading-[1.25] font-semibold text-text-primary mt-1">{{ title }}</h1>
    <p class="text-[13px] text-text-secondary mt-1">{{ description }}</p>
  </header>
</template>
