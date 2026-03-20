<script setup lang="ts">
import type { ShortcutEntry } from "../../composables/useKeyboardShortcuts";
import { SModal } from "@stuntrocket/ui";
import BaseButton from "../ui/BaseButton.vue";

defineProps<{
  shortcuts: ShortcutEntry[];
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <SModal :open="true" max-width="28rem" @close="emit('close')">
    <template #header>
      <div class="px-5 py-4 border-b border-border-subtle">
        <h3 class="text-sm font-semibold text-text-primary">Keyboard shortcuts</h3>
        <p class="text-xs text-text-muted mt-1">Navigate and manage the comparison matrix faster.</p>
      </div>
    </template>

    <div class="px-5 py-3">
      <div class="space-y-2">
        <div
          v-for="shortcut in shortcuts"
          :key="shortcut.keys"
          class="flex items-center justify-between gap-3 py-1"
        >
          <div class="min-w-0">
            <span class="text-xs font-medium text-text-secondary">{{ shortcut.label }}</span>
            <span class="text-[11px] text-text-muted block">{{ shortcut.description }}</span>
          </div>
          <kbd class="shrink-0 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-1/80 px-2 py-0.5 text-[11px] font-mono text-text-tertiary">
            {{ shortcut.keys }}
          </kbd>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end px-5 py-3 border-t border-border-subtle">
        <BaseButton variant="secondary" size="sm" @click="emit('close')">Close</BaseButton>
      </div>
    </template>
  </SModal>
</template>
