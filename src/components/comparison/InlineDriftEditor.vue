<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { EnvSet, KeyAnalysisRow } from "../../types";
import BaseSelect from "../ui/BaseSelect.vue";
import BaseTextarea from "../ui/BaseTextarea.vue";
import BaseButton from "../ui/BaseButton.vue";

const props = defineProps<{
  sets: EnvSet[];
  analysis: KeyAnalysisRow[];
}>();

const emit = defineEmits<{
  applyMemory: [targetSetId: string, key: string, value: string];
  applyFile: [targetSetId: string, key: string, value: string];
}>();

const editorKey = ref("");
const editorSourceId = ref("");
const editorTargetId = ref("");
const editorValue = ref("");

const sourceSet = computed(() => props.sets.find((s) => s.id === editorSourceId.value));
const targetSet = computed(() => props.sets.find((s) => s.id === editorTargetId.value));
const sameSetWarning = computed(() => editorSourceId.value === editorTargetId.value && editorSourceId.value !== "");

// Sync defaults when sets/analysis change
watch(
  () => [props.sets, props.analysis] as const,
  ([sets, analysis]) => {
    if (analysis.length > 0 && !analysis.some((r) => r.key === editorKey.value)) {
      editorKey.value = analysis[0].key;
    }
    if (sets.length > 0) {
      if (!sets.some((s) => s.id === editorSourceId.value)) {
        editorSourceId.value = sets[0].id;
      }
      if (!sets.some((s) => s.id === editorTargetId.value)) {
        editorTargetId.value = sets.length > 1 ? sets[1].id : sets[0].id;
      }
    }
  },
  { immediate: true },
);

// Sync editor value when key or source changes
watch(
  [editorKey, editorSourceId],
  () => {
    if (sourceSet.value && editorKey.value) {
      editorValue.value = sourceSet.value.values[editorKey.value] ?? "";
    }
  },
  { immediate: true },
);

function loadSource() {
  if (sourceSet.value && editorKey.value) {
    editorValue.value = sourceSet.value.values[editorKey.value] ?? "";
  }
}

function selectKey(key: string) {
  editorKey.value = key;
}

defineExpose({ selectKey });
</script>

<template>
  <div class="mt-5">
    <h3 class="text-sm font-semibold text-text-secondary mb-3">Inline Drift Editor</h3>

    <div class="grid grid-cols-3 gap-3 max-[1120px]:grid-cols-1">
      <BaseSelect v-model="editorKey" label="Key">
        <option v-for="row in analysis" :key="row.key" :value="row.key">{{ row.key }}</option>
      </BaseSelect>
      <BaseSelect v-model="editorSourceId" label="Source set">
        <option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }} ({{ s.role }})</option>
      </BaseSelect>
      <BaseSelect v-model="editorTargetId" label="Target set">
        <option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }} ({{ s.role }})</option>
      </BaseSelect>
    </div>

    <div class="mt-3">
      <BaseTextarea
        v-model="editorValue"
        label="Value"
        placeholder="Set value for selected key"
        :rows="3"
      />
    </div>

    <p v-if="sameSetWarning" class="mt-2 text-xs text-warning">
      Source and target are the same set. Changes will be applied to the same set they were loaded from.
    </p>

    <div class="flex flex-wrap gap-2 mt-3">
      <BaseButton variant="tertiary" @click="loadSource">Load Value From Source</BaseButton>
      <BaseButton variant="primary" @click="emit('applyMemory', editorTargetId, editorKey, editorValue)">Apply to Target (In-App)</BaseButton>
      <BaseButton variant="danger" @click="emit('applyFile', editorTargetId, editorKey, editorValue)">Apply to Target File</BaseButton>
    </div>
  </div>
</template>
