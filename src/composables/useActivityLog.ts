import { ref, computed } from "vue";
import type { ActivityEntry, ActivityCategory } from "../types";

const MAX_ENTRIES = 200;
const STORAGE_KEY = "edm.activityLog.v1";

const entries = ref<ActivityEntry[]>(loadEntries());

function loadEntries(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useActivityLog() {
  function log(
    category: ActivityCategory,
    summary: string,
    detail?: string,
    projectId?: string,
  ) {
    const entry: ActivityEntry = {
      id: generateId(),
      timestamp: Date.now(),
      category,
      summary,
      detail,
      projectId,
    };

    entries.value.unshift(entry);

    if (entries.value.length > MAX_ENTRIES) {
      entries.value = entries.value.slice(0, MAX_ENTRIES);
    }

    persistEntries();
  }

  function clearLog() {
    entries.value = [];
    persistEntries();
  }

  const recentEntries = computed(() => entries.value.slice(0, 50));

  return { entries, recentEntries, log, clearLog };
}
