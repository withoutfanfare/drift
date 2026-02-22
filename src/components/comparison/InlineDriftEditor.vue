<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { EnvSet, KeyAnalysisRow } from "../../types";
import { useMasking } from "../../composables/useMasking";
import BaseSelect from "../ui/BaseSelect.vue";
import BaseTextarea from "../ui/BaseTextarea.vue";
import BaseButton from "../ui/BaseButton.vue";

const { maskValue, shouldMask } = useMasking();
const sourceRevealed = ref(false);

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
    sourceRevealed.value = false;
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
    <h3 class="text-sm font-semibold text-text-secondary mb-3">Edit a key</h3>

    <div class="grid grid-cols-3 gap-3 max-[1120px]:grid-cols-1">
      <BaseSelect v-model="editorKey" label="Key">
        <option v-for="row in analysis" :key="row.key" :value="row.key">{{ row.key }}</option>
      </BaseSelect>
      <BaseSelect v-model="editorSourceId" label="Copy value from">
        <option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }} ({{ s.role }})</option>
      </BaseSelect>
      <BaseSelect v-model="editorTargetId" label="Apply to">
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

    <p v-if="sourceSet && editorKey && sourceSet.values[editorKey] !== undefined" class="mt-2 text-xs text-text-muted">
      Source value:
      <code
        class="font-mono cursor-pointer"
        :class="shouldMask(editorKey, sourceSet.values[editorKey] ?? '') && !sourceRevealed
          ? 'text-text-muted select-none'
          : 'text-text-secondary'"
        @click="sourceRevealed = !sourceRevealed"
      >{{ shouldMask(editorKey, sourceSet.values[editorKey] ?? '') && !sourceRevealed
          ? maskValue(editorKey, sourceSet.values[editorKey] ?? '')
          : sourceSet.values[editorKey] }}</code>
    </p>

    <div class="flex flex-wrap gap-2 mt-3">
      <BaseButton variant="tertiary" @click="loadSource">Load value</BaseButton>
      <BaseButton variant="primary" @click="emit('applyMemory', editorTargetId, editorKey, editorValue)">Update in Drift</BaseButton>
      <BaseButton variant="danger" @click="emit('applyFile', editorTargetId, editorKey, editorValue)">Write to file</BaseButton>
    </div>
  </div>
</template>
