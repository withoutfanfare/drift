<script setup lang="ts">
import type { DriftWarning } from "../../types";
import { SButton as BaseButton } from "@stuntrocket/ui";

defineProps<{
  warnings: DriftWarning[];
}>();

const emit = defineEmits<{
  dismiss: [];
}>();
</script>

<template>
  <div class="mb-3 rounded-[var(--radius-md)] border border-accent/20 bg-accent/5 p-3">
    <div class="flex items-center justify-between gap-2 mb-2">
      <h4 class="text-xs font-semibold text-accent">Cross-environment drift analysis</h4>
      <BaseButton variant="ghost" size="sm" @click="emit('dismiss')">Dismiss</BaseButton>
    </div>
    <div class="space-y-1.5 max-h-[200px] overflow-y-auto">
      <div
        v-for="(w, i) in warnings"
        :key="i"
        class="rounded-[var(--radius-sm)] bg-surface-1/40 px-2.5 py-1.5"
      >
        <div class="flex items-start gap-2">
          <code class="text-[11px] font-mono text-accent shrink-0">{{ w.key }}</code>
          <div class="min-w-0">
            <p class="text-[11px] text-text-secondary">{{ w.message }}</p>
            <p class="text-[11px] text-text-muted">{{ w.suggestion }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
