<script setup lang="ts">
import { computed } from "vue";
import type { EnvSet, KeyAnalysisRow } from "../../types";
import { SCard } from "@stuntrocket/ui";

const props = defineProps<{
  sets: EnvSet[];
  analysis: KeyAnalysisRow[];
  activeProjectName?: string;
}>();

const hasProject = computed(() => Boolean(props.activeProjectName?.trim()));
const hasSets = computed(() => props.sets.length > 0);
const hasComparableSets = computed(() => props.sets.length >= 2);
const hasScannedSet = computed(() => props.sets.some((set) => Boolean(set.filePath)));

const steps = computed(() => [
  {
    title: "Create a project",
    description:
      "Go to the Projects page, give your project a name, and browse to its root folder. Drift stores this locally so you can switch between projects quickly.",
    complete: hasProject.value,
  },
  {
    title: "Load .env files",
    description:
      "Drift auto-scans your project folder when you save. You can also pick files manually or paste content directly.",
    complete: hasSets.value,
  },
  {
    title: "Compare environments",
    description:
      "With two or more files loaded, the Dashboard picks smart defaults \u2014 the file with the most keys as \u2018compare from\u2019, and your local file as \u2018compare to\u2019.",
    complete: hasComparableSets.value,
  },
  {
    title: "Review and fix",
    description:
      "Filter by missing, drift, or unsafe keys. Click any row to edit it, or patch all missing keys at once \u2014 Drift shows a diff preview before writing.",
    complete: hasComparableSets.value && hasScannedSet.value,
  },
]);

const completedSteps = computed(() => steps.value.filter((s) => s.complete).length);
const progressPercent = computed(
  () => Math.round((completedSteps.value / steps.value.length) * 100),
);

const features = [
  {
    icon: "compare",
    title: "Side-by-side comparison",
    description:
      "See every key across all loaded .env files in one table. Missing values, differing values, and unsafe defaults are flagged automatically.",
  },
  {
    icon: "filter",
    title: "Smart filtering",
    description:
      "Focus on what matters \u2014 filter by Missing, Drift, Unsafe, or Aligned. Search by key name to find specific variables.",
  },
  {
    icon: "edit",
    title: "Inline editing",
    description:
      "Click any table row to load it into the editor. Copy a value from one file, then update in Drift or write directly to disk.",
  },
  {
    icon: "diff",
    title: "Diff preview",
    description:
      "Before any file write, Drift shows exactly what will change \u2014 lines added and removed \u2014 so you can review before confirming.",
  },
  {
    icon: "mask",
    title: "Secret masking",
    description:
      "Sensitive values (passwords, tokens, API keys) are masked by default. Toggle globally in the titlebar, or click individual cells to reveal.",
  },
  {
    icon: "backup",
    title: "Automatic backups",
    description:
      "Every file write creates a timestamped .bak copy first. Browse all backups for your project on the Projects page.",
  },
  {
    icon: "activity",
    title: "Activity timeline",
    description:
      "Every action is logged \u2014 scans, edits, file writes, errors. Expand the timeline at the bottom of any page to review what happened.",
  },
  {
    icon: "scan",
    title: "Auto-scan on save",
    description:
      "When you save a project with a root path, Drift automatically scans for .env files. Hit the refresh icon on the Projects page to re-scan.",
  },
];

const safetyPoints = [
  "Drift runs entirely on your machine. No data leaves this app \u2014 there are no cloud services, APIs, or telemetry.",
  "File write-back is only available for scanned files with a real filesystem path. Pasted content stays in-memory.",
  "Before writing to any file, Drift creates a timestamped backup (e.g. .env.bak.1700000000).",
  "Patching missing keys only appends \u2014 it never overwrites existing values in your target file.",
  "Project data and .env content is stored in localStorage on this machine. Treat the workstation as sensitive.",
];
</script>

<template>
  <!-- Getting started -->
  <SCard variant="glass" class="p-5">
    <div class="flex items-center gap-3 mb-4">
      <div class="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-accent/15">
        <svg class="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <h2 class="text-[15px] font-semibold text-text-primary">Getting started</h2>
        <p class="text-xs text-text-secondary mt-0.5">{{ completedSteps }} of {{ steps.length }} steps complete</p>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="h-1 rounded-full bg-surface-2 mb-5">
      <div
        class="h-full rounded-full transition-all duration-500 ease-out"
        :class="progressPercent === 100 ? 'bg-success' : 'bg-accent'"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>

    <ol class="space-y-1">
      <li
        v-for="(step, index) in steps"
        :key="step.title"
        class="flex gap-3"
      >
        <!-- Step indicator -->
        <div class="flex flex-col items-center">
          <div
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
            :class="step.complete
              ? 'border-success bg-success/15 text-success'
              : 'border-surface-3 bg-surface-2/50 text-text-muted'"
          >
            <svg v-if="step.complete" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span v-else class="text-xs font-semibold">{{ index + 1 }}</span>
          </div>
          <div
            v-if="index < steps.length - 1"
            class="w-0.5 flex-1 my-1.5 rounded-full"
            :class="step.complete ? 'bg-success/30' : 'bg-surface-3/50'"
          />
        </div>

        <!-- Step content -->
        <div class="pb-4 min-w-0">
          <p
            class="text-sm font-medium"
            :class="step.complete ? 'text-text-secondary line-through decoration-text-muted/40' : 'text-text-primary'"
          >
            {{ step.title }}
          </p>
          <p class="text-xs text-text-muted mt-0.5 leading-relaxed">{{ step.description }}</p>
        </div>
      </li>
    </ol>
  </SCard>

  <!-- Features -->
  <SCard variant="glass" class="p-5">
    <div class="flex items-center gap-3 mb-5">
      <div class="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-accent/15">
        <svg class="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
          <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
          <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
          <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
        </svg>
      </div>
      <div>
        <h2 class="text-[15px] font-semibold text-text-primary">What Drift can do</h2>
        <p class="text-xs text-text-secondary mt-0.5">Everything you need to manage .env files across environments.</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
      <div
        v-for="feature in features"
        :key="feature.title"
        class="rounded-[var(--radius-lg)] border border-border-subtle bg-surface-2/25 p-3.5 transition-colors hover:border-border-default"
      >
        <div class="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] bg-surface-2/80 mb-2.5">
          <!-- Compare -->
          <svg v-if="feature.icon === 'compare'" class="h-3.5 w-3.5 text-text-secondary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="6" y1="20" x2="6" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <!-- Filter -->
          <svg v-else-if="feature.icon === 'filter'" class="h-3.5 w-3.5 text-text-secondary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <!-- Edit -->
          <svg v-else-if="feature.icon === 'edit'" class="h-3.5 w-3.5 text-text-secondary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <!-- Diff -->
          <svg v-else-if="feature.icon === 'diff'" class="h-3.5 w-3.5 text-text-secondary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <!-- Mask -->
          <svg v-else-if="feature.icon === 'mask'" class="h-3.5 w-3.5 text-text-secondary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <!-- Backup -->
          <svg v-else-if="feature.icon === 'backup'" class="h-3.5 w-3.5 text-text-secondary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <!-- Activity -->
          <svg v-else-if="feature.icon === 'activity'" class="h-3.5 w-3.5 text-text-secondary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <!-- Scan -->
          <svg v-else class="h-3.5 w-3.5 text-text-secondary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <h3 class="text-[13px] font-semibold text-text-primary">{{ feature.title }}</h3>
        <p class="text-xs text-text-muted mt-1 leading-relaxed">{{ feature.description }}</p>
      </div>
    </div>
  </SCard>

  <!-- Trust and safety -->
  <SCard variant="glass" class="p-5">
    <div class="flex items-center gap-3 mb-4">
      <div class="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-success/15">
        <svg class="h-4 w-4 text-success" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <h2 class="text-[15px] font-semibold text-text-primary">Trust and safety</h2>
        <p class="text-xs text-text-secondary mt-0.5">How Drift keeps your configuration safe.</p>
      </div>
    </div>

    <ul class="space-y-3">
      <li
        v-for="(point, i) in safetyPoints"
        :key="i"
        class="flex gap-2.5"
      >
        <svg class="h-4 w-4 shrink-0 text-success/60 mt-0.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p class="text-xs text-text-secondary leading-relaxed">{{ point }}</p>
      </li>
    </ul>
  </SCard>
</template>
