<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>

<template>
  <p
    v-if="message"
    role="status"
    aria-live="polite"
    class="min-h-[1.4rem] text-sm text-accent transition-opacity duration-200"
  >
    {{ message }}
  </p>
</template>
