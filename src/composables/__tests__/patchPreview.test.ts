import { describe, it, expect } from "vitest";
import { buildPatchPreview, getMissingEntries } from "../useTemplates";
import { computeDiff } from "../useDiff";
import { parseEnv } from "../useEnvParser";
import type { EnvSet, MissingEntry } from "../../types";

function makeSet(rawText: string, overrides: Partial<EnvSet> = {}): EnvSet {
  const { values, duplicates } = parseEnv(rawText);
  return {
    id: "test",
    projectId: "proj",
    name: "test.env",
    role: "local",
    source: "file",
    rawText,
    values,
    duplicates,
    ...overrides,
  };
}

describe("buildPatchPreview", () => {
  it("appends entries that are genuinely missing", () => {
    const target = "APP_NAME=Test\nDB_HOST=localhost\n";
    const entries: MissingEntry[] = [
      { key: "DB_PASSWORD", value: "secret" },
      { key: "CACHE_DRIVER", value: "redis" },
    ];
    const { preview, actualEntries } = buildPatchPreview(target, entries);

    expect(actualEntries).toHaveLength(2);
    expect(preview).toContain("DB_PASSWORD=secret");
    expect(preview).toContain("CACHE_DRIVER=redis");
    expect(preview).toContain("# Added by Drift");
  });

  it("skips entries that already exist in target raw text", () => {
    const target = "APP_NAME=Test\nDB_HOST=localhost\nDB_PASSWORD=existing\n";
    const entries: MissingEntry[] = [
      { key: "DB_PASSWORD", value: "new_password" },
      { key: "CACHE_DRIVER", value: "redis" },
    ];
    const { preview, actualEntries } = buildPatchPreview(target, entries);

    expect(actualEntries).toHaveLength(1);
    expect(actualEntries[0].key).toBe("CACHE_DRIVER");
    // DB_PASSWORD=existing is in the original text, but DB_PASSWORD=new_password should NOT be appended
    expect(preview).not.toContain("DB_PASSWORD=new_password");
    expect(preview).toContain("CACHE_DRIVER=redis");
  });

  it("returns empty actualEntries when all entries already exist", () => {
    const target = "DB_HOST=localhost\nDB_PASSWORD=secret\n";
    const entries: MissingEntry[] = [
      { key: "DB_HOST", value: "prod" },
      { key: "DB_PASSWORD", value: "new" },
    ];
    const { preview, actualEntries } = buildPatchPreview(target, entries);

    expect(actualEntries).toHaveLength(0);
    expect(preview).toBe(target);
  });

  it("deduplicates entries within the input list", () => {
    const target = "APP_NAME=Test\n";
    const entries: MissingEntry[] = [
      { key: "NEW_KEY", value: "first" },
      { key: "NEW_KEY", value: "second" },
    ];
    const { actualEntries } = buildPatchPreview(target, entries);

    expect(actualEntries).toHaveLength(1);
    expect(actualEntries[0].value).toBe("first");
  });

  it("handles keys with export prefix in target", () => {
    const target = "export DB_HOST=localhost\nexport APP_KEY=base64:abc\n";
    const entries: MissingEntry[] = [
      { key: "DB_HOST", value: "prod" },
      { key: "NEW_VAR", value: "value" },
    ];
    const { actualEntries } = buildPatchPreview(target, entries);

    expect(actualEntries).toHaveLength(1);
    expect(actualEntries[0].key).toBe("NEW_VAR");
  });

  it("quotes values containing spaces", () => {
    const target = "APP_NAME=Test\n";
    const entries: MissingEntry[] = [
      { key: "APP_URL", value: "my app name" },
    ];
    const { preview } = buildPatchPreview(target, entries);

    expect(preview).toContain('APP_URL="my app name"');
  });

  it("quotes values containing hash characters", () => {
    const target = "APP_NAME=Test\n";
    const entries: MissingEntry[] = [
      { key: "SECRET", value: "abc#def" },
    ];
    const { preview } = buildPatchPreview(target, entries);

    expect(preview).toContain('SECRET="abc#def"');
  });

  it("adds trailing newline if target lacks one", () => {
    const target = "APP_NAME=Test";
    const entries: MissingEntry[] = [{ key: "NEW_KEY", value: "val" }];
    const { preview } = buildPatchPreview(target, entries);

    expect(preview).toMatch(/^APP_NAME=Test\n/);
    expect(preview).toContain("NEW_KEY=val");
  });

  it("handles empty target file", () => {
    const target = "";
    const entries: MissingEntry[] = [
      { key: "DB_HOST", value: "localhost" },
    ];
    const { preview, actualEntries } = buildPatchPreview(target, entries);

    expect(actualEntries).toHaveLength(1);
    expect(preview).toContain("DB_HOST=localhost");
  });

  it("ignores commented-out keys in target", () => {
    const target = "APP_NAME=Test\n# DB_HOST=old_value\n";
    const entries: MissingEntry[] = [
      { key: "DB_HOST", value: "localhost" },
    ];
    const { actualEntries } = buildPatchPreview(target, entries);

    expect(actualEntries).toHaveLength(1);
    expect(actualEntries[0].key).toBe("DB_HOST");
  });

  it("handles Windows line endings in target", () => {
    const target = "APP_NAME=Test\r\nDB_HOST=localhost\r\n";
    const entries: MissingEntry[] = [
      { key: "DB_HOST", value: "prod" },
      { key: "NEW_KEY", value: "value" },
    ];
    const { actualEntries } = buildPatchPreview(target, entries);

    expect(actualEntries).toHaveLength(1);
    expect(actualEntries[0].key).toBe("NEW_KEY");
  });
});

describe("computeDiff correctness", () => {
  it("shows no changes for identical content", () => {
    const text = "APP_NAME=Test\nDB_HOST=localhost\n";
    const diff = computeDiff(text, text);
    expect(diff).toHaveLength(0);
  });

  it("shows added lines for appended content", () => {
    const original = "APP_NAME=Test\n";
    const updated = "APP_NAME=Test\nDB_HOST=localhost\n";
    const diff = computeDiff(original, updated);
    const added = diff.filter((l) => l.type === "added");
    expect(added.length).toBeGreaterThanOrEqual(1);
    expect(added.some((l) => l.content === "DB_HOST=localhost")).toBe(true);
  });

  it("shows removed lines for deleted content", () => {
    const original = "APP_NAME=Test\nDB_HOST=localhost\n";
    const updated = "APP_NAME=Test\n";
    const diff = computeDiff(original, updated);
    const removed = diff.filter((l) => l.type === "removed");
    expect(removed.some((l) => l.content === "DB_HOST=localhost")).toBe(true);
  });

  it("handles Windows line endings without producing phantom diffs", () => {
    const text = "APP_NAME=Test\r\nDB_HOST=localhost\r\n";
    const diff = computeDiff(text, text);
    expect(diff).toHaveLength(0);
  });

  it("preview matches actual patch result for simple append", () => {
    const target = "APP_NAME=Test\nDB_HOST=localhost\n";
    const entries: MissingEntry[] = [
      { key: "CACHE_DRIVER", value: "redis" },
      { key: "QUEUE_CONNECTION", value: "sync" },
    ];
    const { preview, actualEntries } = buildPatchPreview(target, entries);
    const diff = computeDiff(target, preview);
    const addedLines = diff.filter((l) => l.type === "added");

    // Each entry produces one line + the comment header + blank separator line
    expect(addedLines.length).toBe(actualEntries.length + 2); // +1 blank line, +1 comment
  });

  it("preview matches when some entries are skipped", () => {
    const target = "APP_NAME=Test\nDB_HOST=localhost\n";
    const entries: MissingEntry[] = [
      { key: "DB_HOST", value: "prod" }, // already exists
      { key: "CACHE_DRIVER", value: "redis" }, // genuinely missing
    ];
    const { preview, actualEntries } = buildPatchPreview(target, entries);
    const diff = computeDiff(target, preview);
    const addedLines = diff.filter((l) => l.type === "added");

    expect(actualEntries).toHaveLength(1);
    // Blank separator + comment line + 1 entry
    expect(addedLines.length).toBe(3);
    expect(addedLines.some((l) => l.content.includes("CACHE_DRIVER"))).toBe(true);
    expect(addedLines.some((l) => l.content.includes("DB_HOST"))).toBe(false);
  });
});

describe("getMissingEntries consistency", () => {
  it("detects keys present in reference but absent from target", () => {
    const ref = makeSet("DB_HOST=prod\nDB_NAME=myapp\nCACHE=redis\n", { id: "ref", name: "production" });
    const target = makeSet("DB_HOST=localhost\n", { id: "target", name: "local" });
    const missing = getMissingEntries(ref, target);

    expect(missing).toHaveLength(2);
    const keys = missing.map((m) => m.key);
    expect(keys).toContain("CACHE");
    expect(keys).toContain("DB_NAME");
    expect(keys).not.toContain("DB_HOST");
  });

  it("returns empty when target has all reference keys", () => {
    const ref = makeSet("DB_HOST=prod\n", { id: "ref" });
    const target = makeSet("DB_HOST=localhost\n", { id: "target" });
    expect(getMissingEntries(ref, target)).toHaveLength(0);
  });
});
