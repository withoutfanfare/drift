export interface DiffLine {
  type: "context" | "added" | "removed";
  content: string;
  lineNumber: number;
}

export function computeDiff(original: string, updated: string): DiffLine[] {
  const oldLines = original.split("\n");
  const newLines = updated.split("\n");
  const result: DiffLine[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  let lineNum = 0;

  for (let i = 0; i < maxLen; i++) {
    lineNum++;
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      if (oldLine !== undefined) {
        result.push({ type: "context", content: oldLine, lineNumber: lineNum });
      }
    } else {
      if (oldLine !== undefined && !newLines.includes(oldLine)) {
        result.push({ type: "removed", content: oldLine, lineNumber: lineNum });
      }
      if (newLine !== undefined && !oldLines.includes(newLine)) {
        result.push({ type: "added", content: newLine, lineNumber: lineNum });
      }
    }
  }

  // Trim context lines: show only 2 lines around changes
  return trimContext(result, 2);
}

function trimContext(lines: DiffLine[], contextSize: number): DiffLine[] {
  const changeIndices = new Set<number>();
  lines.forEach((line, i) => {
    if (line.type !== "context") {
      for (let j = Math.max(0, i - contextSize); j <= Math.min(lines.length - 1, i + contextSize); j++) {
        changeIndices.add(j);
      }
    }
  });

  if (changeIndices.size === 0) return [];

  const result: DiffLine[] = [];
  let lastIncluded = -2;

  for (let i = 0; i < lines.length; i++) {
    if (changeIndices.has(i)) {
      if (i - lastIncluded > 1 && result.length > 0) {
        result.push({ type: "context", content: "\u00B7\u00B7\u00B7", lineNumber: 0 });
      }
      result.push(lines[i]);
      lastIncluded = i;
    }
  }

  return result;
}
