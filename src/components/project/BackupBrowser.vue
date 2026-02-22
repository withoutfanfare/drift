<script setup lang="ts">
import { ref, watch } from "vue";
import type { BackupEntry } from "../../types";
import { useProjects } from "../../composables/useProjects";
import { listProjectBackups } from "../../composables/useTauriCommands";
import GlassCard from "../ui/GlassCard.vue";
import BaseButton from "../ui/BaseButton.vue";

const { activeProject } = useProjects();
const backups = ref<BackupEntry[]>([]);
const loading = ref(false);
const expanded = ref(false);
let loadGeneration = 0;

async function loadBackups() {
  const project = activeProject.value;
  if (!project?.rootPath) return;

  const thisGeneration = ++loadGeneration;
  loading.value = true;
  try {
    const result = await listProjectBackups(project.rootPath);
    if (thisGeneration !== loadGeneration) return;
    backups.value = result;
  } catch {
    if (thisGeneration !== loadGeneration) return;
    backups.value = [];
  } finally {
    if (thisGeneration === loadGeneration) {
      loading.value = false;
    }
  }
}

watch(
  () => activeProject.value?.id,
  () => {
    backups.value = [];
    if (expanded.value) loadBackups();
  },
);

function toggleExpanded() {
  expanded.value = !expanded.value;
  if (expanded.value && backups.value.length === 0) {
    loadBackups();
  }
}

function formatTime(timestamp: number): string {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;

  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ` at ${time}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function humanReason(reason: string): string {
  return reason.replaceAll("-", " ");
}
</script>

<template>
  <GlassCard padding="p-0">
    <button
      class="focus-ring w-full flex items-center gap-2.5 px-5 py-3.5 text-left rounded-[var(--radius-xl)]"
      :aria-expanded="expanded"
      @click="toggleExpanded"
    >
      <svg class="h-4 w-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="text-sm font-medium text-text-primary flex-1">Backups</span>
      <span v-if="!expanded && backups.length > 0" class="text-xs text-text-muted">
        {{ backups.length }} backup{{ backups.length !== 1 ? 's' : '' }}
      </span>
      <svg
        class="h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-200"
        :class="expanded ? 'rotate-90' : ''"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div v-if="expanded" class="px-5 pb-5">
      <div v-if="loading" class="py-4 text-center text-xs text-text-muted">
        Scanning for backups...
      </div>

      <div v-else-if="backups.length === 0" class="py-4 text-center text-xs text-text-muted">
        No backups found for this project.
      </div>

      <ul v-else class="space-y-1.5">
        <li
          v-for="backup in backups"
          :key="backup.path"
          class="rounded-[var(--radius-md)] border border-border-subtle bg-surface-2/30 px-3 py-2"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-medium text-text-primary truncate">{{ backup.fileName }}</p>
              <p class="text-[11px] text-text-muted mt-0.5">
                {{ humanReason(backup.reason) }} · {{ formatSize(backup.sizeBytes) }}
              </p>
            </div>
            <span class="text-[11px] text-text-muted tabular-nums whitespace-nowrap">
              {{ formatTime(backup.timestamp) }}
            </span>
          </div>
        </li>
      </ul>

      <div class="mt-3 flex gap-2">
        <BaseButton variant="tertiary" size="sm" @click="loadBackups">
          Refresh
        </BaseButton>
      </div>
    </div>
  </GlassCard>
</template>
