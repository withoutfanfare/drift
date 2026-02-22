import type { EnvSet, MissingEntry } from "../types";
import { formatValue, normalizeForComparison } from "./useEnvParser";

export function getMissingEntries(reference: EnvSet, target: EnvSet): MissingEntry[] {
  const entries: MissingEntry[] = [];

  for (const key of Object.keys(reference.values).sort()) {
    if (target.values[key] !== undefined) {
      continue;
    }

    entries.push({ key, value: reference.values[key] });
  }

  return entries;
}

export function buildMissingTemplate(reference: EnvSet, target: EnvSet): string {
  const entries = getMissingEntries(reference, target);

  if (entries.length === 0) {
    return `# No missing keys from ${reference.name} into ${target.name}`;
  }

  const lines = entries.map((entry) => `${entry.key}=${formatValue(entry.value)}`);

  return [`# Missing keys for ${target.name}`, `# Generated from reference: ${reference.name}`, ...lines].join("\n");
}

export function buildMergedTemplate(sets: EnvSet[]): string {
  const keys = new Set<string>();

  for (const set of sets) {
    for (const key of Object.keys(set.values)) {
      keys.add(key);
    }
  }

  const lines: string[] = [];

  for (const key of [...keys].sort()) {
    const present = sets
      .map((set) => ({ name: set.name, value: set.values[key] }))
      .filter((entry) => entry.value !== undefined) as Array<{ name: string; value: string }>;

    const uniqueValues = new Set(present.map((entry) => normalizeForComparison(entry.value)));

    if (present.length === sets.length && uniqueValues.size === 1) {
      lines.push(`${key}=${formatValue(present[0].value)}`);
      continue;
    }

    lines.push(`# ${key} differs across sets`);
    for (const set of sets) {
      const value = set.values[key];
      lines.push(`# - ${set.name}: ${value === undefined ? "<missing>" : value}`);
    }
    lines.push(`${key}=`);
  }

  return [`# Merged .env template (${new Date().toLocaleString()})`, ...lines].join("\n");
}
