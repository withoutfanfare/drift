<script setup lang="ts">
import AmbientBackground from "./AmbientBackground.vue";
</script>

<template>
  <AmbientBackground />
  <div class="flex h-screen overflow-hidden">
    <slot name="sidebar" />
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <!-- Titlebar drag region for content area -->
      <div class="h-7 w-full shrink-0" style="-webkit-app-region: drag;" />
      <main class="flex-1 overflow-y-auto px-4 lg:px-6 pb-6 animate-content-fade-in">
        <slot />
      </main>
    </div>
  </div>
</template>
