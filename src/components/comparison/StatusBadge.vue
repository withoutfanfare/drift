<script setup lang="ts">
import { computed } from "vue";
import { SBadge } from "@stuntrocket/ui";

const props = defineProps<{
  status: "missing" | "drift" | "unsafe" | "aligned";
  count?: number;
  tooltip?: string;
}>();

const variant = computed(() => {
  switch (props.status) {
    case "missing": return "error" as const;
    case "drift": return "warning" as const;
    case "unsafe": return "warning" as const;
    case "aligned": return "success" as const;
  }
});

const label = computed(() => {
  switch (props.status) {
    case "missing": return props.count ? `Missing (${props.count})` : "Missing";
    case "drift": return "Drift";
    case "unsafe": return "Unsafe";
    case "aligned": return "Aligned";
  }
});
</script>

<template>
  <SBadge :variant="variant" :title="tooltip">{{ label }}</SBadge>
</template>
