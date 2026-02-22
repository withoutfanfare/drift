<script setup lang="ts">
import type { EnvSet } from "../../types";
import BaseSelect from "../ui/BaseSelect.vue";
import BaseInput from "../ui/BaseInput.vue";

defineProps<{
  sets: EnvSet[];
}>();

const filter = defineModel<string>("filter", { required: true });
const search = defineModel<string>("search", { required: true });
const referenceSetId = defineModel<string>("referenceSetId", { required: true });
</script>

<template>
  <div class="grid grid-cols-3 gap-3 max-[1120px]:grid-cols-1">
    <BaseSelect v-model="filter" label="Filter rows">
      <option value="all">All</option>
      <option value="missing">Missing</option>
      <option value="drift">Drift</option>
      <option value="unsafe">Unsafe</option>
      <option value="aligned">Aligned</option>
    </BaseSelect>
    <BaseInput v-model="search" label="Search key" placeholder="APP_" />
    <BaseSelect v-model="referenceSetId" label="Reference set">
      <option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }} ({{ s.role }})</option>
    </BaseSelect>
  </div>
</template>
