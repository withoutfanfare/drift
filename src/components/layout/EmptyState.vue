<script setup lang="ts">
defineProps<{
  heading: string;
  description: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 px-6 text-center">
    <h2 class="text-lg font-semibold text-text-primary">{{ heading }}</h2>
    <p class="text-sm text-text-secondary mt-2 max-w-md">{{ description }}</p>
    <div class="mt-5 flex flex-wrap justify-center gap-2">
      <slot />
    </div>
  </div>
</template>
