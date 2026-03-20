import { ref, computed } from "vue";
import type { KeyAnalysisRow, VariableGroup } from "../types";

const STORAGE_KEY = "edm.grouping.v1";

/** Well-known Laravel service prefixes in display order */
const SERVICE_PREFIXES = [
  { prefix: "APP_", label: "Application" },
  { prefix: "DB_", label: "Database" },
  { prefix: "MAIL_", label: "Mail" },
  { prefix: "AWS_", label: "AWS" },
  { prefix: "REDIS_", label: "Redis" },
  { prefix: "CACHE_", label: "Cache" },
  { prefix: "QUEUE_", label: "Queue" },
  { prefix: "SESSION_", label: "Session" },
  { prefix: "LOG_", label: "Logging" },
  { prefix: "BROADCAST_", label: "Broadcasting" },
  { prefix: "FILESYSTEM_", label: "Filesystem" },
  { prefix: "PUSHER_", label: "Pusher" },
  { prefix: "VITE_", label: "Vite" },
  { prefix: "MIX_", label: "Mix" },
  { prefix: "STRIPE_", label: "Stripe" },
  { prefix: "CASHIER_", label: "Cashier" },
  { prefix: "SANCTUM_", label: "Sanctum" },
  { prefix: "SCOUT_", label: "Scout" },
  { prefix: "TELESCOPE_", label: "Telescope" },
  { prefix: "HORIZON_", label: "Horizon" },
  { prefix: "VAPOR_", label: "Vapor" },
  { prefix: "PASSPORT_", label: "Passport" },
  { prefix: "SOCIALITE_", label: "Socialite" },
];

function loadGroupingEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

const groupingEnabled = ref(loadGroupingEnabled());

export function useGrouping() {
  function toggleGrouping() {
    groupingEnabled.value = !groupingEnabled.value;
    try {
      localStorage.setItem(STORAGE_KEY, String(groupingEnabled.value));
    } catch {
      // Silently fail
    }
  }

  function groupRows(rows: KeyAnalysisRow[]): VariableGroup[] {
    const groups: VariableGroup[] = [];
    const assignedKeys = new Set<string>();

    for (const { prefix, label } of SERVICE_PREFIXES) {
      const matching = rows.filter((r) => r.key.startsWith(prefix));
      if (matching.length === 0) continue;

      const driftCount = matching.filter((r) => r.drift || r.missingCount > 0 || r.unsafe).length;
      groups.push({
        prefix,
        label,
        keys: matching.map((r) => r.key),
        driftCount,
      });

      for (const r of matching) {
        assignedKeys.add(r.key);
      }
    }

    // "Other" group for ungrouped keys
    const ungrouped = rows.filter((r) => !assignedKeys.has(r.key));
    if (ungrouped.length > 0) {
      const driftCount = ungrouped.filter((r) => r.drift || r.missingCount > 0 || r.unsafe).length;
      groups.push({
        prefix: "",
        label: "Other",
        keys: ungrouped.map((r) => r.key),
        driftCount,
      });
    }

    return groups;
  }

  /** Return the service prefix label for a given key, or null */
  function prefixLabelForKey(key: string): string | null {
    for (const { prefix, label } of SERVICE_PREFIXES) {
      if (key.startsWith(prefix)) return label;
    }
    return null;
  }

  return {
    groupingEnabled: computed(() => groupingEnabled.value),
    toggleGrouping,
    groupRows,
    prefixLabelForKey,
    SERVICE_PREFIXES,
  };
}
