<script setup lang="ts">
import type { EnvSet } from "../../types";
import BaseButton from "../ui/BaseButton.vue";

defineProps<{
  sets: EnvSet[];
}>();

const emit = defineEmits<{
  dismiss: [];
}>();
</script>

<template>
  <div class="mb-3 rounded-[var(--radius-md)] border border-warning/20 bg-warning/5 p-3">
    <div class="flex items-center justify-between gap-2 mb-2">
      <h4 class="text-xs font-semibold text-warning">Syntax validation warnings</h4>
      <BaseButton variant="ghost" size="sm" @click="emit('dismiss')">Dismiss</BaseButton>
    </div>
    <div class="space-y-2 max-h-[200px] overflow-y-auto">
      <template v-for="set in sets" :key="set.id">
        <div v-if="set.validationWarnings.length > 0">
          <p class="text-[11px] font-medium text-text-secondary mb-1">{{ set.name }}</p>
          <div
            v-for="(w, i) in set.validationWarnings"
            :key="i"
            class="text-[11px] flex items-start gap-2 py-0.5"
          >
            <span class="shrink-0 text-text-muted tabular-nums">L{{ w.line }}</span>
            <span
              class="inline-block rounded px-1 text-[10px] font-medium shrink-0"
              :class="w.severity === 'error' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'"
            >{{ w.severity }}</span>
            <span class="text-text-secondary">{{ w.message }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
