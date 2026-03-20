<script setup lang="ts">
import { computed } from "vue";
import type { FileChangeEvent } from "../../types";
import { SButton } from "@stuntrocket/ui";

const props = defineProps<{
  events: FileChangeEvent[];
}>();

const emit = defineEmits<{
  reload: [];
  dismiss: [];
}>();

const modifiedCount = computed(() =>
  props.events.filter((e) => e.kind === "modified").length,
);

const summary = computed(() => {
  if (modifiedCount.value === 1) {
    const event = props.events.find((e) => e.kind === "modified");
    const fileName = event?.path.split("/").pop() ?? "file";
    return `${fileName} was modified outside Drift.`;
  }
  return `${modifiedCount.value} .env files were modified outside Drift.`;
});
</script>

<template>
  <div
    class="mb-3 rounded-[var(--radius-md)] border border-accent/30 bg-accent/10 px-4 py-3 flex items-center justify-between gap-3 animate-scale-in"
  >
    <div class="flex items-center gap-2 min-w-0">
      <svg class="h-4 w-4 shrink-0 text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="text-sm text-text-primary truncate">{{ summary }}</span>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <SButton variant="primary" size="sm" @click="emit('reload')">Reload</SButton>
      <SButton variant="ghost" size="sm" @click="emit('dismiss')">Dismiss</SButton>
    </div>
  </div>
</template>
