import { ref, computed, watch } from "vue";
import type { EnvSet } from "../types";
import { useProjects } from "./useProjects";

const STORAGE_KEY = "edm.columnOrder.v1";

/**
 * Persists per-project column order for the comparison matrix.
 * Column order is stored as a map of projectId → array of setIds.
 */
function loadOrders(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

const orders = ref<Record<string, string[]>>(loadOrders());

function persistOrders() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders.value));
  } catch {
    // Silently fail
  }
}

export function useColumnOrder(sets: () => EnvSet[]) {
  const { activeProjectId } = useProjects();

  const projectOrder = computed(() =>
    orders.value[activeProjectId.value] ?? [],
  );

  /** Sets reordered according to the persisted column order */
  const orderedSets = computed(() => {
    const currentSets = sets();
    const order = projectOrder.value;
    if (order.length === 0) return currentSets;

    const ordered: EnvSet[] = [];
    for (const id of order) {
      const found = currentSets.find((s) => s.id === id);
      if (found) ordered.push(found);
    }
    // Append any sets not in the persisted order (newly added sets)
    for (const s of currentSets) {
      if (!order.includes(s.id)) ordered.push(s);
    }
    return ordered;
  });

  function setOrder(setIds: string[]) {
    orders.value = { ...orders.value, [activeProjectId.value]: setIds };
    persistOrders();
  }

  function moveColumn(fromIndex: number, toIndex: number) {
    const currentIds = orderedSets.value.map((s) => s.id);
    if (fromIndex < 0 || fromIndex >= currentIds.length) return;
    if (toIndex < 0 || toIndex >= currentIds.length) return;
    if (fromIndex === toIndex) return;

    const [moved] = currentIds.splice(fromIndex, 1);
    currentIds.splice(toIndex, 0, moved);
    setOrder(currentIds);
  }

  function resetOrder() {
    const next = { ...orders.value };
    delete next[activeProjectId.value];
    orders.value = next;
    persistOrders();
  }

  const hasCustomOrder = computed(() => projectOrder.value.length > 0);

  // Clear order when project changes and sets don't match
  watch(activeProjectId, () => {
    // Order is per-project, so it resets naturally via the computed
  });

  return {
    orderedSets,
    moveColumn,
    resetOrder,
    hasCustomOrder,
  };
}
