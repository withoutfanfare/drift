<script setup lang="ts">
import type { AppPage, ProjectProfile } from "../../types";
import { useEnvSets } from "../../composables/useEnvSets";
import { computed } from "vue";
import { SSidebar, SSidebarLink } from "@stuntrocket/ui";

const props = defineProps<{
  projects: ProjectProfile[];
  activeProjectId: string;
  page: AppPage;
}>();

const emit = defineEmits<{
  selectProject: [id: string];
  navigate: [page: AppPage];
  addProject: [];
}>();

const { envSets } = useEnvSets();

const setCountsByProject = computed(() => {
  const counts: Record<string, number> = {};
  for (const s of envSets.value) {
    counts[s.projectId] = (counts[s.projectId] ?? 0) + 1;
  }
  return counts;
});

function onProjectClick(project: ProjectProfile) {
  if (project.id === props.activeProjectId) {
    emit("navigate", "projects");
  } else {
    emit("selectProject", project.id);
  }
}
</script>

<template>
  <SSidebar width="220px" class="max-[1024px]:hidden">
    <template #header>
      <!-- Titlebar drag region -->
      <div class="h-7 w-full shrink-0" style="-webkit-app-region: drag;" />
    </template>

    <!-- Projects group -->
    <div class="px-3 pb-2" style="-webkit-app-region: no-drag;">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Projects
        </span>
        <button
          class="focus-ring text-text-muted hover:text-text-primary transition-colors p-0.5 -mr-0.5 rounded"
          title="Add project"
          @click="emit('addProject')"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <nav v-if="projects.length > 0" class="space-y-0.5" aria-label="Project list">
        <button
          v-for="project in projects"
          :key="project.id"
          class="focus-ring w-full rounded-[var(--radius-md)] px-2 py-1.5 text-left text-[13px] transition-colors flex items-center gap-2 group"
          :class="project.id === activeProjectId
            ? 'bg-accent-muted text-accent font-medium'
            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'"
          :aria-current="project.id === activeProjectId ? 'true' : undefined"
          @click="onProjectClick(project)"
        >
          <svg class="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3.5 6.5H9L10.8 8.5H20.5V18.5H3.5V6.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
          </svg>
          <span class="truncate flex-1">{{ project.name }}</span>
          <span
            class="text-[11px] tabular-nums"
            :class="project.id === activeProjectId ? 'text-accent/60' : 'text-text-muted'"
            :aria-label="(setCountsByProject[project.id] ?? 0) + ' .env files'"
          >
            {{ (setCountsByProject[project.id] ?? 0) > 0 ? setCountsByProject[project.id] : '\u00B7' }}
          </span>
        </button>
      </nav>
      <p v-else class="px-2 py-1.5 text-[13px] text-text-muted italic">
        No projects yet
      </p>
    </div>

    <!-- Divider -->
    <div class="mx-3 border-t border-border-subtle" />

    <!-- Navigation group -->
    <div class="px-3 pt-2" style="-webkit-app-region: no-drag;">
      <nav class="space-y-0.5" aria-label="Primary navigation">
        <SSidebarLink
          :active="page === 'dashboard'"
          @click="emit('navigate', 'dashboard')"
        >
          <svg class="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12L12 4L20 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M6.5 10.5V19H17.5V10.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Dashboard
        </SSidebarLink>
        <SSidebarLink
          :active="page === 'help'"
          @click="emit('navigate', 'help')"
        >
          <svg class="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8" />
            <path d="M9.7 9.5C9.9 8.5 10.8 7.8 11.9 7.8C13.2 7.8 14.2 8.7 14.2 9.9C14.2 10.8 13.7 11.3 12.9 11.8C12.1 12.2 11.7 12.7 11.7 13.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <circle cx="11.8" cy="16.4" r="1" fill="currentColor" />
          </svg>
          Help
        </SSidebarLink>
      </nav>
    </div>
  </SSidebar>
</template>
