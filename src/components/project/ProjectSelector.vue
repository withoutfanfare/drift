<script setup lang="ts">
import type { ProjectProfile } from "../../types";
import { SFormField, SSelect } from "@stuntrocket/ui";

defineProps<{
  projects: ProjectProfile[];
}>();

const activeProjectId = defineModel<string>({ required: true });
</script>

<template>
  <SFormField label="Active project">
    <SSelect v-model="activeProjectId">
      <option v-if="projects.length === 0" value="" disabled>No projects - create one first</option>
      <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
    </SSelect>
  </SFormField>
</template>
