<script setup lang="ts">
import { computed, ref } from "vue";
import type { EnvSet, KeyAnalysisRow } from "../../types";
import GlassCard from "../ui/GlassCard.vue";
import BaseButton from "../ui/BaseButton.vue";

const props = withDefaults(defineProps<{
  sets: EnvSet[];
  analysis: KeyAnalysisRow[];
  activeProjectName?: string;
  compact?: boolean;
}>(), {
  compact: false,
});

const expanded = ref(!props.compact);

const hasProject = computed(() => Boolean(props.activeProjectName?.trim()));
const hasSets = computed(() => props.sets.length > 0);
const hasComparableSets = computed(() => props.sets.length >= 2);
const hasScannedSet = computed(() => props.sets.some((set) => Boolean(set.filePath)));

const roleCoverage = computed(() => ({
  local: props.sets.some((set) => set.role === "local"),
  staging: props.sets.some((set) => set.role === "staging"),
  live: props.sets.some((set) => set.role === "live"),
}));

const missingCount = computed(() =>
  props.analysis.filter((row) => row.missingCount > 0).length,
);
const driftCount = computed(() => props.analysis.filter((row) => row.drift).length);
const unsafeCount = computed(() => props.analysis.filter((row) => row.unsafe).length);

const hasCoverage = computed(
  () => roleCoverage.value.local && roleCoverage.value.staging && roleCoverage.value.live,
);

const completedSteps = computed(() => quickSteps.value.filter((s) => s.complete).length);
const allComplete = computed(() => completedSteps.value === quickSteps.value.length);

const nextAction = computed(() => {
  if (!hasProject.value) {
    return "Create or select your first project.";
  }

  if (!hasSets.value) {
    return "Load .env sets into this project.";
  }

  if (!hasComparableSets.value) {
    return "Load at least one more set so Drift can compare.";
  }

  if (!hasCoverage.value) {
    return "Add missing local/staging/live coverage.";
  }

  if (missingCount.value > 0) {
    return "Use Missing filter, then patch or review missing keys.";
  }

  if (unsafeCount.value > 0) {
    return "Resolve unsafe flags before deployment.";
  }

  if (driftCount.value > 0) {
    return "Review remaining drift and confirm intentional differences.";
  }

  return "Export templates and keep this project snapshot for future checks.";
});

const quickSteps = computed(() => [
  {
    title: "Set your active project",
    detail:
      "In Project + Env Set Management, enter Project name, browse for a project folder (or paste a path), then select Save project.",
    complete: hasProject.value,
  },
  {
    title: "Load env sets",
    detail:
      "Use Scan folder for .env* (recommended for safe write-back), or load files manually if you only need read-only comparison.",
    complete: hasSets.value,
  },
  {
    title: "Confirm starter coverage",
    detail:
      "Aim to load local, staging, and live roles. Use Create starter templates to generate missing starter sets.",
    complete: hasCoverage.value,
  },
  {
    title: "Compare and triage",
    detail:
      "Set a reference and target, then filter rows by Missing, Drift, and Unsafe to focus your review.",
    complete: hasComparableSets.value,
  },
  {
    title: "Apply changes safely",
    detail:
      "Patch missing keys appends only. Apply to target file writes to disk with a backup. Apply in-app edits only the in-memory copy.",
    complete: hasScannedSet.value,
  },
]);

function stepBadgeClass(complete: boolean): string {
  return complete
    ? "border-success/30 bg-success/15 text-success"
    : "border-warning/30 bg-warning/15 text-warning";
}

function coverageClass(present: boolean): string {
  return present
    ? "border-success/30 bg-success/15 text-success"
    : "border-danger/30 bg-danger/15 text-danger";
}
</script>

<template>
  <GlassCard>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-[17px] font-semibold text-text-primary">Start here: guided onboarding</h2>
        <p class="text-sm text-text-secondary mt-1">
          Work through this checklist in order. Drift is built for configuration safety, not speed at any cost.
        </p>
      </div>

      <div class="min-w-[220px] max-w-[360px] flex-1">
        <div class="flex items-center justify-between gap-2">
          <span
            class="inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-semibold"
            :class="allComplete
              ? 'border-success/35 bg-success/15 text-success'
              : 'border-warning/35 bg-warning/15 text-warning'"
          >
            {{ allComplete ? 'All steps complete' : `${completedSteps} of ${quickSteps.length} complete` }}
          </span>
          <BaseButton
            variant="ghost"
            size="sm"
            @click="expanded = !expanded"
          >
            {{ expanded ? "Hide guide" : "Show guide" }}
          </BaseButton>
        </div>
        <p class="text-xs text-text-secondary mt-2">
          Next action: {{ nextAction }}
        </p>
      </div>
    </div>

    <div v-if="expanded" class="mt-4 space-y-4">
      <div
        :class="props.compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-[1.3fr_1fr] gap-4 max-[1120px]:grid-cols-1'"
      >
        <section class="rounded-[var(--radius-lg)] border border-border-default bg-surface-1/65 p-4">
          <h3 class="text-sm font-semibold text-text-primary">Recommended workflow</h3>
          <ol class="mt-3 space-y-3">
            <li
              v-for="(step, index) in quickSteps"
              :key="step.title"
              class="rounded-[var(--radius-md)] border border-border-subtle bg-surface-2/40 p-3"
            >
              <div class="flex flex-wrap items-start gap-2">
                <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
                  {{ index + 1 }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="text-sm font-semibold text-text-primary">{{ step.title }}</p>
                    <span
                      class="inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-semibold"
                      :class="stepBadgeClass(step.complete)"
                    >
                      {{ step.complete ? "Complete" : "Pending" }}
                    </span>
                  </div>
                  <p class="text-xs text-text-secondary mt-1">{{ step.detail }}</p>
                </div>
              </div>
            </li>
          </ol>
        </section>

        <section class="space-y-3">
          <div class="rounded-[var(--radius-lg)] border border-border-default bg-surface-1/65 p-4">
            <h3 class="text-sm font-semibold text-text-primary">Trust and safety boundaries</h3>
            <ul class="mt-2 space-y-1.5 text-xs text-text-secondary">
              <li>Drift runs locally in this Tauri app. It does not sync your env data to cloud services.</li>
              <li>Write-back actions are available only for scanned files that include a real filesystem path.</li>
              <li>Before file writes, Drift creates timestamped backups such as <code class="font-mono text-text-primary">.env.bak.1700000000</code>.</li>
              <li>Patch missing keys appends only; it does not overwrite existing target keys.</li>
              <li>Project and set data is stored in localStorage on this machine, including env values. Treat the workstation as sensitive.</li>
            </ul>
          </div>

          <div class="rounded-[var(--radius-lg)] border border-border-default bg-surface-1/65 p-4">
            <h3 class="text-sm font-semibold text-text-primary">Coverage and health snapshot</h3>
            <div class="mt-2 flex flex-wrap gap-2">
              <span class="inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-semibold" :class="coverageClass(roleCoverage.local)">
                local {{ roleCoverage.local ? "present" : "missing" }}
              </span>
              <span class="inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-semibold" :class="coverageClass(roleCoverage.staging)">
                staging {{ roleCoverage.staging ? "present" : "missing" }}
              </span>
              <span class="inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-semibold" :class="coverageClass(roleCoverage.live)">
                live {{ roleCoverage.live ? "present" : "missing" }}
              </span>
            </div>
            <div class="mt-3 text-xs text-text-secondary space-y-1">
              <p>Missing keys: <span class="text-text-primary font-semibold">{{ missingCount }}</span></p>
              <p>Drift keys: <span class="text-text-primary font-semibold">{{ driftCount }}</span></p>
              <p>Unsafe flags: <span class="text-text-primary font-semibold">{{ unsafeCount }}</span></p>
            </div>
          </div>
        </section>
      </div>

      <div :class="props.compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-4 max-[1120px]:grid-cols-1'">
        <details
          class="rounded-[var(--radius-lg)] border border-border-default bg-surface-1/65 p-4 open:border-border-accent"
          :open="!props.compact"
        >
          <summary class="cursor-pointer text-sm font-semibold text-text-primary">
            Control map: project and set management
          </summary>
          <ul class="mt-3 space-y-1.5 text-xs text-text-secondary">
            <li><code class="font-mono text-text-primary">Active project</code>: Switches project context for all loaded sets and comparisons.</li>
            <li><code class="font-mono text-text-primary">Save project</code>: Creates or updates a named project profile with root path.</li>
            <li><code class="font-mono text-text-primary">Remove project from Drift</code>: Removes the saved project profile and linked loaded sets in Drift only (does not delete your project folder).</li>
            <li><code class="font-mono text-text-primary">Scan folder for .env*</code>: Imports env files recursively and enables file write-back.</li>
            <li><code class="font-mono text-text-primary">Create starter templates</code>: Adds missing local/staging/live starter sets.</li>
            <li><code class="font-mono text-text-primary">Load .env files</code>: Imports files from picker for comparison.</li>
            <li><code class="font-mono text-text-primary">Load sample trio</code>: Loads demo local/staging/live data for evaluation.</li>
            <li><code class="font-mono text-text-primary">Clear loaded sets (Drift only)</code>: Removes loaded sets from the current project in Drift only (does not delete .env files).</li>
            <li><code class="font-mono text-text-primary">Manual set entry</code>: Adds a set by pasted text and selected role.</li>
            <li><code class="font-mono text-text-primary">Sets list</code>: Shows role, source, key count, duplicate keys, and remove action.</li>
          </ul>
        </details>

        <details
          class="rounded-[var(--radius-lg)] border border-border-default bg-surface-1/65 p-4 open:border-border-accent"
          :open="!props.compact"
        >
          <summary class="cursor-pointer text-sm font-semibold text-text-primary">
            Control map: comparison and write-back
          </summary>
          <ul class="mt-3 space-y-1.5 text-xs text-text-secondary">
            <li><code class="font-mono text-text-primary">Filter rows</code>: Focuses table by All, Missing, Drift, Unsafe, or Aligned.</li>
            <li><code class="font-mono text-text-primary">Search key</code>: Narrows results by env key prefix or fragment.</li>
            <li><code class="font-mono text-text-primary">Reference set</code>: Source of truth used for missing-key templates.</li>
            <li><code class="font-mono text-text-primary">Target set</code>: Set receiving copied, patched, or edited values.</li>
            <li><code class="font-mono text-text-primary">Copy missing-key template</code>: Copies only keys absent from target.</li>
            <li><code class="font-mono text-text-primary">Copy merged template</code>: Copies one combined template with conflict comments.</li>
            <li><code class="font-mono text-text-primary">Patch missing keys to target</code>: Appends missing keys to target file and preserves existing values.</li>
            <li><code class="font-mono text-text-primary">Inline drift editor</code>: Select key, source, and target for one-key updates.</li>
            <li><code class="font-mono text-text-primary">Apply to target (in-app)</code>: Updates Drift state only, then persists locally.</li>
            <li><code class="font-mono text-text-primary">Apply to target file</code>: Writes to disk and returns backup path in status message.</li>
            <li><code class="font-mono text-text-primary">Warnings + coverage</code>: Highlights risky defaults, missing coverage, and duplicate declarations.</li>
          </ul>
        </details>
      </div>
    </div>
  </GlassCard>
</template>
