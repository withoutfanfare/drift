<script setup lang="ts">
import { ref } from "vue";
import type { EnvSet } from "../../types";
import BaseButton from "../ui/BaseButton.vue";
import ConfirmDialog from "../ui/ConfirmDialog.vue";

defineProps<{
  set: EnvSet;
}>();

const emit = defineEmits<{
  remove: [setId: string];
}>();

const confirming = ref(false);
</script>

<template>
  <li class="flex items-start justify-between gap-2 py-1.5">
    <div class="min-w-0">
      <span class="font-medium text-sm text-text-primary">{{ set.name }}</span>
      <span class="text-xs text-text-tertiary ml-1.5">
        ({{ set.role }}, {{ set.source }}, {{ Object.keys(set.values).length }} keys<template v-if="set.duplicates.length">, {{ set.duplicates.length }} duplicates</template>)
      </span>
      <div v-if="set.filePath" class="text-xs text-text-muted truncate">{{ set.filePath }}</div>
    </div>
    <BaseButton variant="tertiary" size="sm" @click="confirming = true">Remove from Drift</BaseButton>

    <ConfirmDialog
      v-if="confirming"
      title="Remove env set?"
      :message="`Remove ${set.name} from Drift? A backup will be created first. The original file is not affected.`"
      confirm-label="Remove set"
      @confirm="confirming = false; emit('remove', set.id)"
      @cancel="confirming = false"
    />
  </li>
</template>
