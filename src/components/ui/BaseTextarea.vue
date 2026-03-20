<script setup lang="ts">
import { SFormField, STextarea } from "@stuntrocket/ui";

const model = defineModel<string>({ required: true });

const props = defineProps<{
  label?: string;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
}>();
</script>

<template>
  <SFormField v-if="label" :label="label">
    <STextarea
      v-model="model"
      :placeholder="placeholder"
      :rows="props.rows ?? 5"
    />
  </SFormField>
  <STextarea
    v-else
    v-model="model"
    :placeholder="placeholder"
    :rows="props.rows ?? 5"
  />
</template>
