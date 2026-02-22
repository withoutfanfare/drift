<script setup lang="ts">
import { computed } from "vue";
import { computeDiff } from "../../composables/useDiff";
import BaseButton from "../ui/BaseButton.vue";

const props = defineProps<{
  title: string;
  filePath: string;
  original: string;
  updated: string;
  summary: string;
  confirmLabel?: string;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const diffLines = computed(() => computeDiff(props.original, props.updated));
const addedCount = computed(() => diffLines.value.filter((l) => l.type === "added").length);
const removedCount = computed(() => diffLines.value.filter((l) => l.type === "removed").length);
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="emit('cancel')">
    <div class="w-full max-w-2xl mx-4 rounded-[var(--radius-xl)] border border-border-default bg-surface-1 shadow-elevated overflow-hidden">
      <div class="px-5 py-4 border-b border-border-subtle">
        <h3 class="text-sm font-semibold text-text-primary">{{ title }}</h3>
        <p class="text-xs text-text-muted mt-1 font-mono truncate">{{ filePath }}</p>
      </div>

      <div class="px-5 py-3 border-b border-border-subtle">
        <p class="text-xs text-text-secondary">{{ summary }}</p>
        <div class="flex gap-3 mt-1.5">
          <span v-if="addedCount > 0" class="text-xs text-success font-medium">+{{ addedCount }} added</span>
          <span v-if="removedCount > 0" class="text-xs text-danger font-medium">-{{ removedCount }} removed</span>
        </div>
      </div>

      <div class="max-h-[360px] overflow-y-auto font-mono text-xs">
        <div
          v-for="(line, i) in diffLines"
          :key="i"
          class="flex"
          :class="{
            'bg-success/10': line.type === 'added',
            'bg-danger/10': line.type === 'removed',
          }"
        >
          <span class="w-10 shrink-0 text-right pr-2 text-text-muted select-none py-0.5">
            {{ line.lineNumber || '' }}
          </span>
          <span class="w-5 shrink-0 text-center py-0.5 select-none" :class="{
            'text-success': line.type === 'added',
            'text-danger': line.type === 'removed',
            'text-text-muted': line.type === 'context',
          }">
            {{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ' }}
          </span>
          <span class="flex-1 py-0.5 pr-4 whitespace-pre-wrap break-all" :class="{
            'text-success': line.type === 'added',
            'text-danger': line.type === 'removed',
            'text-text-secondary': line.type === 'context',
          }">{{ line.content }}</span>
        </div>

        <div v-if="diffLines.length === 0" class="px-5 py-8 text-center text-xs text-text-muted">
          No changes to preview.
        </div>
      </div>

      <div class="flex justify-end gap-2 px-5 py-3.5 border-t border-border-subtle">
        <BaseButton variant="tertiary" size="sm" @click="emit('cancel')">Cancel</BaseButton>
        <BaseButton variant="primary" size="sm" @click="emit('confirm')">{{ confirmLabel ?? 'Apply changes' }}</BaseButton>
      </div>
    </div>
  </div>
</template>
