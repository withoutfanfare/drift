<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "@stuntrocket/ui";

const { mode, toggle: toggleTheme } = useTheme({ storageKey: "drift-theme-mode" });

const tooltip = computed(() => {
  switch (mode.value) {
    case "system":
      return "Theme: System";
    case "light":
      return "Theme: Light";
    case "dark":
      return "Theme: Dark";
  }
});
</script>

<template>
  <button
    class="p-2 -m-1 rounded-md text-text-tertiary hover:text-text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    :title="tooltip"
    @click="toggleTheme"
  >
    <!-- Sun icon (light mode) -->
    <svg
      v-if="mode === 'light'"
      class="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>

    <!-- Moon icon (dark mode) -->
    <svg
      v-else-if="mode === 'dark'"
      class="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>

    <!-- Monitor icon (system mode) -->
    <svg
      v-else
      class="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  </button>
</template>
