<script setup lang="ts">
import { computed } from "vue";
import type { EnvSet } from "../../types";
import BaseSelect from "../ui/BaseSelect.vue";
import BaseButton from "../ui/BaseButton.vue";

const props = defineProps<{
  sets: EnvSet[];
  missingCount?: number;
  targetFileName?: string;
}>();

const targetSetId = defineModel<string>({ required: true });

const emit = defineEmits<{
  copyMissing: [];
  copyMerged: [];
  patchTarget: [];
}>();

const patchLabel = computed(() =>
  props.missingCount && props.targetFileName
    ? `Add ${props.missingCount} missing keys to ${props.targetFileName}`
    : "Add missing keys to file",
);
</script>

<template>
  <div class="grid grid-cols-[1fr_auto] gap-3 items-end max-[1120px]:grid-cols-1">
    <BaseSelect v-model="targetSetId" label="Compare to">
      <option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }} ({{ s.role }})</option>
    </BaseSelect>
    <div class="flex flex-wrap gap-2">
      <BaseButton variant="primary" @click="emit('copyMissing')">Copy missing keys</BaseButton>
      <BaseButton variant="tertiary" @click="emit('copyMerged')">Export combined .env</BaseButton>
      <BaseButton variant="danger" @click="emit('patchTarget')">{{ patchLabel }}</BaseButton>
    </div>
  </div>
</template>
