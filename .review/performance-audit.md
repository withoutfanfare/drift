# Performance Audit — Drift (env-drift-manager)

**Auditor**: perf-auditor
**Date**: 2026-02-22
**Branch**: feature/vue-tailwind-spool
**Scope**: All composables, all Vue components, Rust backend, CSS

---

## Summary

The application is small in scope (env file manager, desktop app) and performance is generally acceptable. However, several algorithmic issues, localStorage anti-patterns, and a fundamentally broken diff algorithm have been identified. The most critical issue is the O(n²) `computeDiff` function that produces semantically wrong results and scales poorly for large env files.

---

## CRITICAL Issues

---

## [CRITICAL] computeDiff uses O(n²) linear-scan membership checks — produces wrong results

**File**: `src/composables/useDiff.ts:25-30`
**Category**: algorithm
**Current complexity**: O(n²) — `newLines.includes(oldLine)` is O(n) called inside an O(n) loop
**Description**:
The diff algorithm iterates over `maxLen` lines and for each non-matching pair calls `newLines.includes(oldLine)` and `oldLines.includes(newLine)`. `Array.includes` is O(n) so the total complexity is O(n²).

More critically, the algorithm is logically incorrect: it is a positional comparison, not an edit-distance diff. It compares lines by index, then suppresses removed/added lines using a global membership check. This means:

1. A line that was moved to a different position will appear as neither added nor removed (because `includes` finds it elsewhere).
2. A line that appears more than once (e.g. blank lines, comments) will be suppressed incorrectly.
3. Context lines are shown for the wrong positions.

```typescript
// useDiff.ts:25-30
if (oldLine !== undefined && !newLines.includes(oldLine)) {  // O(n) scan in O(n) loop = O(n²)
    result.push({ type: "removed", content: oldLine, lineNumber: lineNum });
}
if (newLine !== undefined && !oldLines.includes(newLine)) {  // O(n) scan in O(n) loop = O(n²)
    result.push({ type: "added", content: newLine, lineNumber: lineNum });
}
```

**Estimated impact**: For a 500-line env file, this is 250,000 iterations. More importantly the display shown in the `DiffPreview` modal can misrepresent what will actually be written to disk, which is a correctness hazard for a tool that modifies production files.

**Recommendation**: Replace with a standard Myers diff algorithm or at minimum a Set-based O(n) approach for the specific use-case of append-only patches. For the append-only `requestPatch` flow, the diff is always "show appended lines at the bottom" — a specialised renderer would be both faster and correct. For the general case, consider a LCS-based implementation using a `Map<string, number[]>` for O(n log n) performance.

---

## HIGH Priority Issues

---

## [HIGH] analyzeRows recomputes on every currentSets reactive change — no memoisation

**File**: `src/App.vue:23`
**Category**: rendering
**Current complexity**: O(k × n) where k = total keys across all sets, n = number of sets
**Description**:
`analyzeRows` is called inside a top-level `computed()`:

```typescript
// App.vue:23
const analysis = computed(() => analyzeRows(currentSets.value));
```

`currentSets` is itself a computed from `envSets` that also calls `.sort()` on every access. Every time any env set is mutated (including in-memory edits via `applyRawToSet`), the entire analysis runs again — rebuilding the key union set, normalising every value for comparison, and running the `evaluateUnsafe` regex battery per key per set.

For a project with 5 env files of 100 keys each, `analyzeRows` performs:
- 500 `Object.keys()` iterations to build the key set
- 500 `normalizeForComparison` calls
- 500 `evaluateUnsafe` calls (each runs up to 9 regex/string comparisons)
- 1 full `.sort()` on the key array

This runs synchronously on the main thread and repeats on every inline edit (e.g. each keystroke in the edit panel triggers `applyRawToSet` → `persistSets` → mutates `envSets` → invalidates `currentSets` → invalidates `analysis`).

**Estimated impact**: Perceptible jank (50–200ms) during inline editing on projects with many keys. Compounds with the `persistSets` localStorage write described below.

**Recommendation**: The `analysis` computed is already memoised by Vue's reactivity system, so it only re-runs when `currentSets` changes. The deeper issue is that `applyRawToSet` mutates the reactive `envSets` array on every inline edit, which re-triggers the full analysis chain. Consider debouncing `applyRawToSet` or separating the "pending edit" state from the committed `envSets` state so analysis only re-runs after an explicit save.

---

## [HIGH] localStorage written on every inline key edit — synchronous, unbounded

**File**: `src/composables/useEnvSets.ts:65-76`, `src/composables/useActivityLog.ts:20-22`
**Category**: io
**Current complexity**: O(1) per call but called on every keystroke path
**Description**:
`persistSets()` calls `localStorage.setItem(SET_STORAGE_KEY, JSON.stringify(payload))` synchronously. This is called from:
- `addOrReplaceSet` — called from `applyRawToSet` on every inline edit
- `removeSet`, `clearProjectSets`

`persistEntries()` in `useActivityLog` similarly calls `localStorage.setItem` on every `log()` call, which fires after every inline edit.

For a project with 5 sets of 200 keys each, the JSON payload for `envSets` includes all `rawText` fields (the full env file content), potentially 5 × 5KB = 25KB serialised and written on every edit event. With the activity log, two synchronous `localStorage.setItem` calls happen per edit.

Additionally, `useActivityLog:47` performs a `entries.value.slice(0, MAX_ENTRIES)` to trim to 200 entries — this creates a new array on every log entry.

```typescript
// useEnvSets.ts:65-76
function persistSets() {
  const payload: PersistedSet[] = envSets.value.map((s) => ({  // full rawText included
    ...
    rawText: s.rawText,
  }));
  localStorage.setItem(SET_STORAGE_KEY, JSON.stringify(payload));  // synchronous, every edit
}
```

**Estimated impact**: 5–20ms blocking writes per edit event. Accumulates on rapid edits (e.g. typing in the inline editor). On slower machines this is the primary source of UI jank.

**Recommendation**: Debounce `persistSets` with a 300–500ms trailing debounce. The data is not safety-critical at edit-time; it only needs to be durably persisted before the window closes. For the activity log, the trim allocation can be avoided by capping at insertion time with `if (entries.value.length >= MAX_ENTRIES) entries.value.pop()` instead of `slice`.

---

## [HIGH] WarningsList.vue rebuilds Set<EnvRole> and re-runs full evaluateUnsafe on every render

**File**: `src/components/comparison/WarningsList.vue:10-35`
**Category**: rendering / algorithm
**Current complexity**: O(sets × requiredKeys) = O(n × 7) per render, called inside a `computed`
**Description**:
The `warnings` computed builds a new `Set<EnvRole>` from `props.sets.map(...)`, then iterates every set and creates a `new Set<string>([...Object.keys(set.values), ...requiredKeys])` for each set, then calls `evaluateUnsafe` for every key in that union set.

The expensive part is the inner `allKeys` construction:

```typescript
// WarningsList.vue:19-24
const requiredKeys = ["APP_KEY", "APP_DEBUG", ...];  // new array literal on every computed call
const allKeys = new Set<string>([...Object.keys(set.values), ...requiredKeys]);  // spread into Set every time

for (const key of allKeys) {
  const reason = evaluateUnsafe(set, key, set.values[key]);  // runs regex battery per key
```

The `requiredKeys` array is recreated as a literal on every computed invocation instead of being defined as a module-level constant. The `allKeys` Set construction uses spread syntax which allocates a new array before the Set constructor consumes it.

**Estimated impact**: Minor per-invocation but this computed re-runs whenever `props.sets` changes (same trigger as the full analysis). The redundancy with `analyzeRows` (which also calls `evaluateUnsafe` for every key) means the `evaluateUnsafe` regex battery runs twice per set per key on every analysis refresh.

**Recommendation**: Hoist `requiredKeys` to module scope as `const`. Extract unsafe warnings from the already-computed `analysis` rows (passed as a prop from `App.vue`) instead of re-running `evaluateUnsafe` independently. This eliminates the duplicate computation entirely.

---

## [HIGH] currentSets computed calls .sort() on every access via Object.keys comparison

**File**: `src/composables/useEnvSets.ts:56-63`
**Category**: rendering
**Current complexity**: O(n log n) per invalidation
**Description**:
```typescript
// useEnvSets.ts:56-63
const currentSets = computed(() =>
  envSets.value
    .filter((s) => s.projectId === activeProjectId.value)
    .sort(
      (a, b) =>
        roleSort(a.role) - roleSort(b.role) || a.name.localeCompare(b.name),
    ),
);
```

This runs on every mutation to `envSets`. The `.filter()` produces a new array every time, then `.sort()` sorts in-place on that new array. While correct, the combined allocation is O(n) for filter + O(n log n) for sort, and this triggers the downstream `analysis` computed immediately.

For a typical 3–10 set project this is negligible, but the pattern of producing a new sorted array on every edit (including the `parseEnv` re-parse inside `applyRawToSet`) creates an unnecessary cascade.

**Estimated impact**: Low on typical data sizes. The cascade effect (currentSets → analysis → KpiBar re-render + ComparisonTable re-render) is the real concern.

**Recommendation**: The sort order is stable for the use-case; env sets don't change role mid-session. Consider caching the sorted order and only re-sorting when role or name changes, not on value mutations.

---

## MEDIUM Priority Issues

---

## [MEDIUM] ComparisonTable watch joins all row keys into a string for collapse detection

**File**: `src/components/comparison/ComparisonTable.vue:22-25`
**Category**: rendering
**Current complexity**: O(n) string allocation per render cycle
**Description**:
```typescript
// ComparisonTable.vue:22-25
watch(
  () => props.rows.map((r) => r.key).join("\0"),
  () => { expandedKey.value = null; },
);
```

On every render where `rows` changes (any filter, search, or edit), this allocates a new array via `.map()`, then concatenates all keys into a single string with `.join()`. For 200 keys this is a 2KB+ string allocation on every filter keystroke.

**Estimated impact**: ~1ms per keystroke on large datasets. Adds up on fast typing.

**Recommendation**: Replace with a watch on `props.rows.length` or a computed `Set` of keys compared by size. The intent is to detect when the set of visible keys changes — checking the count is sufficient for the "collapse on filter change" behaviour.

---

## [MEDIUM] DiffPreview runs computeDiff twice — once for diffLines, once for addedCount/removedCount

**File**: `src/components/comparison/DiffPreview.vue:20-22`
**Category**: rendering
**Current complexity**: O(n²) × 3 derived computeds
**Description**:
```typescript
// DiffPreview.vue:20-22
const diffLines = computed(() => computeDiff(props.original, props.updated));
const addedCount = computed(() => diffLines.value.filter((l) => l.type === "added").length);
const removedCount = computed(() => diffLines.value.filter((l) => l.type === "removed").length);
```

`diffLines` computes once and is correctly shared. However `addedCount` and `removedCount` each call `.filter()` independently — a second and third pass over the diff result. These can be derived in a single pass.

**Estimated impact**: Trivial for small diffs. The dominant cost is the O(n²) `computeDiff` itself.

**Recommendation**: Compute counts inside a single `computed` that returns `{ lines, addedCount, removedCount }` from a single pass.

---

## [MEDIUM] useMasking: isSensitiveKey runs 13 regex tests on every cell render

**File**: `src/composables/useMasking.ts:41-43`, called from `ComparisonTableRow.vue`
**Category**: rendering
**Current complexity**: O(patterns) = O(13) per cell per render cycle
**Description**:
```typescript
// useMasking.ts:41-43
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}
```

`SENSITIVE_PATTERNS` has 13 regex patterns. `isSensitiveKey` is called from `ComparisonTableRow.vue` in two places per cell per set column — once in the template for the lock icon and once via `shouldMask`/`cellIsMasked`. For a table with 100 rows × 5 sets = 500 calls × 13 regex tests = 6,500 regex evaluations per render cycle.

The patterns use `/i` flag (case-insensitive) which prevents V8 from using optimised fast-path regex matching.

**Estimated impact**: Measurable on large tables. Regex compilation is cached but execution still costs ~1µs each = ~6.5ms per full render.

**Recommendation**: Precompute a memoised `isSensitiveKey` using a `Map<string, boolean>` cache. Keys are stable identifiers that don't change at runtime — the result for any given key is always the same. Cache the result on first evaluation.

```typescript
const sensitiveKeyCache = new Map<string, boolean>();
function isSensitiveKey(key: string): boolean {
  if (sensitiveKeyCache.has(key)) return sensitiveKeyCache.get(key)!;
  const result = SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
  sensitiveKeyCache.set(key, result);
  return result;
}
```

---

## [MEDIUM] analyzeRows builds a new Set<string> of normalised values for every key × set combination

**File**: `src/composables/useAnalysis.ts:18-30`
**Category**: algorithm / memory
**Current complexity**: O(k × n) allocations where k = keys, n = sets
**Description**:
For every key, `analyzeRows` creates a new `Set<string>` (`normalizedValues`) to detect drift:

```typescript
// useAnalysis.ts:18-19
const normalizedValues = new Set<string>();
const unsafeReasons: string[] = [];
```

For 200 keys × 5 sets this is 200 `Set` allocations and 200 `Array` allocations per `analyzeRows` call. The `[...keySet].sort()` on line 15 also spreads the entire key Set into a temporary array before sorting.

**Estimated impact**: GC pressure on large env files. Each `analyzeRows` call creates ~400 short-lived objects. In a Tauri/Chromium context GC pauses are infrequent but this pattern compounds with the reactive cascade described above.

**Recommendation**: Reuse a single pre-allocated array/set instead of allocating per-key. For drift detection, two distinct normalised values are sufficient to set `drift = true` — the loop can short-circuit after finding the second unique value.

---

## [MEDIUM] Rust: collect_bak_files performs two stat calls per file (metadata + is_file)

**File**: `src-tauri/src/lib.rs:410-436`
**Category**: io
**Current complexity**: O(files) with 2 syscalls per file
**Description**:
```rust
// lib.rs:411-414
if path.is_file() && name.contains(".bak.") {
    let metadata = fs::metadata(&path).ok();
```

`path.is_file()` performs a `stat()` syscall. Then `fs::metadata(&path)` immediately performs another `stat()` syscall on the same path. This doubles the I/O for every file in the scanned tree.

**Estimated impact**: For a project with 50 .bak files this is 100 stat syscalls instead of 50. On network-mounted filesystems or slow disks this is noticeable.

**Recommendation**: Use `entry.metadata()` (available from `DirEntry`) to retrieve file type and metadata in a single operation, as is already done in `collect_env_files` (line 464 uses `entry.file_type()`).

```rust
// Replace:
if path.is_file() && name.contains(".bak.") {
    let metadata = fs::metadata(&path).ok();
// With:
if let Ok(ft) = entry.file_type() {
    if ft.is_file() && name.contains(".bak.") {
        let metadata = entry.metadata().ok();
```

---

## [MEDIUM] ActivityTimeline.formatTime recomputes "now" inside render — no memoisation

**File**: `src/components/layout/ActivityTimeline.vue:14-25`
**Category**: rendering
**Description**:
```typescript
function formatTime(timestamp: number): string {
  const now = Date.now();  // called every time any item renders
  const diff = now - timestamp;
```

`formatTime` is a plain function called in `v-for` template expressions. `Date.now()` is called once per entry per render cycle. For 50 entries this is 50 `Date.now()` calls per render. While individually cheap (~0.1µs), it will cause the displayed "X minutes ago" text to be slightly inconsistent across entries rendered in the same cycle.

**Estimated impact**: Negligible performance impact. Minor display consistency issue.

**Recommendation**: Compute `const now = Date.now()` once outside the function and pass as a parameter, or use a computed `currentTime` ref updated by a `setInterval`.

---

## [MEDIUM] buildMergedTemplate builds a new Set per key to detect unique values

**File**: `src/composables/useTemplates.ts:46`
**Category**: algorithm / memory
**Description**:
```typescript
// useTemplates.ts:46
const uniqueValues = new Set(present.map((entry) => normalizeForComparison(entry.value)));
```

For each key, this creates a temporary array via `.map()` then passes it to the `Set` constructor. For 200 keys × 5 sets, this is 200 Set allocations and 200 Array allocations. These are short-lived but generate GC pressure.

**Estimated impact**: Minor. `buildMergedTemplate` is only called on explicit "Export .env" action.

**Recommendation**: Reuse a single `Set` that is cleared between iterations. Or use a simple string comparison for the 2-set case (common scenario).

---

## LOW Priority Issues

---

## [LOW] KpiBar.vue: driftCount and unsafeCount each make a separate .filter() pass

**File**: `src/components/kpi/KpiBar.vue:10-11`
**Category**: algorithm
**Description**:
```typescript
const driftCount = computed(() => props.analysis.filter((r) => r.drift).length);
const unsafeCount = computed(() => props.analysis.filter((r) => r.unsafe).length);
```

Two separate filter passes over the analysis array when a single pass would produce both counts. For 200 rows this is 400 iterations instead of 200.

**Recommendation**: Combine into a single computed:
```typescript
const counts = computed(() => {
  let drift = 0, unsafe = 0;
  for (const r of props.analysis) {
    if (r.drift) drift++;
    if (r.unsafe) unsafe++;
  }
  return { drift, unsafe };
});
```

---

## [LOW] AmbientBackground.vue: three large blurs running CSS animations concurrently

**File**: `src/components/layout/AmbientBackground.vue`
**Category**: css
**Description**:
Three `blur(120px)` elements are animated simultaneously with `animate-blob-drift` (22s infinite). The `blur` filter is GPU-composited but creates three separate stacking contexts and three compositor layers. On lower-end systems or when other compositing operations are active, this can reduce frame rates.

The component correctly uses `pointer-events-none` and `aria-hidden` to avoid layout impact. The `@media (prefers-reduced-motion: reduce)` rule in `main.css` correctly disables animations.

**Estimated impact**: Minimal on modern hardware. May affect battery life on mobile-class processors.

**Recommendation**: Consider reducing to two blobs or reducing blur radius to 80px. No immediate action needed.

---

## [LOW] Rust: write_project_backup uses serde_json::to_string_pretty for large payloads

**File**: `src-tauri/src/lib.rs:327-328`
**Category**: io / memory
**Description**:
```rust
let content = serde_json::to_string_pretty(&payload)
```

`to_string_pretty` adds significant overhead for large payloads (indentation, newlines). For a project with 5 env files of 200 lines each, the pretty-printed JSON is noticeably larger than compact JSON, increasing both serialisation time and backup file size. Backup files don't need to be human-readable as they are system-generated.

**Recommendation**: Use `serde_json::to_string(&payload)` for backup files. If human readability is desired, consider only pretty-printing on explicit export operations.

---

## [LOW] useProjects: projects.value.find() scans entire array for activeProject computed

**File**: `src/composables/useProjects.ts:50-52`
**Category**: algorithm
**Description**:
```typescript
const activeProject = computed(() =>
  projects.value.find((p) => p.id === activeProjectId.value),
);
```

`Array.find` is O(n). For a typical 1–5 projects array this is negligible. However, `activeProject` is a computed that's accessed in many places and re-evaluated whenever `projects` or `activeProjectId` changes. A `Map<string, ProjectProfile>` indexed by id would provide O(1) lookup.

**Recommendation**: Low priority given the small expected array size. Add only if project count grows.

---

## [LOW] Rust: list_project_backups calls fs::metadata separately after checking is_file

**File**: `src-tauri/src/lib.rs:364-365`
**Category**: io
**Description**:
Same double-stat pattern as in `collect_bak_files` — `path.is_file()` followed by `fs::metadata(&path)`.

---

## CSS Performance Notes

**File**: `src/styles/main.css`

The CSS is well-structured with no critical performance issues:

- `backdrop-filter: blur(24px) saturate(1.4)` on `.glass-card` triggers GPU compositing for each card. On a typical dashboard with 2–3 cards, this is 2–3 compositor layers. Acceptable.
- No complex CSS selectors (specificity is low, selectors are short).
- `@media (prefers-reduced-motion)` is correctly implemented.
- Custom scrollbar styles use standard `-webkit-scrollbar` pseudoelements — no performance concern.
- `color-mix(in srgb, ...)` in `.glass-card` is a modern CSS function with broad support; no polyfill cost.

The only concern is the three concurrent `backdrop-filter` + three concurrent `blur(120px)` layers from `AmbientBackground.vue` combined with glass card backdrops. In a worst case (3 blobs + 3 cards) this is 6 GPU compositor layers. This is within normal bounds for a desktop Tauri app.

---

## Rust Performance Notes

**File**: `src-tauri/src/lib.rs`

Overall the Rust code is well-written with appropriate data structures:

- `parse_env_keys` correctly uses `HashSet<String>` for O(1) lookup in `append_missing_env_keys`.
- `atomic_write` using a temp file + rename is correct and avoids data corruption.
- `collect_env_files` recursion is depth-bounded at 8 and correctly skips large files (>1.5MB).
- `format_env_value` allocates a new `String` via `chars().filter().collect()` for every value — this is unavoidable for the sanitisation step.
- `sanitize_filename` correctly pre-allocates with `String::with_capacity`.
- The `upsert_env_key` function collects all lines into a `Vec<String>` via `.map(|line| line.to_string())` — the `.to_string()` call clones every line even for non-matching lines. Using `Cow<str>` would avoid this allocation for unchanged lines. Low impact for typical env file sizes.

No critical Rust performance issues found.

---

## Reactive Cascade Summary

The most impactful performance path in the application:

```bash
User types in inline editor
  → emit('applyMemory', ...)
  → onApplyMemory in ComparisonCard
  → upsertEnvKeyInRaw() — O(n) line scan
  → applyRawToSet(target, result) in useEnvSets
      → parseEnv(rawText) — O(n) parse
      → set.rawText = rawText
      → set.values = values
      → persistSets() — JSON.stringify + localStorage.setItem (synchronous, ~5-20ms)
  → envSets mutation triggers currentSets computed invalidation
  → currentSets re-runs: .filter() + .sort() — O(n log n)
  → analysis computed invalidation
  → analyzeRows(currentSets.value) — O(k × n) full rebuild
      → per-key: new Set<string>(), new string[], normalizeForComparison(), evaluateUnsafe()
  → Vue re-renders: KpiBar, ComparisonCard, ComparisonTable, all ComparisonTableRow instances
      → useMasking.isSensitiveKey() — 13 regex tests per cell
      → WarningsList re-runs its warnings computed — duplicate evaluateUnsafe calls
```

**Total estimated cost per inline edit on a 5-set / 200-key project**: 10–40ms
**Primary bottleneck**: Synchronous `localStorage.setItem` + full `analyzeRows` rebuild.

---

## Recommendations by Priority

| Priority | Finding | Effort | Impact |
|---|---|---|---|
| Critical | Replace broken O(n²) diff algorithm | Medium | High (correctness + perf) |
| High | Debounce `persistSets` / `persistEntries` | Low | High (eliminates main jank) |
| High | Decouple inline edits from `analyzeRows` recalculation | Medium | High |
| High | Extract warnings from existing analysis data | Low | Medium |
| Medium | Cache `isSensitiveKey` results | Low | Medium |
| Medium | Fix double-stat calls in Rust file scan | Low | Low-Medium |
| Medium | Single-pass counts in DiffPreview | Low | Low |
| Low | KpiBar single-pass filter | Low | Negligible |
| Low | Use compact JSON for backups | Trivial | Low |
