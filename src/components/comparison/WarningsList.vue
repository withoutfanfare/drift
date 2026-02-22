<script setup lang="ts">
import { computed } from "vue";
import type { EnvSet, EnvRole } from "../../types";
import { evaluateUnsafe } from "../../composables/useAnalysis";

const props = defineProps<{
  sets: EnvSet[];
}>();

const warnings = computed(() => {
  const result: string[] = [];
  const rolesPresent = new Set<EnvRole>(props.sets.map((s) => s.role));

  if (!rolesPresent.has("local")) result.push("Coverage: local set missing.");
  if (!rolesPresent.has("staging")) result.push("Coverage: staging set missing.");
  if (!rolesPresent.has("live")) result.push("Coverage: live set missing.");

  for (const set of props.sets) {
    const requiredKeys = ["APP_KEY", "APP_DEBUG", "APP_ENV", "APP_URL", "DB_PASSWORD", "QUEUE_CONNECTION", "MAIL_MAILER"];
    const allKeys = new Set<string>([...Object.keys(set.values), ...requiredKeys]);

    for (const key of allKeys) {
      const reason = evaluateUnsafe(set, key, set.values[key]);
      if (reason) {
        result.push(`${set.name}: ${key} → ${reason}`);
      }
    }

    if (set.duplicates.length > 0) {
      result.push(`${set.name}: duplicate key declarations (${set.duplicates.join(", ")}).`);
    }
  }

  return result;
});
</script>

<template>
  <div class="mt-5">
    <h3 class="text-sm font-semibold text-text-secondary mb-2">Warnings + Coverage</h3>
    <div v-if="warnings.length > 0" class="relative">
      <ul class="max-h-56 overflow-y-auto space-y-1 text-sm text-text-secondary">
        <li v-for="(w, i) in warnings" :key="i" class="pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-text-muted">
          {{ w }}
        </li>
      </ul>
      <div v-if="warnings.length > 6" class="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-surface-base/80 to-transparent" />
    </div>
    <p v-else class="text-sm text-text-muted">No warnings detected for this project.</p>
  </div>
</template>
