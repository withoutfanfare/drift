<script setup lang="ts">
/**
 * BaseButton — thin wrapper over SButton from @stuntrocket/ui.
 *
 * Maps Drift's extra variants (tertiary, success) onto the library's
 * supported set (primary, secondary, danger, ghost, icon).
 *   - tertiary → secondary
 *   - success  → secondary (no library equivalent)
 */
import { computed } from "vue";
import { SButton } from "@stuntrocket/ui";

interface Props {
  variant?: "primary" | "secondary" | "tertiary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "secondary",
  size: "md",
  disabled: false,
  loading: false,
  fullWidth: false,
});

const mappedVariant = computed(() => {
  if (props.variant === "tertiary") return "secondary";
  if (props.variant === "success") return "secondary";
  return props.variant;
});
</script>

<template>
  <SButton
    :variant="mappedVariant"
    :size="size"
    :disabled="disabled"
    :loading="loading"
    :class="fullWidth ? 'w-full' : ''"
  >
    <slot />
  </SButton>
</template>
