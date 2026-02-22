<script setup lang="ts">
import type { EnvSet } from "../../types";
import EnvSetItem from "./EnvSetItem.vue";

defineProps<{
  sets: EnvSet[];
}>();

const emit = defineEmits<{
  remove: [setId: string];
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
  </div>
</template>
