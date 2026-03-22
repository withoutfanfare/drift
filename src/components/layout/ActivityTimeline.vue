<script setup lang="ts">
import { ref } from "vue";
import { useActivityLog } from "../../composables/useActivityLog";
import type { ActivityCategory } from "../../types";

const { recentEntries, clearLog } = useActivityLog();
const expanded = ref(false);
const expandedEntryId = ref<string | null>(null);

function toggleEntry(id: string) {
  expandedEntryId.value = expandedEntryId.value === id ? null : id;
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const categoryStyles: Record<ActivityCategory, { dot: string; icon: string }> = {
  info: { dot: "bg-accent", icon: "text-accent" },
  write: { dot: "bg-warning", icon: "text-warning" },
  destructive: { dot: "bg-danger", icon: "text-danger" },
  success: { dot: "bg-success", icon: "text-success" },
  error: { dot: "bg-danger", icon: "text-danger" },
};
</script>

<template>
  <div class="border-t border-border/60">
    <button
      class="focus-ring w-full flex items-center gap-2 px-4 py-2.5 text-left"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <svg
        class="h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-200"
        :class="expanded ? 'rotate-90' : ''"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="text-xs font-medium text-text-secondary flex-1">Activity</span>
      <span v-if="recentEntries.length > 0" class="text-[11px] text-text-muted tabular-nums">
        {{ recentEntries.length }}
      </span>
    </button>

    <div v-if="expanded" class="px-4 pb-3 max-h-[280px] overflow-y-auto">
      <div v-if="recentEntries.length === 0" class="py-4 text-center text-xs text-text-muted">
        No activity yet this session.
      </div>

      <ol v-else class="space-y-1">
        <li
          v-for="entry in recentEntries"
          :key="entry.id"
          class="group"
        >
          <button
            class="focus-ring w-full flex items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-secondary/50 transition-colors"
            @click="entry.detail ? toggleEntry(entry.id) : undefined"
          >
            <span
              class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              :class="categoryStyles[entry.category].dot"
            />
            <div class="min-w-0 flex-1">
              <p class="text-xs text-text-secondary truncate">{{ entry.summary }}</p>
              <div
                v-if="expandedEntryId === entry.id && entry.detail"
                class="mt-1 text-[11px] text-text-muted break-all"
              >
                {{ entry.detail }}
              </div>
            </div>
            <span class="text-[11px] text-text-muted tabular-nums whitespace-nowrap shrink-0">
              {{ formatTime(entry.timestamp) }}
            </span>
          </button>
        </li>
      </ol>

      <button
        v-if="recentEntries.length > 0"
        class="focus-ring mt-2 text-[11px] text-text-muted hover:text-text-secondary transition-colors rounded"
        @click="clearLog"
      >
        Clear history
      </button>
    </div>
  </div>
</template>
