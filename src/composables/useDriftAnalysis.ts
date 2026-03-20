import { ref, computed } from "vue";
import type { EnvSet, DriftRule, DriftWarning } from "../types";
import { isProductionLike } from "./useAnalysis";

const STORAGE_KEY = "edm.driftRules.v1";

const DEFAULT_RULES: DriftRule[] = [
  { id: "prod-url-in-non-prod", label: "Production URLs in non-production environments", enabled: true },
  { id: "debug-in-prod", label: "Debug/testing flags enabled in production", enabled: true },
  { id: "http-not-https", label: "HTTP where HTTPS is expected", enabled: true },
  { id: "localhost-in-non-local", label: "Localhost references in non-local environments", enabled: true },
  { id: "same-db-across-envs", label: "Same database credentials across environments", enabled: true },
  { id: "empty-secrets-in-prod", label: "Empty secrets in production-like environments", enabled: true },
];

function loadRules(): DriftRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RULES.map((r) => ({ ...r }));
    const parsed = JSON.parse(raw) as DriftRule[];
    if (!Array.isArray(parsed)) return DEFAULT_RULES.map((r) => ({ ...r }));

    // Merge with defaults to pick up new rules
    return DEFAULT_RULES.map((def) => {
      const saved = parsed.find((p) => p.id === def.id);
      return saved ? { ...def, enabled: saved.enabled } : { ...def };
    });
  } catch {
    return DEFAULT_RULES.map((r) => ({ ...r }));
  }
}

const rules = ref<DriftRule[]>(loadRules());

function persistRules() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules.value));
  } catch {
    // Silently fail
  }
}

export function useDriftAnalysis() {
  function toggleRule(ruleId: string) {
    const rule = rules.value.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = !rule.enabled;
      persistRules();
    }
  }

  function analyseValueDrift(sets: EnvSet[]): DriftWarning[] {
    const warnings: DriftWarning[] = [];
    if (sets.length < 2) return warnings;

    const prodSets = sets.filter((s) => isProductionLike(s));
    const nonProdSets = sets.filter((s) => !isProductionLike(s));
    const localSets = sets.filter((s) => s.role === "local");
    const nonLocalSets = sets.filter((s) => s.role !== "local");

    // Collect all keys across sets
    const allKeys = new Set<string>();
    for (const set of sets) {
      for (const key of Object.keys(set.values)) {
        allKeys.add(key);
      }
    }

    for (const key of allKeys) {
      // Rule: Production URLs in non-production environments
      if (isRuleEnabled("prod-url-in-non-prod")) {
        for (const prodSet of prodSets) {
          const prodVal = prodSet.values[key];
          if (!prodVal || !looksLikeUrl(prodVal)) continue;

          for (const npSet of nonProdSets) {
            const npVal = npSet.values[key];
            if (npVal && npVal === prodVal && looksLikeUrl(npVal)) {
              warnings.push({
                ruleId: "prod-url-in-non-prod",
                key,
                setId: npSet.id,
                setName: npSet.name,
                message: `${key} in ${npSet.name} matches the production value`,
                suggestion: `Update ${key} in ${npSet.name} to use a non-production URL`,
              });
            }
          }
        }
      }

      // Rule: Debug/testing flags in production
      if (isRuleEnabled("debug-in-prod")) {
        const debugKeys = ["APP_DEBUG", "DEBUG", "DEBUGBAR_ENABLED", "TELESCOPE_ENABLED"];
        if (debugKeys.includes(key)) {
          for (const prodSet of prodSets) {
            const val = (prodSet.values[key] ?? "").toLowerCase();
            if (val === "true" || val === "1" || val === "yes" || val === "on") {
              warnings.push({
                ruleId: "debug-in-prod",
                key,
                setId: prodSet.id,
                setName: prodSet.name,
                message: `${key} is enabled in production-like environment ${prodSet.name}`,
                suggestion: `Set ${key}=false in ${prodSet.name}`,
              });
            }
          }
        }
      }

      // Rule: HTTP where HTTPS is expected
      if (isRuleEnabled("http-not-https")) {
        const urlKeys = ["APP_URL", "ASSET_URL", "FRONTEND_URL", "API_URL", "WEBHOOK_URL"];
        if (urlKeys.includes(key) || key.endsWith("_URL")) {
          for (const prodSet of prodSets) {
            const val = prodSet.values[key] ?? "";
            if (val.startsWith("http://") && !val.includes("localhost") && !val.includes("127.0.0.1")) {
              warnings.push({
                ruleId: "http-not-https",
                key,
                setId: prodSet.id,
                setName: prodSet.name,
                message: `${key} uses HTTP in production-like environment ${prodSet.name}`,
                suggestion: `Change ${key} to use HTTPS in ${prodSet.name}`,
              });
            }
          }
        }
      }

      // Rule: Localhost references in non-local environments
      if (isRuleEnabled("localhost-in-non-local")) {
        for (const nlSet of nonLocalSets) {
          const val = nlSet.values[key] ?? "";
          if (
            (val.includes("localhost") || val.includes("127.0.0.1") || val.includes("0.0.0.0")) &&
            looksLikeUrl(val)
          ) {
            warnings.push({
              ruleId: "localhost-in-non-local",
              key,
              setId: nlSet.id,
              setName: nlSet.name,
              message: `${key} references localhost in non-local environment ${nlSet.name}`,
              suggestion: `Update ${key} in ${nlSet.name} to use the correct hostname`,
            });
          }
        }
      }

      // Rule: Same database credentials across environments
      if (isRuleEnabled("same-db-across-envs")) {
        const dbKeys = ["DB_HOST", "DB_DATABASE", "DB_PASSWORD"];
        if (dbKeys.includes(key) && prodSets.length > 0 && nonProdSets.length > 0) {
          for (const prodSet of prodSets) {
            const prodVal = prodSet.values[key];
            if (!prodVal || prodVal.trim().length === 0) continue;

            for (const npSet of nonProdSets) {
              const npVal = npSet.values[key];
              if (npVal === prodVal) {
                warnings.push({
                  ruleId: "same-db-across-envs",
                  key,
                  setId: npSet.id,
                  setName: npSet.name,
                  message: `${key} in ${npSet.name} matches production value — potential environment cross-contamination`,
                  suggestion: `Verify ${key} in ${npSet.name} should match production`,
                });
              }
            }
          }
        }
      }

      // Rule: Empty secrets in production
      if (isRuleEnabled("empty-secrets-in-prod")) {
        const secretPatterns = [/_SECRET$/, /_KEY$/, /_PASSWORD$/, /_TOKEN$/, /_PRIVATE/];
        const isSecret = secretPatterns.some((p) => p.test(key));
        if (isSecret) {
          for (const prodSet of prodSets) {
            const val = prodSet.values[key];
            if (val !== undefined && val.trim().length === 0) {
              warnings.push({
                ruleId: "empty-secrets-in-prod",
                key,
                setId: prodSet.id,
                setName: prodSet.name,
                message: `${key} is empty in production-like environment ${prodSet.name}`,
                suggestion: `Set a value for ${key} in ${prodSet.name}`,
              });
            }
          }
        }
      }
    }

    return warnings;
  }

  function isRuleEnabled(ruleId: string): boolean {
    const rule = rules.value.find((r) => r.id === ruleId);
    return rule?.enabled ?? false;
  }

  return {
    rules: computed(() => rules.value),
    toggleRule,
    analyseValueDrift,
  };
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
