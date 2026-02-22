<script setup lang="ts">
defineProps<{
  label: string;
  value: number | string;
  variant?: "default" | "danger" | "warning";
}>();
</script>

<template>
  <div class="glass-card p-4 animate-scale-in">
    <span class="block text-xs text-text-tertiary">{{ label }}</span>
    <strong
      class="text-xl font-semibold"
      :class="{
        'text-text-primary': !variant || variant === 'default',
        'text-danger': variant === 'danger',
        'text-warning': variant === 'warning',
      }"
    >
      {{ value }}
    </strong>
  </div>
</template>
