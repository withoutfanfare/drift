import { ref, computed } from "vue";
import type { ProjectProfile, PersistedProject } from "../types";

const PROJECT_STORAGE_KEY = "edm.projects.v1";
const ACTIVE_PROJECT_KEY = "edm.activeProject.v1";

function createDefaultProject(): ProjectProfile {
  return {
    id: crypto.randomUUID(),
    name: "Default Project",
    rootPath: "/Users/you/Code/laravel-app",
  };
}

function loadProjectsFromStorage(): ProjectProfile[] {
  const raw = localStorage.getItem(PROJECT_STORAGE_KEY);

  if (!raw) {
    const initial = [createDefaultProject()];
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedProject[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((p) => ({ id: p.id, name: p.name, rootPath: p.rootPath }));
    }
  } catch {
    // fall through
  }

  const fallback = [createDefaultProject()];
  localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(fallback));
  return fallback;
}

function loadActiveProjectIdFromStorage(knownProjects: ProjectProfile[]): string {
  const stored = localStorage.getItem(ACTIVE_PROJECT_KEY);
  if (stored && knownProjects.some((p) => p.id === stored)) {
    return stored;
  }
  return knownProjects[0].id;
}

const projects = ref<ProjectProfile[]>(loadProjectsFromStorage());
const activeProjectId = ref<string>(loadActiveProjectIdFromStorage(projects.value));

export function useProjects() {
  const activeProject = computed(() =>
    projects.value.find((p) => p.id === activeProjectId.value),
  );

  function persistProjects() {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects.value));
  }

  function saveActiveProjectId(id: string) {
    activeProjectId.value = id;
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  }

  function saveProject(name: string, rootPath: string): string | null {
    if (!name || !rootPath) return null;

    const existing = projects.value.find(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );

    if (existing) {
      existing.rootPath = rootPath;
      saveActiveProjectId(existing.id);
      persistProjects();
      return `Updated ${existing.name}.`;
    }

    const project: ProjectProfile = {
      id: crypto.randomUUID(),
      name,
      rootPath,
    };
    projects.value.push(project);
    saveActiveProjectId(project.id);
    persistProjects();
    return `Added ${project.name}.`;
  }

  function deleteProject(cleanupSets?: (projectId: string) => void): string | null {
    const index = projects.value.findIndex((p) => p.id === activeProjectId.value);
    if (index < 0) return null;

    const [removed] = projects.value.splice(index, 1);

    if (cleanupSets) {
      cleanupSets(removed.id);
    }

    if (projects.value.length === 0) {
      projects.value.push(createDefaultProject());
    }

    saveActiveProjectId(projects.value[0].id);
    persistProjects();
    return removed.name;
  }

  return {
    projects,
    activeProjectId,
    activeProject,
    saveProject,
    deleteProject,
    saveActiveProjectId,
    persistProjects,
  };
}
