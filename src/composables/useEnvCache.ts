import { ref } from "vue";
import type { EnvSet, FileMtimeEntry } from "../types";
import { getEnvFileMtimes, scanEnvFiles } from "./useTauriCommands";
import { useProjects } from "./useProjects";
import { useEnvSets } from "./useEnvSets";

interface CacheEntry {
  mtime: number;
  size: number;
  rawText: string;
  name: string;
}

const cache = ref<Map<string, CacheEntry>>(new Map());
const lastMtimeCheck = ref<Map<string, number>>(new Map());

export function useEnvCache() {
  const { activeProject } = useProjects();
  const { addOrReplaceSet } = useEnvSets();

  /**
   * Check if cached env data is still valid by comparing file mtimes.
   * Returns paths of files that have changed and need re-parsing.
   */
  async function getStaleFiles(): Promise<string[]> {
    const project = activeProject.value;
    if (!project) return [];

    try {
      const mtimes = await getEnvFileMtimes(project.rootPath);
      const staleFiles: string[] = [];

      for (const entry of mtimes) {
        const cached = cache.value.get(entry.path);
        if (!cached || cached.mtime !== entry.mtime || cached.size !== entry.size) {
          staleFiles.push(entry.path);
        }
      }

      return staleFiles;
    } catch {
      return [];
    }
  }

  /**
   * Refresh only the env files that have changed since the last load.
   * Returns the number of files that were refreshed.
   */
  async function refreshStaleFiles(): Promise<number> {
    const project = activeProject.value;
    if (!project) return 0;

    const staleFiles = await getStaleFiles();
    if (staleFiles.length === 0) return 0;

    try {
      const scanned = await scanEnvFiles(project.rootPath);
      let refreshed = 0;

      for (const file of scanned) {
        if (staleFiles.includes(file.path)) {
          // Update cache entry
          const mtimes = await getEnvFileMtimes(project.rootPath);
          const mtimeEntry = mtimes.find((m) => m.path === file.path);

          cache.value.set(file.path, {
            mtime: mtimeEntry?.mtime ?? 0,
            size: mtimeEntry?.size ?? 0,
            rawText: file.content,
            name: file.name,
          });

          // Update the env set
          addOrReplaceSet({
            projectId: project.id,
            name: file.name,
            source: "file",
            rawText: file.content,
            filePath: file.path,
          });

          refreshed++;
        }
      }

      return refreshed;
    } catch {
      return 0;
    }
  }

  /**
   * Load env files with caching. On first load for a project, scans all files.
   * On subsequent loads, only re-parses files whose mtime has changed.
   */
  async function loadWithCache(): Promise<{
    total: number;
    cached: number;
    refreshed: number;
  }> {
    const project = activeProject.value;
    if (!project) return { total: 0, cached: 0, refreshed: 0 };

    try {
      const mtimes = await getEnvFileMtimes(project.rootPath);
      const staleFiles: FileMtimeEntry[] = [];
      let cachedCount = 0;

      for (const entry of mtimes) {
        const cached = cache.value.get(entry.path);
        if (cached && cached.mtime === entry.mtime && cached.size === entry.size) {
          // Cache hit — use existing parsed data
          cachedCount++;
        } else {
          staleFiles.push(entry);
        }
      }

      if (staleFiles.length === 0) {
        return { total: mtimes.length, cached: cachedCount, refreshed: 0 };
      }

      // Only scan if we have stale files
      const scanned = await scanEnvFiles(project.rootPath);
      let refreshed = 0;

      for (const file of scanned) {
        const staleEntry = staleFiles.find((s) => s.path === file.path);
        if (staleEntry) {
          cache.value.set(file.path, {
            mtime: staleEntry.mtime,
            size: staleEntry.size,
            rawText: file.content,
            name: file.name,
          });

          addOrReplaceSet({
            projectId: project.id,
            name: file.name,
            source: "file",
            rawText: file.content,
            filePath: file.path,
          });

          refreshed++;
        }
      }

      return { total: mtimes.length, cached: cachedCount, refreshed };
    } catch {
      return { total: 0, cached: 0, refreshed: 0 };
    }
  }

  function clearCache() {
    cache.value.clear();
    lastMtimeCheck.value.clear();
  }

  function clearProjectCache(projectRoot: string) {
    for (const [path] of cache.value) {
      if (path.startsWith(projectRoot)) {
        cache.value.delete(path);
      }
    }
  }

  function getCacheSize(): number {
    return cache.value.size;
  }

  function invalidateFile(filePath: string) {
    cache.value.delete(filePath);
  }

  return {
    cache,
    getStaleFiles,
    refreshStaleFiles,
    loadWithCache,
    clearCache,
    clearProjectCache,
    getCacheSize,
    invalidateFile,
  };
}
