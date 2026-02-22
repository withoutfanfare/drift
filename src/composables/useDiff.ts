export interface DiffLine {
  type: "context" | "added" | "removed";
  content: string;
  lineNumber: number;
}

export function computeDiff(original: string, updated: string): DiffLine[] {
  const oldLines = original.split("\n");
  const newLines = updated.split("\n");

  // Myers diff - compute shortest edit script
  const edits = myersDiff(oldLines, newLines);

  // Convert edits to DiffLines with line numbers
  const result: DiffLine[] = [];
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const edit of edits) {
    if (edit.type === "equal") {
      oldLineNum++;
      newLineNum++;
      result.push({ type: "context", content: edit.content, lineNumber: newLineNum });
    } else if (edit.type === "delete") {
      oldLineNum++;
      result.push({ type: "removed", content: edit.content, lineNumber: oldLineNum });
    } else {
      newLineNum++;
      result.push({ type: "added", content: edit.content, lineNumber: newLineNum });
    }
  }

  return trimContext(result, 2);
}

interface Edit {
  type: "equal" | "insert" | "delete";
  content: string;
}

function myersDiff(oldLines: string[], newLines: string[]): Edit[] {
  const n = oldLines.length;
  const m = newLines.length;
  const max = n + m;

  // Shortcut for identical content
  if (n === 0 && m === 0) return [];
  if (n === 0) return newLines.map(line => ({ type: "insert" as const, content: line }));
  if (m === 0) return oldLines.map(line => ({ type: "delete" as const, content: line }));

  // V array indexed by k = x - y, offset by max
  const v: number[] = new Array(2 * max + 1).fill(0);
  const trace: number[][] = [];

  // Forward pass - find shortest edit path
  outer:
  for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max])) {
        x = v[k + 1 + max]; // move down (insert)
      } else {
        x = v[k - 1 + max] + 1; // move right (delete)
      }
      let y = x - k;

      // Follow diagonal (equal lines)
      while (x < n && y < m && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }

      v[k + max] = x;

      if (x >= n && y >= m) {
        break outer;
      }
    }
  }

  // Backtrack to build edit sequence
  const edits: Edit[] = [];
  let x = n;
  let y = m;

  for (let d = trace.length - 1; d >= 0; d--) {
    const vPrev = trace[d];
    const k = x - y;

    let prevK: number;
    if (k === -d || (k !== d && vPrev[k - 1 + max] < vPrev[k + 1 + max])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = vPrev[prevK + max];
    const prevY = prevX - prevK;

    // Diagonal moves (equal)
    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.unshift({ type: "equal", content: oldLines[x] });
    }

    if (d > 0) {
      if (x === prevX) {
        // Insert
        y--;
        edits.unshift({ type: "insert", content: newLines[y] });
      } else {
        // Delete
        x--;
        edits.unshift({ type: "delete", content: oldLines[x] });
      }
    }
  }

  return edits;
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
