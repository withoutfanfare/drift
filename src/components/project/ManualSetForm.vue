<script setup lang="ts">
import { ref } from "vue";
import type { EnvRole } from "../../types";
import { asRole } from "../../composables/useRoles";
import { SFormField, SInput, SSelect, STextarea, SButton } from "@stuntrocket/ui";

const emit = defineEmits<{
  addManual: [name: string, role: EnvRole, rawText: string];
}>();

const manualName = ref(".env.qa");
const manualRole = ref("staging");
const manualContent = ref(
  [
    "APP_NAME=Laravel",
    "APP_ENV=qa",
    "APP_KEY=base64:qakey",
    "APP_DEBUG=false",
    "APP_URL=https://qa.example.com",
    "DB_PASSWORD=qapass",
  ].join("\n"),
);

function submit() {
  const name = manualName.value.trim();
  const rawText = manualContent.value;
  if (!name || rawText.trim().length === 0) return;

  emit("addManual", name, asRole(manualRole.value), rawText);
  manualName.value = "";
  manualRole.value = "local";
  manualContent.value = "";
}
</script>

<template>
  <div class="space-y-3 mt-4">
    <SFormField label="Manual set name">
      <SInput v-model="manualName" placeholder=".env.staging" />
    </SFormField>
    <SFormField label="Manual set role">
      <SSelect v-model="manualRole">
        <option value="local">local</option>
        <option value="staging">staging</option>
        <option value="live">live</option>
        <option value="other">other</option>
      </SSelect>
    </SFormField>
    <SFormField label="Manual .env content">
      <STextarea
        v-model="manualContent"
        placeholder="APP_NAME=Laravel&#10;APP_ENV=staging"
        :rows="5"
      />
    </SFormField>
    <SButton variant="primary" @click="submit">Add Manual Set</SButton>
  </div>
</template>
