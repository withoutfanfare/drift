<script setup lang="ts">
import { useId } from "vue";

const model = defineModel<string>({ required: true });
const inputId = useId();

defineProps<{
  label?: string;
  placeholder?: string;
  type?: string;
}>();
</script>

<template>
  <div>
    <label v-if="label" :for="inputId" class="block mb-1 text-xs text-text-tertiary">{{ label }}</label>
    <input
      :id="inputId"
      v-model="model"
      :type="type ?? 'text'"
      :placeholder="placeholder"
      class="w-full rounded-[var(--radius-md)] border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-ring"
    />
  </div>
</template>
