<script setup lang="ts">
import { ref } from "vue";
import { SButton } from "@stuntrocket/ui";

const emit = defineEmits<{
  loadFiles: [files: File[]];
  loadSample: [];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length > 0) {
    emit("loadFiles", files);
  }
  input.value = "";
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <SButton variant="primary" size="sm" @click="fileInputRef?.click()">Load .env files</SButton>
    <SButton variant="secondary" size="sm" @click="emit('loadSample')">Load sample trio</SButton>
  </div>

  <input
    ref="fileInputRef"
    type="file"
    accept=".env,.txt"
    multiple
    class="hidden"
    @change="onFileChange"
  />
</template>
