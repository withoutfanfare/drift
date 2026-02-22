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
  <div>
    <h3 class="text-sm font-semibold text-text-secondary mt-5 mb-2">Sets in Active Project</h3>
    <div v-if="sets.length > 0" class="relative">
      <ul class="max-h-56 overflow-y-auto space-y-0.5">
        <EnvSetItem
          v-for="s in sets"
          :key="s.id"
          :set="s"
          @remove="emit('remove', $event)"
        />
      </ul>
      <div v-if="sets.length > 4" class="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-surface-base/80 to-transparent" />
    </div>
    <p v-else class="text-sm text-text-muted">No env sets loaded for this project.</p>
  </div>
</template>
