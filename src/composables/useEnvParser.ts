import type { EnvComment, EnvValidationWarning } from "../types";

export interface ParseResult {
  values: Record<string, string>;
  duplicates: string[];
  comments: Record<string, EnvComment>;
}

export function parseEnv(content: string): ParseResult {
  const values: Record<string, string> = {};
  const duplicates = new Set<string>();
  const comments: Record<string, EnvComment> = {};
  const pendingComments: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.length === 0) {
      // Blank line resets pending comments
      pendingComments.length = 0;
      continue;
    }

    if (line.startsWith("#")) {
      // Collect comment lines above the next key
      pendingComments.push(line.slice(1).trim());
      continue;
    }

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eqIndex = withoutExport.indexOf("=");

    if (eqIndex <= 0) {
      pendingComments.length = 0;
      continue;
    }

    const key = withoutExport.slice(0, eqIndex).trim();
    if (!/^[A-Z0-9_]+$/i.test(key)) {
      pendingComments.length = 0;
      continue;
    }

    const rawValue = withoutExport.slice(eqIndex + 1).trim();

    // Extract inline comment and processed value
    let processedValue: string;
    let inlineComment: string | null = null;

    if (rawValue.startsWith('"') || rawValue.startsWith("'")) {
      processedValue = stripWrappingQuotes(rawValue);
    } else {
      const commentIndex = rawValue.indexOf(" #");
      if (commentIndex >= 0) {
        processedValue = rawValue.slice(0, commentIndex).trimEnd();
        inlineComment = rawValue.slice(commentIndex + 2).trim();
      } else {
        processedValue = rawValue;
      }
    }

    if (Object.prototype.hasOwnProperty.call(values, key)) {
      duplicates.add(key);
    }

    values[key] = processedValue;

    // Store comments if any exist
    if (pendingComments.length > 0 || inlineComment) {
      comments[key] = {
        above: [...pendingComments],
        inline: inlineComment,
      };
    }

    pendingComments.length = 0;
  }

  return { values, duplicates: [...duplicates], comments };
}

export function stripWrappingQuotes(value: string): string {
  if (value.length >= 2) {
    const starts = value[0];
    const ends = value[value.length - 1];
    if (starts === '"' && ends === '"') {
      // Process escape sequences in double-quoted values (matching Rust)
      return value.slice(1, -1).replace(/\\"/g, '"');
    }
    if (starts === "'" && ends === "'") {
      // Single-quoted values: no escape processing (matching Rust)
      return value.slice(1, -1).replace(/\\'/g, "'");
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

/**
 * Validate .env file syntax and return line-level warnings.
 */
export function validateEnvSyntax(content: string): EnvValidationWarning[] {
  const warnings: EnvValidationWarning[] = [];
  const seenKeys = new Map<string, number>();
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eqIndex = withoutExport.indexOf("=");

    if (eqIndex < 0) {
      warnings.push({
        line: lineNum,
        message: `Missing '=' separator — line is not a valid variable declaration`,
        severity: "error",
      });
      continue;
    }

    if (eqIndex === 0) {
      warnings.push({
        line: lineNum,
        message: `Empty variable name before '='`,
        severity: "error",
      });
      continue;
    }

    const key = withoutExport.slice(0, eqIndex).trim();

    // Check for invalid variable names
    if (/^\d/.test(key)) {
      warnings.push({
        line: lineNum,
        message: `Variable name '${key}' starts with a digit — invalid identifier`,
        severity: "error",
      });
      continue;
    }

    if (!/^[A-Z0-9_]+$/i.test(key)) {
      warnings.push({
        line: lineNum,
        message: `Variable name '${key}' contains invalid characters (only letters, digits, underscores allowed)`,
        severity: "error",
      });
      continue;
    }

    // Check for duplicate keys
    const prevLine = seenKeys.get(key);
    if (prevLine !== undefined) {
      warnings.push({
        line: lineNum,
        message: `Duplicate key '${key}' (first defined on line ${prevLine}) — last value wins`,
        severity: "warning",
      });
    }
    seenKeys.set(key, lineNum);

    // Check for unmatched quotes
    const rawValue = withoutExport.slice(eqIndex + 1).trim();
    if (rawValue.length > 0) {
      if (rawValue.startsWith('"') && !rawValue.endsWith('"')) {
        warnings.push({
          line: lineNum,
          message: `Unclosed double quote in value for '${key}'`,
          severity: "warning",
        });
      } else if (rawValue.startsWith("'") && !rawValue.endsWith("'")) {
        warnings.push({
          line: lineNum,
          message: `Unclosed single quote in value for '${key}'`,
          severity: "warning",
        });
      }

      // Check for unquoted values with spaces (likely needs quoting)
      if (!rawValue.startsWith('"') && !rawValue.startsWith("'")) {
        const commentStripped = rawValue.indexOf(" #") >= 0
          ? rawValue.slice(0, rawValue.indexOf(" #"))
          : rawValue;
        if (/\s/.test(commentStripped)) {
          warnings.push({
            line: lineNum,
            message: `Unquoted value for '${key}' contains spaces — consider wrapping in quotes`,
            severity: "warning",
          });
        }
      }
    }
  }

  return warnings;
}
