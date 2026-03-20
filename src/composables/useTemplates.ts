import type { EnvSet, MissingEntry } from "../types";
import { formatValue, normalizeForComparison, parseKeyFromEnvLine } from "./useEnvParser";

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

/**
 * Build an accurate patch preview that mirrors the Rust backend's
 * append_missing_env_keys deduplication logic. Parses existing keys
 * from the target's raw text and only includes entries that would
 * actually be appended.
 */
export function buildPatchPreview(
  targetRawText: string,
  entries: MissingEntry[],
): { preview: string; actualEntries: MissingEntry[] } {
  // Parse existing keys from the target text (mirrors Rust parse_env_keys)
  const existingKeys = new Set<string>();
  for (const line of targetRawText.split(/\r?\n/)) {
    const key = parseKeyFromEnvLine(line);
    if (key) existingKeys.add(key);
  }

  // Filter to only entries the backend would actually append
  const actualEntries: MissingEntry[] = [];
  for (const entry of entries) {
    const key = entry.key.trim();
    if (existingKeys.has(key)) continue;
    existingKeys.add(key); // prevent duplicates within entries
    actualEntries.push(entry);
  }

  let preview = targetRawText;
  if (actualEntries.length > 0) {
    if (!preview.endsWith("\n")) preview += "\n";
    preview += "\n# Added by Drift\n";
    for (const entry of actualEntries) {
      preview += `${entry.key}=${formatValue(entry.value)}\n`;
    }
  }

  return { preview, actualEntries };
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
