import { ref, computed } from "vue";
import type { EnvSet, EnvRole, EnvSource, PersistedSet, ProjectProfile } from "../types";
import { parseEnv, validateEnvSyntax } from "./useEnvParser";
import { detectRole, roleSort } from "./useRoles";
import { useProjects } from "./useProjects";

const SET_STORAGE_KEY = "edm.envSets.v1";

function loadSetsFromStorage(
  knownProjects: ProjectProfile[],
): EnvSet[] {
  const raw = localStorage.getItem(SET_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as PersistedSet[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        // Skip sets whose project no longer exists
        const projectExists = entry.projectId &&
          knownProjects.some((p) => p.id === entry.projectId);
        if (!projectExists) return null;

        const env = parseEnv(entry.rawText);

        return {
          id: entry.id,
          projectId: entry.projectId,
          name: entry.name,
          role: entry.role ?? detectRole(entry.name, env.values),
          source: entry.source,
          rawText: entry.rawText,
          filePath: entry.filePath,
          values: env.values,
          duplicates: env.duplicates,
          comments: env.comments,
          validationWarnings: validateEnvSyntax(entry.rawText),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  } catch {
    return [];
  }
}

const { projects, activeProjectId } = useProjects();
const envSets = ref<EnvSet[]>(
  loadSetsFromStorage(projects.value),
);

export function useEnvSets() {
  const currentSets = computed(() =>
    envSets.value
      .filter((s) => s.projectId === activeProjectId.value)
      .sort(
        (a, b) =>
          roleSort(a.role) - roleSort(b.role) || a.name.localeCompare(b.name),
      ),
  );

  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  function persistSets() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const payload: PersistedSet[] = envSets.value.map((s) => ({
        id: s.id,
        projectId: s.projectId,
        name: s.name,
        role: s.role,
        source: s.source,
        rawText: s.rawText,
        filePath: s.filePath,
      }));
      try {
        localStorage.setItem(SET_STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.error("Failed to persist env sets — storage may be full:", e);
      }
    }, 300);
  }

  function addOrReplaceSet(input: {
    projectId: string;
    name: string;
    source: EnvSource;
    rawText: string;
    role?: EnvRole;
    filePath?: string;
  }) {
    const { values, duplicates, comments } = parseEnv(input.rawText);
    const role = input.role ?? detectRole(input.name, values);
    const validationWarnings = validateEnvSyntax(input.rawText);

    const existing = input.filePath
      ? envSets.value.find(
          (s) => s.projectId === input.projectId && s.filePath === input.filePath,
        )
      : envSets.value.find(
          (s) =>
            s.projectId === input.projectId &&
            !s.filePath &&
            s.name === input.name,
        );

    if (existing) {
      const index = envSets.value.indexOf(existing);
      if (index !== -1) {
        envSets.value[index] = {
          ...existing,
          name: input.name,
          source: input.source,
          rawText: input.rawText,
          filePath: input.filePath,
          values,
          duplicates,
          comments,
          validationWarnings,
          role,
        };
      }
      persistSets();
      return;
    }

    envSets.value.push({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      name: input.name,
      source: input.source,
      rawText: input.rawText,
      filePath: input.filePath,
      values,
      duplicates,
      comments,
      validationWarnings,
      role,
    });
    persistSets();
  }

  function removeSet(setId: string) {
    const index = envSets.value.findIndex((s) => s.id === setId);
    if (index !== -1) {
      envSets.value.splice(index, 1);
      persistSets();
    }
  }

  function clearProjectSets(projectId: string) {
    for (let i = envSets.value.length - 1; i >= 0; i -= 1) {
      if (envSets.value[i].projectId === projectId) {
        envSets.value.splice(i, 1);
      }
    }
    persistSets();
  }

  function applyRawToSet(set: EnvSet, rawText: string) {
    const index = envSets.value.findIndex((s) => s.id === set.id);
    if (index === -1) return;
    const parsed = parseEnv(rawText);
    envSets.value.splice(index, 1, {
      ...envSets.value[index],
      rawText,
      values: parsed.values,
      duplicates: parsed.duplicates,
      comments: parsed.comments,
      validationWarnings: validateEnvSyntax(rawText),
    });
    persistSets();
  }

  return {
    envSets,
    currentSets,
    persistSets,
    addOrReplaceSet,
    removeSet,
    clearProjectSets,
    applyRawToSet,
  };
}
