<script setup lang="ts">
import { ref, watch } from "vue";
import type { EnvSet, KeyAnalysisRow, DriftWarning, VariableGroup } from "../../types";
import ComparisonTableRow from "./ComparisonTableRow.vue";

const props = defineProps<{
  rows: KeyAnalysisRow[];
  sets: EnvSet[];
  referenceSetId: string;
  sessionEdits: Map<string, string | undefined>;
  groupingEnabled: boolean;
  groups: VariableGroup[];
  driftWarnings: DriftWarning[];
  focusedRowIndex: number;
}>();

const emit = defineEmits<{
  applyMemory: [targetSetId: string, key: string, value: string];
  applyFile: [targetSetId: string, key: string, value: string];
  revertMemory: [targetSetId: string, key: string];
  copyValue: [value: string];
  copyToEnv: [targetSetId: string, key: string, value: string];
  "update:focusedRowIndex": [index: number];
}>();

const expandedKey = ref<string | null>(null);
const collapsedGroups = ref<Set<string>>(new Set());

// Collapse expanded row when visible keys change (filter/search), not on value mutations
watch(
  () => props.rows.map((r) => r.key).join("\0"),
  () => { expandedKey.value = null; },
);

// Expand the focused row when Enter is pressed (via focusedRowIndex)
watch(
  () => props.focusedRowIndex,
  (index) => {
    if (index >= 0 && index < props.rows.length) {
      // Auto-expand on focus change only if explicitly triggered
    }
  },
);

function onToggle(key: string) {
  expandedKey.value = expandedKey.value === key ? null : key;
}

function toggleGroup(prefix: string) {
  const next = new Set(collapsedGroups.value);
  if (next.has(prefix)) {
    next.delete(prefix);
  } else {
    next.add(prefix);
  }
  collapsedGroups.value = next;
}

function isGroupCollapsed(prefix: string): boolean {
  return collapsedGroups.value.has(prefix);
}

function getRowsForGroup(group: VariableGroup): KeyAnalysisRow[] {
  const keySet = new Set(group.keys);
  return props.rows.filter((r) => keySet.has(r.key));
}

function getWarningsForKey(key: string): DriftWarning[] {
  return props.driftWarnings.filter((w) => w.key === key);
}
</script>

<template>
  <div class="mt-4 max-h-[60vh] overflow-auto rounded-[var(--radius-lg)] border border-border/60">
    <table class="w-full min-w-[760px] text-sm border-collapse">
      <thead>
        <tr class="bg-surface-secondary/80 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
          <th class="px-3 py-2 text-left text-xs font-medium text-text-tertiary">Key</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-text-tertiary">Status</th>
          <th
            v-for="set in sets"
            :key="set.id"
            class="px-3 py-2 text-left text-xs font-medium text-text-tertiary"
          >
            {{ set.name }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border/30">
        <!-- Grouped view -->
        <template v-if="groupingEnabled">
          <template v-for="group in groups" :key="group.prefix">
            <!-- Group header row -->
            <tr
              class="bg-surface-secondary/20 cursor-pointer hover:bg-surface-secondary/35 transition-colors"
              @click="toggleGroup(group.prefix)"
            >
              <td :colspan="2 + sets.length" class="px-3 py-1.5">
                <div class="flex items-center gap-2">
                  <svg
                    class="h-3 w-3 shrink-0 text-text-muted transition-transform duration-150"
                    :class="{ 'rotate-90': !isGroupCollapsed(group.prefix) }"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span class="text-xs font-semibold text-text-secondary">{{ group.label }}</span>
                  <span class="text-[11px] text-text-muted">{{ group.keys.length }} {{ group.keys.length === 1 ? 'variable' : 'variables' }}</span>
                  <span
                    v-if="group.driftCount > 0"
                    class="text-[11px] font-medium text-warning"
                  >{{ group.driftCount }} {{ group.driftCount === 1 ? 'issue' : 'issues' }}</span>
                </div>
              </td>
            </tr>

            <!-- Group rows (hidden when collapsed) -->
            <template v-if="!isGroupCollapsed(group.prefix)">
              <ComparisonTableRow
                v-for="row in getRowsForGroup(group)"
                :key="row.key"
                :row="row"
                :sets="sets"
                :reference-set-id="referenceSetId"
                :expanded="expandedKey === row.key"
                :session-edits="sessionEdits"
                :drift-warnings="getWarningsForKey(row.key)"
                :focused="rows.indexOf(row) === focusedRowIndex"
                @toggle="onToggle(row.key)"
                @apply-memory="emit('applyMemory', $event[0], $event[1], $event[2])"
                @apply-file="emit('applyFile', $event[0], $event[1], $event[2])"
                @revert-memory="emit('revertMemory', $event[0], $event[1])"
                @copy-value="emit('copyValue', $event)"
                @copy-to-env="emit('copyToEnv', $event[0], $event[1], $event[2])"
              />
            </template>
          </template>
        </template>

        <!-- Flat view (no grouping) -->
        <template v-else>
          <ComparisonTableRow
            v-for="(row, index) in rows"
            :key="row.key"
            :row="row"
            :sets="sets"
            :reference-set-id="referenceSetId"
            :expanded="expandedKey === row.key"
            :session-edits="sessionEdits"
            :drift-warnings="getWarningsForKey(row.key)"
            :focused="index === focusedRowIndex"
            @toggle="onToggle(row.key)"
            @apply-memory="emit('applyMemory', $event[0], $event[1], $event[2])"
            @apply-file="emit('applyFile', $event[0], $event[1], $event[2])"
            @revert-memory="emit('revertMemory', $event[0], $event[1])"
            @copy-value="emit('copyValue', $event)"
            @copy-to-env="emit('copyToEnv', $event[0], $event[1], $event[2])"
          />
        </template>

        <tr v-if="rows.length === 0">
          <td :colspan="2 + sets.length" class="px-3 py-6 text-center text-sm text-text-muted">
            No rows match current filters.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
