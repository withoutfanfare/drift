import { ref, computed } from "vue";
import { detectUnusedEnvKeys } from "./useTauriCommands";
import { useProjects } from "./useProjects";

const unusedKeys = ref<Set<string>>(new Set());
const scanning = ref(false);
const lastScanTime = ref<number | null>(null);

export function useUnusedDetection() {
  const { activeProject } = useProjects();

  const unusedCount = computed(() => unusedKeys.value.size);

  async function scanForUnused(keys: string[]) {
    if (!activeProject.value?.rootPath || keys.length === 0) return;

    scanning.value = true;
    try {
      const results = await detectUnusedEnvKeys(activeProject.value.rootPath, keys);
      const unused = new Set<string>();
      for (const r of results) {
        if (!r.referenced) {
          unused.add(r.key);
        }
      }
      unusedKeys.value = unused;
      lastScanTime.value = Date.now();
    } catch (e) {
      console.error("Unused detection scan failed:", e);
    } finally {
      scanning.value = false;
    }
  }

  function isUnused(key: string): boolean {
    return unusedKeys.value.has(key);
  }

  function clearResults() {
    unusedKeys.value = new Set();
    lastScanTime.value = null;
  }

  return {
    unusedKeys,
    unusedCount,
    scanning,
    lastScanTime,
    scanForUnused,
    isUnused,
    clearResults,
  };
}
