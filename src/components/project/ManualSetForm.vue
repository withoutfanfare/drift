<script setup lang="ts">
import { ref } from "vue";
import type { EnvRole } from "../../types";
import { asRole } from "../../composables/useRoles";
import BaseInput from "../ui/BaseInput.vue";
import BaseSelect from "../ui/BaseSelect.vue";
import BaseTextarea from "../ui/BaseTextarea.vue";
import BaseButton from "../ui/BaseButton.vue";

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
    <BaseInput v-model="manualName" label="Manual set name" placeholder=".env.staging" />
    <BaseSelect v-model="manualRole" label="Manual set role">
      <option value="local">local</option>
      <option value="staging">staging</option>
      <option value="live">live</option>
      <option value="other">other</option>
    </BaseSelect>
    <BaseTextarea
      v-model="manualContent"
      label="Manual .env content"
      placeholder="APP_NAME=Laravel&#10;APP_ENV=staging"
      :rows="5"
    />
    <BaseButton variant="primary" @click="submit">Add Manual Set</BaseButton>
  </div>
</template>
