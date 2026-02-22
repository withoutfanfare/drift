<script setup lang="ts">
import type { EnvSet } from "../../types";
import EnvSetItem from "./EnvSetItem.vue";
import BaseButton from "../ui/BaseButton.vue";

defineProps<{
  sets: EnvSet[];
}>();

const emit = defineEmits<{
  remove: [setId: string];
  scan: [];
  loadFiles: [];
}>();
</script>

<template>
  <ul v-if="sets.length > 0" class="space-y-2">
    <EnvSetItem
      v-for="s in sets"
      :key="s.id"
      :set="s"
      @remove="emit('remove', $event)"
    />
  </ul>
  <div v-else class="py-8 text-center">
    <p class="text-sm text-text-secondary">No environment sets loaded yet.</p>
    <p class="text-xs text-text-muted mt-1">Scan your project or load .env files to begin.</p>
    <div class="flex justify-center gap-2 mt-4">
      <BaseButton variant="tertiary" size="sm" @click="emit('scan')">Scan project</BaseButton>
      <BaseButton variant="primary" size="sm" @click="emit('loadFiles')">Load .env files</BaseButton>
    </div>
  </div>
</template>
