<script setup lang="ts">
import { useId } from "vue";

const model = defineModel<string>({ required: true });
const selectId = useId();

defineProps<{
  label?: string;
  ariaLabel?: string;
}>();
</script>

<template>
  <div>
    <label v-if="label" :for="selectId" class="block mb-1 text-xs text-text-tertiary">{{ label }}</label>
    <div class="relative">
      <select
        :id="selectId"
        v-model="model"
        :aria-label="!label ? ariaLabel : undefined"
        class="w-full rounded-[var(--radius-md)] border border-border-default bg-surface-1 px-3 py-2 pr-8 text-sm text-text-primary focus-ring appearance-none"
      >
        <slot />
      </select>
      <svg
        class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
      </svg>
    </div>
  </div>
</template>
