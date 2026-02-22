<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useProjects } from "./composables/useProjects";
import { useEnvSets } from "./composables/useEnvSets";
import { analyzeRows } from "./composables/useAnalysis";
import AppShell from "./components/layout/AppShell.vue";
import SidebarPanel from "./components/layout/SidebarPanel.vue";
import KpiBar from "./components/kpi/KpiBar.vue";
import ProjectManagementCard from "./components/project/ProjectManagementCard.vue";
import ComparisonCard from "./components/comparison/ComparisonCard.vue";
import OnboardingGuide from "./components/help/OnboardingGuide.vue";
import ProjectSelector from "./components/project/ProjectSelector.vue";
import PageHeader from "./components/layout/PageHeader.vue";

const { projects, activeProjectId, activeProject, saveActiveProjectId } = useProjects();
const { currentSets } = useEnvSets();

const analysis = computed(() => analyzeRows(currentSets.value));
type AppPage = "dashboard" | "projects" | "help";
const PAGE_STORAGE_KEY = "edm.page.v1";

function loadPage(): AppPage {
  const stored = localStorage.getItem(PAGE_STORAGE_KEY);
  if (stored === "projects" || stored === "help") return stored;
  return "dashboard";
}

const page = ref<AppPage>(loadPage());

watch(page, (value) => {
  localStorage.setItem(PAGE_STORAGE_KEY, value);
});

function openPage(next: AppPage) {
  page.value = next;
}

function onSelectProject(id: string) {
  saveActiveProjectId(id);
  page.value = "dashboard";
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
        class="rounded-[var(--radius-md)] px-3 py-1.5 text-[13px] capitalize transition-colors"
        :class="page === navPage
          ? 'bg-accent-muted text-accent font-medium'
          : 'text-text-secondary hover:text-text-primary'"
        @click="openPage(navPage)"
      >
        {{ navPage === 'help' ? 'Help' : navPage === 'projects' ? 'Projects' : 'Dashboard' }}
      </button>
    </div>

    <div class="space-y-5">
      <template v-if="page === 'dashboard'">
        <PageHeader
          eyebrow="Overview"
          title="Dashboard"
          description="Compare environment drift, identify unsafe values, and apply targeted fixes for the active project."
        />
        <KpiBar :sets="currentSets" :analysis="analysis" />
        <ComparisonCard
          :sets="currentSets"
          :analysis="analysis"
          :filtered-rows="analysis"
        />
      </template>

      <template v-else-if="page === 'projects'">
        <PageHeader
          eyebrow="Configuration"
          title="Projects"
          description="Manage project records and choose which env sets Drift loads for analysis and safe write-back."
        />
        <ProjectManagementCard :sets="currentSets" />
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
  </AppShell>
</template>
