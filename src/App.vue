<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AppPage, FileChangeEvent } from "./types";
import { useProjects } from "./composables/useProjects";
import { useEnvSets } from "./composables/useEnvSets";
import { analyzeRows } from "./composables/useAnalysis";
import { useFileWatcher } from "./composables/useFileWatcher";
import { useStatus } from "./composables/useStatus";
import { useActivityLog } from "./composables/useActivityLog";
import { scanEnvFiles } from "./composables/useTauriCommands";
import AppShell from "./components/layout/AppShell.vue";
import SidebarPanel from "./components/layout/SidebarPanel.vue";
import KpiBar from "./components/kpi/KpiBar.vue";
import ProjectManagementCard from "./components/project/ProjectManagementCard.vue";
import ComparisonCard from "./components/comparison/ComparisonCard.vue";
import OnboardingGuide from "./components/help/OnboardingGuide.vue";
import ProjectSelector from "./components/project/ProjectSelector.vue";
import PageHeader from "./components/layout/PageHeader.vue";
import ActivityTimeline from "./components/layout/ActivityTimeline.vue";
import EmptyState from "./components/layout/EmptyState.vue";
import FileChangeToast from "./components/layout/FileChangeToast.vue";
import { SButton } from "@stuntrocket/ui";
import BackupBrowser from "./components/project/BackupBrowser.vue";

const { projects, activeProjectId, activeProject, saveActiveProjectId } = useProjects();
const { currentSets, addOrReplaceSet } = useEnvSets();
const { setStatus } = useStatus();
const { log } = useActivityLog();

const analysis = computed(() => analyzeRows(currentSets.value));
const PAGE_STORAGE_KEY = "edm.page.v1";

const fileChangeEvents = ref<FileChangeEvent[]>([]);

// File watcher for auto-reload
const { startWatching, stopWatching, pendingChanges, dismissChanges } = useFileWatcher({
  onFileChanged(events: FileChangeEvent[]) {
    fileChangeEvents.value = events;
  },
});

// Start watching when sets change
watch(
  currentSets,
  (sets) => {
    if (sets.length > 0) {
      startWatching(sets);
    } else {
      stopWatching();
    }
  },
  { immediate: true },
);

async function reloadChangedFiles() {
  const events = fileChangeEvents.value;
  fileChangeEvents.value = [];
  dismissChanges();

  if (!activeProject.value) return;

  try {
    const scanned = await scanEnvFiles(activeProject.value.rootPath);
    for (const file of scanned) {
      const changedEvent = events.find((e) => e.path === file.path);
      if (changedEvent) {
        addOrReplaceSet({
          projectId: activeProject.value!.id,
          name: file.name,
          source: "scan",
          rawText: file.content,
          filePath: file.path,
        });
      }
    }
    const reloadedCount = events.filter((e) => e.kind === "modified").length;
    setStatus(`Reloaded ${reloadedCount} changed .env file${reloadedCount !== 1 ? "s" : ""}.`);
    log("info", `Reloaded ${reloadedCount} changed .env files`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Reload failed: ${message}`);
  }
}

function dismissFileChanges() {
  fileChangeEvents.value = [];
  dismissChanges();
}

function loadPage(): AppPage {
  const stored = localStorage.getItem(PAGE_STORAGE_KEY);
  if (stored === "projects" || stored === "help") return stored;
  return "dashboard";
}

const page = ref<AppPage>(loadPage());
const creatingProject = ref(false);

function openPage(next: AppPage) {
  page.value = next;
  localStorage.setItem(PAGE_STORAGE_KEY, next);
  if (next !== "projects") creatingProject.value = false;
}

function onAddProject() {
  creatingProject.value = true;
  page.value = "projects";
  localStorage.setItem(PAGE_STORAGE_KEY, "projects");
}

function onSelectProject(id: string) {
  saveActiveProjectId(id);
  page.value = "dashboard";
  localStorage.setItem(PAGE_STORAGE_KEY, "dashboard");
}

function onProjectChange(id: string) {
  saveActiveProjectId(id);
}
</script>

<template>
  <AppShell>
    <template #sidebar>
      <SidebarPanel
        :projects="projects"
        :active-project-id="activeProjectId"
        :page="page"
        @select-project="onSelectProject"
        @navigate="openPage"
        @add-project="onAddProject"
      />
    </template>

    <!-- Mobile project selector (hidden on desktop) -->
    <div class="hidden max-[1024px]:block mb-4">
      <ProjectSelector
        v-model="activeProjectId"
        :projects="projects"
        @update:model-value="onProjectChange"
      />
    </div>

    <!-- Mobile navigation (hidden on desktop) -->
    <div class="hidden max-[1024px]:flex gap-2 mb-4">
      <button
        v-for="navPage in (['dashboard', 'projects', 'help'] as AppPage[])"
        :key="navPage"
        class="focus-ring rounded-[var(--radius-md)] px-3 py-1.5 text-[13px] capitalize transition-colors"
        :class="page === navPage
          ? 'bg-accent-muted text-accent font-medium'
          : 'text-text-secondary hover:text-text-primary'"
        :aria-current="page === navPage ? 'page' : undefined"
        @click="openPage(navPage)"
      >
        {{ navPage === 'help' ? 'Help' : navPage === 'projects' ? 'Projects' : 'Dashboard' }}
      </button>
    </div>

    <!-- File change toast notification -->
    <FileChangeToast
      v-if="fileChangeEvents.length > 0"
      :events="fileChangeEvents"
      @reload="reloadChangedFiles"
      @dismiss="dismissFileChanges"
    />

    <div class="space-y-4">
      <template v-if="page === 'dashboard'">
        <!-- Empty state: no project -->
        <EmptyState
          v-if="!activeProject"
          heading="Pick a Laravel project to get started"
          description="Browse to your project folder — Drift will scan for .env files and show you what's missing, what's different, and what's unsafe across environments."
        >
          <SButton variant="primary" @click="openPage('projects')">
            Set up a project
          </SButton>
        </EmptyState>

        <!-- Empty state: project but no sets -->
        <EmptyState
          v-else-if="currentSets.length === 0"
          :heading="`No .env files loaded for ${activeProject.name}`"
          description="Drift found your project but hasn't loaded any .env files yet."
        >
          <SButton variant="primary" @click="openPage('projects')">
            Load .env files
          </SButton>
        </EmptyState>

        <!-- Empty state: only one set -->
        <EmptyState
          v-else-if="currentSets.length === 1"
          heading="Add another .env file to start comparing"
          description="Drift needs at least two .env files to detect drift. Load your staging or production .env to see what's missing."
        >
          <SButton variant="primary" @click="openPage('projects')">
            Load another file
          </SButton>
        </EmptyState>

        <!-- Normal dashboard -->
        <template v-else>
          <KpiBar :sets="currentSets" :analysis="analysis" />
          <ComparisonCard
            :sets="currentSets"
            :analysis="analysis"
          />
        </template>
      </template>

      <template v-else-if="page === 'projects'">
        <PageHeader
          v-if="!creatingProject"
          eyebrow="Configuration"
          title="Projects"
          description="Manage project records and choose which env sets Drift loads for analysis and safe write-back."
        />
        <ProjectManagementCard :sets="currentSets" :creating="creatingProject" @done-creating="creatingProject = false" />
        <BackupBrowser v-if="!creatingProject" />
      </template>

      <template v-else>
        <PageHeader
          eyebrow="Guidance"
          title="Help and safety"
          description="Learn the recommended workflow and safeguards so you can change configuration with confidence."
        />
        <OnboardingGuide
          :sets="currentSets"
          :analysis="analysis"
          :active-project-name="activeProject?.name"
        />
      </template>
    </div>

    <ActivityTimeline />
  </AppShell>
</template>
