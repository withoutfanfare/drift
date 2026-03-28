import { ref, computed } from "vue";
import type { GitEnvStatus } from "../types";
import { checkEnvGitStatus } from "./useTauriCommands";
import { useProjects } from "./useProjects";

const gitStatuses = ref<GitEnvStatus[]>([]);
const gitCheckLoading = ref(false);

export function useGitTracking() {
  const { activeProject } = useProjects();

  const uncommittedFiles = computed(() =>
    gitStatuses.value.filter((s) => s.hasUncommittedChanges),
  );

  const uncommittedCount = computed(() => uncommittedFiles.value.length);

  const hasUncommittedChanges = computed(() => uncommittedCount.value > 0);

  async function checkGitStatus() {
    const project = activeProject.value;
    if (!project) {
      gitStatuses.value = [];
      return;
    }

    gitCheckLoading.value = true;
    try {
      gitStatuses.value = await checkEnvGitStatus(project.rootPath);
    } catch {
      gitStatuses.value = [];
    } finally {
      gitCheckLoading.value = false;
    }
  }

  function isFileUncommitted(filePath: string): boolean {
    return gitStatuses.value.some(
      (s) => s.filePath === filePath && s.hasUncommittedChanges,
    );
  }

  function isFileTracked(filePath: string): boolean {
    return gitStatuses.value.some((s) => s.filePath === filePath);
  }

  function getStatusForFile(filePath: string): GitEnvStatus | undefined {
    return gitStatuses.value.find((s) => s.filePath === filePath);
  }

  return {
    gitStatuses,
    gitCheckLoading,
    uncommittedFiles,
    uncommittedCount,
    hasUncommittedChanges,
    checkGitStatus,
    isFileUncommitted,
    isFileTracked,
    getStatusForFile,
  };
}
