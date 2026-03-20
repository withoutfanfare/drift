import { ref } from "vue";
import type { ChangeHistoryEntry } from "../types";

const STORAGE_KEY = "edm.changeHistory.v1";
const MAX_ENTRIES_PER_KEY = 20;
const MAX_TOTAL_ENTRIES = 2000;

function loadHistory(): ChangeHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const history = ref<ChangeHistoryEntry[]>(loadHistory());

function persistHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.value));
  } catch (e) {
    console.error("Failed to persist change history — storage may be full:", e);
    // Trim and retry
    if (history.value.length > 500) {
      history.value = history.value.slice(0, 500);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.value));
      } catch {
        // Give up silently
      }
    }
  }
}

export function useChangeHistory() {
  function recordChange(
    key: string,
    previousValue: string | undefined,
    newValue: string,
    envFilePath: string,
    envSetName: string,
  ) {
    const entry: ChangeHistoryEntry = {
      key,
      previousValue,
      newValue,
      timestamp: Date.now(),
      envFilePath,
      envSetName,
    };

    history.value.unshift(entry);

    // Enforce per-key limit
    const keyEntries = history.value.filter(
      (e) => e.key === key && e.envFilePath === envFilePath,
    );
    if (keyEntries.length > MAX_ENTRIES_PER_KEY) {
      const toRemove = keyEntries.slice(MAX_ENTRIES_PER_KEY);
      history.value = history.value.filter((e) => !toRemove.includes(e));
    }

    // Enforce total limit
    if (history.value.length > MAX_TOTAL_ENTRIES) {
      history.value = history.value.slice(0, MAX_TOTAL_ENTRIES);
    }

    persistHistory();
  }

  function getKeyHistory(key: string, envFilePath?: string): ChangeHistoryEntry[] {
    return history.value.filter(
      (e) => e.key === key && (!envFilePath || e.envFilePath === envFilePath),
    );
  }

  function formatRelativeTime(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  function clearHistory() {
    history.value = [];
    persistHistory();
  }

  return {
    history,
    recordChange,
    getKeyHistory,
    formatRelativeTime,
    clearHistory,
  };
}
