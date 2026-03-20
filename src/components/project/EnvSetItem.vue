<script setup lang="ts">
import { ref, computed } from "vue";
import type { EnvSet } from "../../types";
import { SBadge } from "@stuntrocket/ui";
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
  <li class="rounded-[var(--radius-md)] border border-border-subtle bg-surface-1/50 p-3">
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
