<script setup lang="ts">
import type { ProjectProfile } from "../../types";
import BaseSelect from "../ui/BaseSelect.vue";

defineProps<{
  projects: ProjectProfile[];
}>();

const activeProjectId = defineModel<string>({ required: true });
</script>

<template>
  <BaseSelect v-model="activeProjectId" label="Active project">
    <option v-if="projects.length === 0" value="" disabled>No projects - create one first</option>
    <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
  </BaseSelect>
</template>
