<script setup lang="ts">
import { ref, computed } from "vue";
import type { EnvSet } from "../../types";
import { SBadge, SButton, SConfirmDialog } from "@stuntrocket/ui";

const props = defineProps<{
  set: EnvSet;
}>();

const emit = defineEmits<{
  remove: [setId: string];
}>();

const confirming = ref(false);

const keyCount = computed(() => Object.keys(props.set.values).length);

const roleBadgeVariant = computed(() => {
  switch (props.set.role) {
    case "local": return "accent" as const;
    case "staging": return "warning" as const;
    case "live": return "error" as const;
    default: return "default" as const;
  }
});
</script>

<template>
  <li class="rounded-lg border border-border/60 bg-surface-secondary/28 p-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-text-primary truncate">{{ set.name }}</p>
        <div class="flex flex-wrap items-center gap-1.5 mt-1">
          <SBadge :variant="roleBadgeVariant">{{ set.role }}</SBadge>
          <span class="text-xs text-text-muted">&middot;</span>
          <span class="text-xs text-text-muted">{{ set.source === 'scan' ? 'folder scan' : set.source === 'file' ? 'file picker' : set.source === 'manual' ? 'pasted' : set.source }}</span>
          <span class="text-xs text-text-muted">&middot;</span>
          <span class="text-xs text-text-muted">{{ keyCount }} key{{ keyCount !== 1 ? 's' : '' }}</span>
          <template v-if="set.duplicates.length > 0">
            <span class="text-xs text-text-muted">&middot;</span>
            <SBadge variant="warning">{{ set.duplicates.length }} dup{{ set.duplicates.length !== 1 ? 's' : '' }}</SBadge>
          </template>
        </div>
        <p v-if="set.filePath" class="text-xs text-text-muted font-mono truncate mt-1">{{ set.filePath }}</p>
      </div>
      <SButton variant="ghost" size="sm" @click="confirming = true">Remove</SButton>
    </div>

    <SConfirmDialog
      v-if="confirming"
      :open="true"
      title="Remove .env file?"
      :message="`Remove ${set.name} from Drift? A backup will be created first. The original file is not affected.`"
      confirm-label="Remove file"
      danger
      @confirm="confirming = false; emit('remove', set.id)"
      @cancel="confirming = false"
      @close="confirming = false"
    />
  </li>
</template>
