<script setup lang="ts">
import { SFormField, SSelect } from "@stuntrocket/ui";

const model = defineModel<string>({ required: true });

defineProps<{
  label?: string;
  ariaLabel?: string;
}>();
</script>

<template>
  <SFormField v-if="label" :label="label">
    <SSelect v-model="model">
      <slot />
    </SSelect>
  </SFormField>
  <SSelect v-else v-model="model">
    <slot />
  </SSelect>
</template>
