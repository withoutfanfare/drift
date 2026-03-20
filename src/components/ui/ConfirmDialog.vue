<script setup lang="ts">
import { SConfirmDialog } from "@stuntrocket/ui";

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
  <SConfirmDialog
    :open="true"
    :title="title"
    :message="message"
    :confirm-label="confirmLabel ?? 'Confirm'"
    :cancel-label="cancelLabel ?? 'Cancel'"
    danger
    @confirm="emit('confirm')"
    @cancel="emit('cancel')"
  />
</template>
