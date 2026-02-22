<script setup lang="ts">
import type { EnvSet } from "../../types";
import BaseSelect from "../ui/BaseSelect.vue";
import BaseButton from "../ui/BaseButton.vue";

defineProps<{
  sets: EnvSet[];
}>();

const targetSetId = defineModel<string>({ required: true });

const emit = defineEmits<{
  copyMissing: [];
  copyMerged: [];
  patchTarget: [];
}>();
</script>

<template>
  <div class="grid grid-cols-[1fr_auto] gap-3 items-end max-[1120px]:grid-cols-1">
    <BaseSelect v-model="targetSetId" label="Target set">
      <option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }} ({{ s.role }})</option>
    </BaseSelect>
    <div class="flex flex-wrap gap-2">
      <BaseButton variant="primary" @click="emit('copyMissing')">Copy Missing-Key Template</BaseButton>
      <BaseButton variant="tertiary" @click="emit('copyMerged')">Copy Merged Template</BaseButton>
      <BaseButton variant="danger" @click="emit('patchTarget')">Patch Missing Keys to Target</BaseButton>
    </div>
  </div>
</template>
