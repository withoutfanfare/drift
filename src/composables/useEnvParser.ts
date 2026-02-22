export function parseEnv(content: string): { values: Record<string, string>; duplicates: string[] } {
  const values: Record<string, string> = {};
  const duplicates = new Set<string>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eqIndex = withoutExport.indexOf("=");

    if (eqIndex <= 0) {
      continue;
    }

    const key = withoutExport.slice(0, eqIndex).trim();
    if (!/^[A-Z0-9_]+$/i.test(key)) {
      continue;
    }

    const rawValue = withoutExport.slice(eqIndex + 1).trim();
    const value = stripWrappingQuotes(rawValue);

    if (Object.prototype.hasOwnProperty.call(values, key)) {
      duplicates.add(key);
    }

    values[key] = value;
  }

  return { values, duplicates: [...duplicates] };
}

export function stripWrappingQuotes(value: string): string {
  if (value.length >= 2) {
    const starts = value[0];
    const ends = value[value.length - 1];
    if ((starts === '"' && ends === '"') || (starts === "'" && ends === "'")) {
      return value.slice(1, -1);
    }
  }

  return value;
}

export function parseKeyFromEnvLine(rawLine: string): string | null {
  const line = rawLine.trim();

  if (line.length === 0 || line.startsWith("#")) {
    return null;
  }

  const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
  const eqIndex = withoutExport.indexOf("=");

  if (eqIndex <= 0) {
    return null;
  }

  const key = withoutExport.slice(0, eqIndex).trim();
  if (!/^[A-Z0-9_]+$/i.test(key)) {
    return null;
  }

  return key;
}

export function formatValue(value: string): string {
  if (value.length === 0) {
    return "";
  }

  if (/\s|#/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  return value;
}

export function normalizeForComparison(value: string): string {
  return value.trim();
}

export function isTruthy(value: string): boolean {
  return value === "true" || value === "1" || value === "yes" || value === "on";
}
