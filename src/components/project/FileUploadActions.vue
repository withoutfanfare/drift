<script setup lang="ts">
import { ref } from "vue";
import BaseButton from "../ui/BaseButton.vue";
import ConfirmDialog from "../ui/ConfirmDialog.vue";

const emit = defineEmits<{
  loadFiles: [files: File[]];
  loadSample: [];
  clearSets: [];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const confirmingClear = ref(false);

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
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2">
      <BaseButton variant="primary" size="sm" @click="fileInputRef?.click()">Load .env files</BaseButton>
      <BaseButton variant="tertiary" size="sm" @click="emit('loadSample')">Load sample trio</BaseButton>
    </div>

    <div class="border-t border-border-subtle pt-2">
      <p class="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Loaded data action</p>
      <BaseButton
        variant="danger"
        size="sm"
        @click="confirmingClear = true"
      >
        Clear loaded sets (Drift only)
      </BaseButton>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept=".env,.txt"
      multiple
      class="hidden"
      @change="onFileChange"
    />
    <ConfirmDialog
      v-if="confirmingClear"
      title="Clear all loaded sets?"
      message="This will remove all env sets loaded for the active project in Drift. A backup will be created first. Your .env files are not affected."
      confirm-label="Clear sets"
      @confirm="confirmingClear = false; emit('clearSets')"
      @cancel="confirmingClear = false"
    />
  </div>
</template>
