<script setup lang="ts">
import { computed } from "vue";
import type { ProjectProfile, EnvSet } from "../../types";
import { analyzeRows } from "../../composables/useAnalysis";
import { computeHealthScore } from "../../composables/useHealthScore";

const props = defineProps<{
  projects: ProjectProfile[];
  envSets: EnvSet[];
}>();

const emit = defineEmits<{
  selectProject: [id: string];
}>();

interface ProjectSummary {
  project: ProjectProfile;
  sets: EnvSet[];
  envFileCount: number;
  totalUniqueKeys: number;
  missingKeyCount: number;
  driftWarningCount: number;
  unsafeCount: number;
  lastModified: number | null;
  healthScore: number;
  healthGrade: string;
}

const summaries = computed<ProjectSummary[]>(() => {
  return props.projects.map((project) => {
    const sets = props.envSets.filter((s) => s.projectId === project.id);
    const analysis = analyzeRows(sets);
    const health = computeHealthScore(sets);

    const allKeys = new Set<string>();
    for (const set of sets) {
      for (const key of Object.keys(set.values)) {
        allKeys.add(key);
      }
    }

    const missingKeyCount = analysis.filter((r) => r.missingCount > 0).length;
    const driftWarningCount = analysis.filter((r) => r.drift).length;
    const unsafeCount = analysis.filter((r) => r.unsafe).length;

    return {
      project,
      sets,
      envFileCount: sets.length,
      totalUniqueKeys: allKeys.size,
      missingKeyCount,
      driftWarningCount,
      unsafeCount,
      lastModified: null,
      healthScore: health.total,
      healthGrade: health.grade,
    };
  });
});

const hasIssues = computed(() =>
  summaries.value.some((s) => s.missingKeyCount > 0 || s.driftWarningCount > 0 || s.unsafeCount > 0),
);

function gradeColour(grade: string): string {
  switch (grade) {
    case "A": return "text-emerald-400";
    case "B": return "text-sky-400";
    case "C": return "text-amber-400";
    case "D": return "text-orange-400";
    default: return "text-red-400";
  }
}

function gradeBackground(grade: string): string {
  switch (grade) {
    case "A": return "bg-emerald-400/10";
    case "B": return "bg-sky-400/10";
    case "C": return "bg-amber-400/10";
    case "D": return "bg-orange-400/10";
    default: return "bg-red-400/10";
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Aggregate stats bar -->
    <div class="card-glass flex divide-x divide-border/30 animate-scale-in">
      <div class="flex-1 flex items-center justify-center gap-2 py-2.5 px-3">
        <span class="text-[11px] text-text-tertiary">Projects</span>
        <strong class="text-base font-semibold tabular-nums text-text-primary">
          {{ projects.length }}
        </strong>
      </div>
      <div class="flex-1 flex items-center justify-center gap-2 py-2.5 px-3">
        <span class="text-[11px] text-text-tertiary">Env files</span>
        <strong class="text-base font-semibold tabular-nums text-text-primary">
          {{ envSets.length }}
        </strong>
      </div>
      <div class="flex-1 flex items-center justify-center gap-2 py-2.5 px-3">
        <span class="text-[11px] text-text-tertiary">Issues</span>
        <strong
          class="text-base font-semibold tabular-nums"
          :class="hasIssues ? 'text-warning' : 'text-text-primary'"
        >
          {{ summaries.reduce((n, s) => n + s.missingKeyCount + s.driftWarningCount + s.unsafeCount, 0) }}
        </strong>
      </div>
    </div>

    <!-- Project cards -->
    <div class="grid gap-3 sm:grid-cols-2">
      <button
        v-for="summary in summaries"
        :key="summary.project.id"
        class="card-glass p-4 text-left transition-all duration-150 hover:ring-1 hover:ring-accent/30 focus-visible:ring-2 focus-visible:ring-accent/40 outline-none rounded-[var(--radius-lg)] group"
        @click="emit('selectProject', summary.project.id)"
      >
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="min-w-0 flex-1">
            <h3 class="text-[14px] font-semibold text-text-primary truncate group-hover:text-accent transition-colors">
              {{ summary.project.name }}
            </h3>
            <p class="text-[11px] text-text-tertiary truncate mt-0.5">
              {{ summary.project.rootPath }}
            </p>
          </div>
          <!-- Health grade badge -->
          <div
            class="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg text-[16px] font-bold"
            :class="[gradeColour(summary.healthGrade), gradeBackground(summary.healthGrade)]"
            :title="`Health score: ${summary.healthScore}/100`"
          >
            {{ summary.healthGrade }}
          </div>
        </div>

        <!-- Metrics row -->
        <div class="flex items-center gap-3 text-[11px]">
          <span class="text-text-tertiary">
            <strong class="text-text-secondary tabular-nums">{{ summary.envFileCount }}</strong> files
          </span>
          <span class="text-text-tertiary">
            <strong class="text-text-secondary tabular-nums">{{ summary.totalUniqueKeys }}</strong> keys
          </span>
          <span v-if="summary.missingKeyCount > 0" class="text-amber-400">
            <strong class="tabular-nums">{{ summary.missingKeyCount }}</strong> missing
          </span>
          <span v-if="summary.driftWarningCount > 0" class="text-amber-400">
            <strong class="tabular-nums">{{ summary.driftWarningCount }}</strong> drift
          </span>
          <span v-if="summary.unsafeCount > 0" class="text-red-400">
            <strong class="tabular-nums">{{ summary.unsafeCount }}</strong> unsafe
          </span>
          <span
            v-if="summary.missingKeyCount === 0 && summary.driftWarningCount === 0 && summary.unsafeCount === 0 && summary.envFileCount > 1"
            class="text-emerald-400"
          >
            All aligned
          </span>
          <span
            v-if="summary.envFileCount === 0"
            class="text-text-tertiary italic"
          >
            No env files loaded
          </span>
        </div>
      </button>
    </div>

    <!-- Empty state -->
    <div
      v-if="projects.length === 0"
      class="card-glass p-6 text-center text-[13px] text-text-tertiary"
    >
      No projects registered yet.
    </div>
  </div>
</template>
