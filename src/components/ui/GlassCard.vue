<script setup lang="ts">
defineProps<{
  padding?: string;
}>();
</script>

<template>
  <div class="glass-card" :class="padding ?? 'p-5'">
    <slot />
  </div>
</template>
