<script setup lang="ts">
import AmbientBackground from "./AmbientBackground.vue";
import { useMasking } from "../../composables/useMasking";

const { globalMasked, toggleMasking } = useMasking();
</script>

<template>
  <AmbientBackground />
  <div class="flex h-screen overflow-hidden">
    <slot name="sidebar" />
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <!-- Titlebar drag region for content area -->
      <div class="h-7 w-full shrink-0 flex items-center justify-end" style="-webkit-app-region: drag;">
        <button
          class="focus-ring rounded-[var(--radius-md)] p-1.5 text-text-muted hover:text-text-primary transition-colors"
          :title="globalMasked ? 'Reveal values' : 'Mask values'"
          :aria-label="globalMasked ? 'Reveal values' : 'Mask values'"
          style="-webkit-app-region: no-drag;"
          @click="toggleMasking"
        >
          <!-- Eye-off icon when masked -->
          <svg v-if="globalMasked" class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <!-- Eye icon when revealed -->
          <svg v-else class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
          </svg>
        </button>
      </div>
      <main class="flex-1 overflow-y-auto px-4 lg:px-6 pb-6 animate-content-fade-in">
        <slot />
      </main>
    </div>
  </div>
</template>
