<script setup lang="ts">
import { useId } from "vue";

const model = defineModel<string>({ required: true });
const textareaId = useId();

const props = defineProps<{
  label?: string;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
}>();
</script>

<template>
  <div>
    <label v-if="label" :for="textareaId" class="block mb-1 text-xs text-text-tertiary">{{ label }}</label>
    <textarea
      :id="textareaId"
      v-model="model"
      :placeholder="placeholder"
      :rows="props.rows ?? 5"
      :aria-label="props.ariaLabel"
      class="w-full rounded-[var(--radius-md)] border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary font-mono placeholder:text-text-muted focus-ring resize-y"
    />
  </div>
</template>
