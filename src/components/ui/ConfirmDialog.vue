<script setup lang="ts">
import BaseButton from "./BaseButton.vue";

defineProps<{
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    @click.self="emit('cancel')"
  >
    <div
      class="w-full max-w-md rounded-[var(--radius-xl)] border border-border-default bg-surface-1 p-5 shadow-elevated animate-[scale-in_200ms_ease-out]"
      role="alertdialog"
      aria-modal="true"
      :aria-label="title"
    >
      <h3 class="text-sm font-semibold text-text-primary">{{ title }}</h3>
      <p class="mt-2 text-sm text-text-secondary">{{ message }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <BaseButton variant="secondary" size="sm" @click="emit('cancel')">
          {{ cancelLabel ?? "Cancel" }}
        </BaseButton>
        <BaseButton variant="danger" size="sm" @click="emit('confirm')">
          {{ confirmLabel ?? "Confirm" }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
