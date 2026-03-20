<script setup lang="ts">
import { SFormField, SInput } from "@stuntrocket/ui";

const model = defineModel<string>({ required: true });

defineProps<{
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  type?: string;
}>();
</script>

<template>
  <SFormField v-if="label" :label="label">
    <SInput
      v-model="model"
      :type="type ?? 'text'"
      :placeholder="placeholder"
    />
  </SFormField>
  <SInput
    v-else
    v-model="model"
    :type="type ?? 'text'"
    :placeholder="placeholder"
  />
</template>
