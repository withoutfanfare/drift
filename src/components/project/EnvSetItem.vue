<script setup lang="ts">
import { ref, computed } from "vue";
import type { EnvSet } from "../../types";
import BaseButton from "../ui/BaseButton.vue";
import ConfirmDialog from "../ui/ConfirmDialog.vue";

const props = defineProps<{
  set: EnvSet;
}>();

const emit = defineEmits<{
  remove: [setId: string];
}>();

const confirming = ref(false);

const keyCount = computed(() => Object.keys(props.set.values).length);

const roleBadgeClasses = computed(() => {
  switch (props.set.role) {
    case "local":
      return "bg-accent-muted text-accent";
    case "staging":
      return "bg-warning/15 text-warning";
    case "live":
      return "bg-danger/15 text-danger";
    default:
      return "bg-surface-2 text-text-tertiary";
  }
});
</script>

<template>
  <li class="rounded-[var(--radius-md)] border border-border-subtle bg-surface-1/50 p-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-text-primary truncate">{{ set.name }}</p>
        <div class="flex flex-wrap items-center gap-1.5 mt-1">
          <span
            class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            :class="roleBadgeClasses"
          >
            {{ set.role }}
          </span>
          <span class="text-xs text-text-muted">&middot;</span>
          <span class="text-xs text-text-muted">{{ set.source === 'scan' ? 'folder scan' : set.source === 'file' ? 'file picker' : set.source === 'manual' ? 'pasted' : set.source }}</span>
          <span class="text-xs text-text-muted">&middot;</span>
          <span class="text-xs text-text-muted">{{ keyCount }} key{{ keyCount !== 1 ? 's' : '' }}</span>
          <template v-if="set.duplicates.length > 0">
            <span class="text-xs text-text-muted">&middot;</span>
            <span class="text-xs text-warning">{{ set.duplicates.length }} dup{{ set.duplicates.length !== 1 ? 's' : '' }}</span>
          </template>
        </div>
        <p v-if="set.filePath" class="text-xs text-text-muted font-mono truncate mt-1">{{ set.filePath }}</p>
      </div>
      <BaseButton variant="ghost" size="sm" @click="confirming = true">Remove</BaseButton>
    </div>

    <ConfirmDialog
      v-if="confirming"
      title="Remove .env file?"
      :message="`Remove ${set.name} from Drift? A backup will be created first. The original file is not affected.`"
      confirm-label="Remove file"
      @confirm="confirming = false; emit('remove', set.id)"
      @cancel="confirming = false"
    />
  </li>
</template>
