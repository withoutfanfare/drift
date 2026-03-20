<script setup lang="ts">
import { SEmptyState } from "@stuntrocket/ui";

defineProps<{
  heading: string;
  description: string;
}>();
</script>

<template>
  <SEmptyState :title="heading" :description="description">
    <template #action>
      <slot />
    </template>
  </SEmptyState>
</template>
