<script setup lang="ts">
import { SCard } from "@stuntrocket/ui";

defineProps<{
  padding?: string;
}>();
</script>

<template>
  <SCard variant="glass" :class="padding ?? 'p-5'">
    <slot />
  </SCard>
</template>
