import type { LocalUpsertResult } from "../types";
import { formatValue, parseKeyFromEnvLine } from "./useEnvParser";

export function upsertEnvKeyInRaw(rawText: string, key: string, value: string): LocalUpsertResult {
  const lineEnding = rawText.includes("\r\n") ? "\r\n" : "\n";
  const lines = rawText.split(/\r?\n/);
  let matchedCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const parsedKey = parseKeyFromEnvLine(lines[index]);
    if (parsedKey !== key) {
      continue;
    }

    lines[index] = `${key}=${formatValue(value)}`;
    matchedCount += 1;
  }

  let appended = false;
  if (matchedCount === 0) {
    appended = true;

    if (lines.length > 0 && lines[lines.length - 1].trim().length > 0) {
      lines.push("");
    }

    lines.push(`# Added by Drift at ${Date.now()}`);
    lines.push(`${key}=${formatValue(value)}`);
  }

  const updatedContent = `${lines.join(lineEnding)}${lineEnding}`;

  return {
    updatedContent,
    matchedCount,
    appended,
  };
}
