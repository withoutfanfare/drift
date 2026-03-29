import type { EnvSet } from "../types";
import { analyzeRows, isProductionLike } from "./useAnalysis";
import { useSecretDetection } from "./useSecretDetection";

export interface HealthFactor {
  id: string;
  label: string;
  weight: number;
  score: number; // 0-100 for this factor
  detail: string;
}

export interface HealthScore {
  total: number; // 0-100 weighted total
  grade: string; // A, B, C, D, F
  factors: HealthFactor[];
}

/**
 * Map a numeric score (0-100) to a letter grade.
 */
function toGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * Compute a 0-100 health score for a collection of env sets.
 *
 * This is a pure computation — no reactive refs or state. It evaluates five
 * weighted factors: key completeness, value warnings, syntax validation,
 * secret masking coverage, and file freshness.
 */
export function computeHealthScore(sets: EnvSet[]): HealthScore {
  const factors: HealthFactor[] = [
    computeKeyCompleteness(sets),
    computeValueWarnings(sets),
    computeSyntaxValidation(sets),
    computeSecretMaskingCoverage(sets),
    computeFileFreshness(sets),
  ];

  const total = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0),
  );

  return {
    total,
    grade: toGrade(total),
    factors,
  };
}

/**
 * Key completeness (30%): for each unique key across all sets, check whether
 * it exists in every set. Score = (keys present in all sets / total unique keys) * 100.
 * If there are 0 sets, score 100 (nothing to check).
 */
function computeKeyCompleteness(sets: EnvSet[]): HealthFactor {
  const id = "key-completeness";
  const label = "Key completeness";
  const weight = 0.3;

  if (sets.length === 0) {
    return { id, label, weight, score: 100, detail: "No sets to check" };
  }

  const allKeys = new Set<string>();
  for (const set of sets) {
    for (const key of Object.keys(set.values)) {
      allKeys.add(key);
    }
  }

  const totalKeys = allKeys.size;
  if (totalKeys === 0) {
    return { id, label, weight, score: 100, detail: "No keys defined" };
  }

  let presentInAll = 0;
  for (const key of allKeys) {
    const existsInEverySet = sets.every((s) => s.values[key] !== undefined);
    if (existsInEverySet) {
      presentInAll++;
    }
  }

  const score = Math.round((presentInAll / totalKeys) * 100);
  const missingKeys = totalKeys - presentInAll;

  return {
    id,
    label,
    weight,
    score,
    detail:
      missingKeys === 0
        ? `All ${totalKeys} keys present in every set`
        : `${missingKeys} of ${totalKeys} keys missing from at least one set`,
  };
}

/**
 * Value warnings (25%): run analyzeRows() and count unsafe/drift rows.
 * Score = max(0, 100 - (unsafe_count * 10 + drift_count * 3)).
 */
function computeValueWarnings(sets: EnvSet[]): HealthFactor {
  const id = "value-warnings";
  const label = "Value warnings";
  const weight = 0.25;

  if (sets.length === 0) {
    return { id, label, weight, score: 100, detail: "No sets to analyse" };
  }

  const rows = analyzeRows(sets);
  const unsafeCount = rows.filter((r) => r.unsafe).length;
  const driftCount = rows.filter((r) => r.drift).length;
  const score = Math.max(0, 100 - unsafeCount * 10 - driftCount * 3);

  const parts: string[] = [];
  if (unsafeCount > 0) parts.push(`${unsafeCount} unsafe`);
  if (driftCount > 0) parts.push(`${driftCount} drifted`);

  return {
    id,
    label,
    weight,
    score,
    detail: parts.length === 0 ? "No value warnings" : parts.join(", "),
  };
}

/**
 * Syntax validation (20%): sum all validationWarnings across sets.
 * Score = max(0, 100 - (error_count * 15 + warning_count * 5)).
 */
function computeSyntaxValidation(sets: EnvSet[]): HealthFactor {
  const id = "syntax-validation";
  const label = "Syntax validation";
  const weight = 0.2;

  if (sets.length === 0) {
    return { id, label, weight, score: 100, detail: "No sets to validate" };
  }

  let errorCount = 0;
  let warningCount = 0;

  for (const set of sets) {
    for (const w of set.validationWarnings) {
      if (w.severity === "error") {
        errorCount++;
      } else {
        warningCount++;
      }
    }
  }

  const score = Math.max(0, 100 - errorCount * 15 - warningCount * 5);

  const parts: string[] = [];
  if (errorCount > 0) parts.push(`${errorCount} error${errorCount !== 1 ? "s" : ""}`);
  if (warningCount > 0) parts.push(`${warningCount} warning${warningCount !== 1 ? "s" : ""}`);

  return {
    id,
    label,
    weight,
    score,
    detail: parts.length === 0 ? "No syntax issues" : parts.join(", "),
  };
}

/**
 * Secret masking coverage (15%): for each key-value pair, check detectSecret().
 * Score = 100 minus 5 per detected secret that has a non-empty value in a
 * production-like set. If no production-like sets exist, score 100.
 */
function computeSecretMaskingCoverage(sets: EnvSet[]): HealthFactor {
  const id = "secret-masking";
  const label = "Secret masking coverage";
  const weight = 0.15;

  if (sets.length === 0) {
    return { id, label, weight, score: 100, detail: "No sets to check" };
  }

  const { detectSecret } = useSecretDetection();
  const prodSets = sets.filter((s) => isProductionLike(s));

  if (prodSets.length === 0) {
    return {
      id,
      label,
      weight,
      score: 100,
      detail: "No production-like sets to check",
    };
  }

  let exposedSecrets = 0;

  for (const set of prodSets) {
    for (const [key, value] of Object.entries(set.values)) {
      if (value && value.trim().length > 0 && detectSecret(key, value)) {
        exposedSecrets++;
      }
    }
  }

  const score = Math.max(0, 100 - exposedSecrets * 5);

  return {
    id,
    label,
    weight,
    score,
    detail:
      exposedSecrets === 0
        ? "No exposed secrets in production sets"
        : `${exposedSecrets} secret${exposedSecrets !== 1 ? "s" : ""} detected in production-like sets`,
  };
}

/**
 * File freshness (10%): if no file paths on any set, score 50 (unknown).
 * Otherwise score 100 (files are loaded, freshness is current).
 */
function computeFileFreshness(sets: EnvSet[]): HealthFactor {
  const id = "file-freshness";
  const label = "File freshness";
  const weight = 0.1;

  if (sets.length === 0) {
    return { id, label, weight, score: 50, detail: "No sets loaded" };
  }

  const hasAnyFilePath = sets.some((s) => s.filePath && s.filePath.trim().length > 0);

  if (!hasAnyFilePath) {
    return {
      id,
      label,
      weight,
      score: 50,
      detail: "No file paths — freshness unknown",
    };
  }

  return {
    id,
    label,
    weight,
    score: 100,
    detail: "Files loaded and current",
  };
}
