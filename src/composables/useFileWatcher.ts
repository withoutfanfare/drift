import { ref, watch, onUnmounted } from "vue";
import type { EnvSet, FileChangeEvent } from "../types";
import { invoke } from "@tauri-apps/api/core";

const POLL_INTERVAL_MS = 3000;
const DEBOUNCE_MS = 500;

interface WatchedFile {
  path: string;
  setId: string;
  setName: string;
  lastModified: number;
}

const pendingChanges = ref<FileChangeEvent[]>([]);
const watching = ref(false);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function useFileWatcher(options: {
  onFileChanged: (events: FileChangeEvent[]) => void;
}) {
  const watchedFiles = ref<WatchedFile[]>([]);

  function startWatching(sets: EnvSet[]) {
    // Collect file paths from sets that have disk paths
    const files: WatchedFile[] = sets
      .filter((s) => s.filePath)
      .map((s) => ({
        path: s.filePath!,
        setId: s.id,
        setName: s.name,
        lastModified: 0,
      }));

    watchedFiles.value = files;

    if (files.length === 0) {
      stopWatching();
      return;
    }

    // Initialise last modified timestamps
    checkFilesForChanges(true);

    // Start polling
    if (!pollTimer) {
      watching.value = true;
      pollTimer = setInterval(() => {
        checkFilesForChanges(false);
      }, POLL_INTERVAL_MS);
    }
  }

  function stopWatching() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    watching.value = false;
    watchedFiles.value = [];
    pendingChanges.value = [];
  }

  async function checkFilesForChanges(initialise: boolean) {
    const changes: FileChangeEvent[] = [];

    for (const file of watchedFiles.value) {
      try {
        const mtime = await invoke<number>("get_file_mtime", { filePath: file.path });

        if (initialise) {
          file.lastModified = mtime;
          continue;
        }

        if (mtime > file.lastModified) {
          file.lastModified = mtime;
          changes.push({ path: file.path, kind: "modified" });
        }
      } catch {
        // File may have been deleted or become inaccessible
        if (!initialise && file.lastModified > 0) {
          changes.push({ path: file.path, kind: "removed" });
          file.lastModified = 0;
        }
      }
    }

    if (changes.length > 0 && !initialise) {
      // Debounce rapid saves (e.g. editor auto-save)
      pendingChanges.value = [...pendingChanges.value, ...changes];

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const batch = [...pendingChanges.value];
        pendingChanges.value = [];
        options.onFileChanged(batch);
      }, DEBOUNCE_MS);
    }
  }

  function dismissChanges() {
    pendingChanges.value = [];
  }

  onUnmounted(() => {
    stopWatching();
  });

  return {
    watching,
    pendingChanges,
    startWatching,
    stopWatching,
    dismissChanges,
  };
}
