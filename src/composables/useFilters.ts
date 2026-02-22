import { ref, computed } from "vue";
import type { RowFilter, KeyAnalysisRow } from "../types";

const filter = ref<RowFilter>("all");
const search = ref("");
const referenceSetId = ref("");
const targetSetId = ref("");

export function useFilters() {
  function filteredRows(rows: KeyAnalysisRow[]): KeyAnalysisRow[] {
    const query = search.value.trim().toLowerCase();

    return rows.filter((row) => {
      if (query && !row.key.toLowerCase().includes(query)) {
        return false;
      }

      if (filter.value === "all") return true;
      if (filter.value === "missing") return row.missingCount > 0;
      if (filter.value === "drift") return row.drift;
      if (filter.value === "unsafe") return row.unsafe;
      return row.primaryStatus === "aligned";
    });
  }

  const hasActiveFilters = computed(
    () => filter.value !== "all" || search.value.trim().length > 0,
  );

  return {
    filter,
    search,
    referenceSetId,
    targetSetId,
    filteredRows,
    hasActiveFilters,
  };
}
