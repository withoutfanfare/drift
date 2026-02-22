# Vue Frontend Bug Hunt and Reactivity Audit

**Reviewer**: vue-auditor
**Date**: 2026-02-22
**Scope**: All files under `src/composables/`, `src/components/`, and `src/types/index.ts`

---

## [HIGH] Finding 1: `onRevertMemory` silently drops reverts for added keys

**File**: `src/components/comparison/ComparisonCard.vue:251`
**Category**: bug
**Description**: `onRevertMemory` returns early when `original === undefined`, treating it as "was added, not changed". However `sessionEdits.value.get(mapKey)` also returns `undefined` when the key does not exist in the map at all. The guard at line 251 (`if (original === undefined) return`) will also fire when a key was genuinely mapped but its original value was an empty string stored as `undefined` semantically. More critically, the function can be called on a key that was `wasAdded()` via the `canRevert` guard in the template — but a separate codepath in `ComparisonTableRow` only shows `Revert` when `canRevert(setId)` is true, which requires `!wasAdded()`. So the guard is defensively correct in that path. However the gap remains: the comment says "was added, not changed — skip revert", but when the original value was legitimately `""` (empty string), `get()` returns `""` not `undefined`, so that is fine. The real bug is that the function does **not** delete the session edit entry for an added key even after it was displayed via `wasAdded` rendering — if the user clicks Revert on a row where the key no longer matches `canRevert` the function silently exits without user feedback.

**Impact**: User can enter a state where an added key shows a stale "edited" ring in the UI with no way to clear it — the session edit entry persists forever unless the project is switched or the page is refreshed.
**Recommendation**: Add an else branch that handles the "key was added, revert means delete from set" case. If reverting an added key is not supported, disable the Revert button explicitly instead of silently doing nothing.

---

## [HIGH] Finding 2: `computeDiff` uses a naïve positional diff that produces incorrect results

**File**: `src/composables/useDiff.ts:15–35`
**Category**: bug
**Description**: The diff algorithm compares old and new lines by their **index position** rather than using an LCS (Longest Common Subsequence) or Myers diff. When a single line is inserted near the top of the file, every subsequent line shifts by one position, so all shifted lines are incorrectly flagged as "removed" (old line not in new array) and "added" (new line not in old array), even though they are unchanged. The secondary check `!newLines.includes(oldLine)` is a full-array scan per line (O(n²)) and will produce false negatives for files with duplicate lines — a common pattern in `.env` files (e.g. `APP_NAME=Laravel` may appear identically across many sets).

**Impact**: The diff preview shown before writing a file will mislead users. A patch that only appends new keys at the bottom can appear to "remove" and "re-add" context lines that happen to appear at different indices.
**Recommendation**: Replace with a proper LCS-based diff or use a well-tested library. At minimum, build an index of line contents to avoid the O(n²) includes scan.

---

## [HIGH] Finding 3: `useProjects` — `loadProjectsFromStorage` writes default data without try/catch around `localStorage.setItem`

**File**: `src/composables/useProjects.ts:18–34`
**Category**: edge-case
**Description**: When no projects exist in storage, `loadProjectsFromStorage` calls `localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(initial))` without any error handling. If localStorage is full or restricted (private browsing quotas, sandboxed WebView), this throws a `QuotaExceededError` or `SecurityError`. The same unguarded `setItem` call exists in `persistProjects()` at line 55, `saveActiveProjectId()` at line 60, `loadSetsFromStorage` indirectly (same pattern in `useEnvSets`), `persistSets()` (line 75 `useEnvSets`), and `persistEntries()` (line 21 `useActivityLog`).

**Impact**: Unhandled exception crashes the app's data layer silently — the Tauri WebView will show a blank or broken UI with no user-facing error. Any subsequent read will return the old (possibly corrupt) state.
**Recommendation**: Wrap all `localStorage.setItem` calls in try/catch. At minimum apply the pattern to the persistence functions (`persistProjects`, `persistSets`, `persistEntries`).

---

## [MEDIUM] Finding 4: `useFilters` module-level state leaks across project switches

**File**: `src/composables/useFilters.ts:4–7`
**Category**: reactivity / state management
**Description**: `filter`, `search`, `referenceSetId`, and `targetSetId` are defined at module level (singleton state). However, `useFilters` is **not used** in `ComparisonCard.vue` — the card defines its own local `filter`, `search`, `referenceSetId`, and `targetSetId` refs instead (lines 31–34 of `ComparisonCard.vue`). This means the module-level state in `useFilters` is orphaned and never shared with the component that manages filtering. The `watch(activeProjectId, ...)` reset in `ComparisonCard.vue` at line 67 correctly resets the local refs, but if any other component ever imports `useFilters` it will receive stale state because there is no equivalent reset in the composable itself.

**Impact**: Dead code risk today; potential stale state bug if `useFilters` is ever wired up. The mismatch creates confusion about the intended state management pattern.
**Recommendation**: Either remove `useFilters` if it is never used, or replace the local refs in `ComparisonCard` with the composable and add a watcher to reset state on project change inside the composable.

---

## [MEDIUM] Finding 5: `shallowRef` on `sessionEdits` Map causes missed reactivity updates

**File**: `src/components/comparison/ComparisonCard.vue:43`
**Category**: reactivity
**Description**: `sessionEdits` is declared as `shallowRef(new Map<string, string | undefined>())`. The code correctly creates a new Map on each mutation (lines 49–51, 259–261, 276–280), which triggers shallow ref updates. However in `ComparisonTableRow.vue` at lines 52–74, the prop `sessionEdits` is a `Map` received as a plain prop — Vue does not track mutations of plain objects/Maps passed as props. Because `shallowRef` triggers only on ref replacement (`.value = ...`), and the parent correctly replaces the map, the child will re-render. But because `sessionEdits` is typed as `Map<string, string | undefined>` (not a `Ref`), there is no guarantee the child's computed-like template expressions re-evaluate when the ref is replaced — the prop itself is the Map value, and Vue tracks prop changes, so this is mostly safe. The risk is in `isEdited`, `wasAdded`, `canRevert`, `originalValue`, `hasValueChange` — all read `props.sessionEdits.get(...)` directly in the template without going through a computed. Vue will re-render on prop change, but if the parent updates the Map without replacing the `shallowRef.value` (a future mistake), the UI silently goes stale.

**Impact**: Currently works but is fragile. A developer adding a mutation like `sessionEdits.value.set(...)` directly instead of replacing the map will introduce a silent reactivity bug with no error.
**Recommendation**: Either use `reactive(new Map(...))` with `markRaw` for the Map contents, or add a JSDoc comment clearly documenting the "always replace, never mutate" invariant. A lint rule or TypeScript utility type (readonly Map) would enforce it.

---

## [MEDIUM] Finding 6: `onSaveProject` auto-scan race condition on rapid saves

**File**: `src/components/project/ProjectManagementCard.vue:32–46`
**Category**: edge-case / race condition
**Description**: `onSaveProject` calls `saveProject(name, rootPath)` which synchronously updates `activeProject`, then immediately calls `await onScan()` if `props.sets.length === 0`. The `scanning` ref is set to `true` inside `onScan`. If the user clicks "Save project" twice in rapid succession before the first scan completes, the second invocation will also pass the `props.sets.length === 0` check (sets haven't loaded yet) and trigger a second concurrent scan. Both scans will call `addOrReplaceSet` concurrently, potentially producing duplicate entries if `addOrReplaceSet`'s deduplication logic races between the two scan results.

**Impact**: Duplicate env set entries in localStorage. The comparison table would show the same file twice, doubling key counts and producing spurious "drift" or "missing" results.
**Recommendation**: Check `scanning.value` before triggering the auto-scan: `if (!scanning.value && props.sets.length === 0) await onScan()`.

---

## [MEDIUM] Finding 7: `triggerFileInput` in `ProjectManagementCard` creates a detached DOM element

**File**: `src/components/project/ProjectManagementCard.vue:189–201`
**Category**: memory-leak / edge-case
**Description**: `triggerFileInput()` creates a new `<input type="file">` element, attaches a `change` event listener, and calls `input.click()`. The element is never attached to the DOM and is never explicitly cleaned up. While modern browsers GC detached DOM nodes, the event listener holds a closure reference to `onLoadFiles`, which references the component scope. If `click()` is called but the user cancels the dialog, the file input and its listener remain in memory until the next GC cycle. More problematically, if the function is called multiple times before the dialog resolves (rapid clicking), multiple detached inputs with listeners accumulate. There is also a separate `fileInputRef` in `FileUploadActions.vue` that provides a proper template-bound `<input>` — the `triggerFileInput` function duplicates that mechanism unnecessarily.

**Impact**: Minor memory pressure; no functional bug in normal use. The `accept` attribute is also inconsistently set: `triggerFileInput` uses `.env,.txt` but `FileUploadActions` also uses `.env,.txt` — consistent but the `multiple` attribute differs depending on which path is used.
**Recommendation**: Remove `triggerFileInput` from `ProjectManagementCard` and emit a `loadFiles` event to `FileUploadActions` instead, or expose the `fileInputRef.click()` via a child component ref.

---

## [MEDIUM] Finding 8: `BackupBrowser` — `loadBackups` not awaited and errors silently swallowed

**File**: `src/components/project/BackupBrowser.vue:28–34`
**Category**: edge-case
**Description**: In the `watch` callback at line 28, `loadBackups()` is called without `await` — the watcher callback is not `async`, so the Promise is fire-and-forget. If `loadBackups` throws (which it can't because it catches internally), or if the project changes again before the first load completes, the `backups.value = []` reset at line 31 might execute after the completed load, clearing valid data. More subtly: when the project changes while a load is in-flight, the finally block of the old load will set `loading.value = false` after the new load has set it to `true`, making the spinner disappear prematurely.

**Impact**: Race condition when switching projects quickly — the backup list may show an incorrect "No backups found" state or the loading indicator disappears before results arrive.
**Recommendation**: Add a cancellation token/guard (e.g. check `activeProject.value?.id` at the end of the load against the ID that started it) or make the watcher async.

---

## [MEDIUM] Finding 9: `maskValue` logic is inverted — always masks sensitive keys regardless of `globalMasked`

**File**: `src/composables/useMasking.ts:45–49`
**Category**: bug
**Description**: The `maskValue` function reads:
```ts
if (SAFE_VALUES.has(value.toLowerCase())) return value;
if (!globalMasked.value && !isSensitiveKey(key)) return value;
return MASK_PLACEHOLDER;
```
When `globalMasked` is `false` (user clicked "Reveal values"), the second condition `!globalMasked.value && !isSensitiveKey(key)` is only true when the key is *not* sensitive. This means sensitive keys (matching `SENSITIVE_PATTERNS`) are **always** masked even when the user explicitly disables masking. The `shouldMask` function at lines 51–55 handles this correctly: it returns `true` for sensitive keys regardless of `globalMasked`, which is intentional for security. However `maskValue` is the display function and the always-masked behaviour contradicts the UI affordance of a "Reveal values" button that implies all values become visible. The `revealedCells` mechanism in `ComparisonTableRow` provides per-cell reveal, but that only works if `shouldMask` is used, not `maskValue`.

**Impact**: UX inconsistency — toggling the "Reveal values" button does not reveal sensitive keys. This matches the `shouldMask` logic and may be intentional security hardening, but if so `maskValue` and `shouldMask` should be documented as intentionally different. If unintentional, the toggle button is misleading.
**Recommendation**: Clarify intent in a comment. If the design is "always mask sensitive keys even when globally unmasked", rename `toggleMasking` and the button title to "Mask non-sensitive values" to set correct expectations. If the intent is "reveal everything when user requests it", add explicit per-cell reveal support for sensitive keys via `revealedCells`.

---

## [MEDIUM] Finding 10: `useEnvSets.addOrReplaceSet` mutates existing object properties directly, bypassing Vue reactivity

**File**: `src/composables/useEnvSets.ts:100–108`
**Category**: reactivity
**Description**: When an existing set is found (`if (existing)`), its properties are mutated directly:
```ts
existing.name = input.name;
existing.source = input.source;
// ...
```
Because `envSets` is a `ref<EnvSet[]>`, the array items are plain objects, not reactive proxies. Direct property mutation on array items of a `ref<T[]>` **does not trigger reactivity** unless the array itself is watched deeply. Components that use `currentSets` (a `computed`) will re-compute when `envSets.value` changes, but since the array reference itself doesn't change here (no `.splice` or `.push`), Vue may not detect the mutation. In practice Vue 3's `ref` wraps values with a Proxy, so nested object mutations *are* tracked — but only when accessed through `.value`. Since `existing` is extracted as a local variable before mutation, the Proxy tracking is preserved **only** if `existing` still points to the Proxy-wrapped object. In Vue 3 this works correctly because `ref([...])` creates a reactive proxy for the entire nested structure. However this is a subtle reliance on Vue's deep reactive behaviour and is fragile if the code is ever refactored.

**Impact**: Currently works due to Vue 3's deep reactivity on `ref`. If this were migrated to `shallowRef` (as `sessionEdits` was), it would silently break.
**Recommendation**: Document that `envSets` must remain a deep `ref` (not `shallowRef`) for mutation semantics. Consider using `envSets.value = [...envSets.value]` after mutation to make the trigger explicit, or use `reactive()` for the array.

---

## [MEDIUM] Finding 11: `useActivityLog` — `persistEntries` called on every log entry, including rapid bursts

**File**: `src/composables/useActivityLog.ts:44–51`
**Category**: performance / edge-case
**Description**: Every call to `log()` immediately calls `persistEntries()`, which synchronously serialises up to 200 `ActivityEntry` objects to JSON and writes to localStorage. In event-heavy sequences (e.g. a folder scan that adds 10+ env files in a loop), this triggers 10+ synchronous JSON serialisations and localStorage writes in the same tick.

**Impact**: Noticeable jank on lower-end machines during bulk operations. localStorage writes are synchronous and block the main thread.
**Recommendation**: Debounce `persistEntries` with a short delay (e.g. 300ms) so rapid consecutive log calls coalesce into a single write.

---

## [MEDIUM] Finding 12: `ComparisonCard` — `executePatch` re-computes `getMissingEntries` after user dismisses preview

**File**: `src/components/comparison/ComparisonCard.vue:183–202`
**Category**: bug / edge-case
**Description**: `requestPatch` builds the preview using `getMissingEntries(referenceSet.value, targetSet.value)` and stores the result in `patchPreviewUpdated`. Then `executePatch` (called after user confirms) calls `getMissingEntries` **again**. If the user takes a long time before confirming, or if another async operation modifies the set in the background between `requestPatch` and `executePatch`, the second `getMissingEntries` call may return a different list. The list passed to `appendMissingEnvKeys` could differ from what was shown in the diff preview.

**Impact**: User approves a diff showing N keys, but a different number of keys is actually written. Low probability in normal use, but the discrepancy breaks the "review before you write" safety guarantee.
**Recommendation**: Capture the `entries` array in `requestPatch` and pass it to `executePatch` via a component-level ref (e.g. `pendingPatchEntries`) rather than recomputing.

---

## [LOW] Finding 13: `App.vue` — `ComparisonCard` receives `filteredRows` prop that duplicates `analysis`

**File**: `src/App.vue:125–129`
**Category**: type-safety / maintainability
**Description**: `ComparisonCard` is called with both `:analysis="analysis"` and `:filtered-rows="analysis"` — the same value passed for both props. Looking at `ComparisonCard`'s prop definition (line 21–25), it accepts `filteredRows: KeyAnalysisRow[]` but internally applies its own filtering in `displayRows`. The `filteredRows` prop is declared but never read inside the component — `displayRows` filters from `props.analysis`. The `filteredRows` prop appears to be a vestigial API from a previous design where filtering was external.

**Impact**: Dead prop creates misleading API surface. A developer might assume `filteredRows` controls what is displayed and be confused when filtering from outside has no effect.
**Recommendation**: Remove the `filteredRows` prop from `ComparisonCard` if it is not used, or document that filtering is done internally.

---

## [LOW] Finding 14: `useStatus` — module-level `clearTimer` is not scoped, timer can outlive component

**File**: `src/composables/useStatus.ts:4`
**Category**: memory-leak
**Description**: `clearTimer` is a module-level variable, matching the module-level `statusMessage` ref. This is intentional for singleton state. However, if the composable is ever used in a context where it is expected to be scoped per component instance (e.g. if a future refactor installs it as a plugin or creates multiple instances), the timer will not be cleared on component unmount. There is no `onUnmounted` cleanup.

**Impact**: Currently safe due to the singleton pattern. No immediate bug.
**Recommendation**: Add a defensive `onUnmounted(() => clearStatus())` inside the composable, or add a comment documenting the singleton assumption.

---

## [LOW] Finding 15: `ComparisonTableRow` — `revealedCells` Set mutated directly, breaking Vue reactivity

**File**: `src/components/comparison/ComparisonTableRow.vue:24,37–43`
**Category**: reactivity
**Description**: `revealedCells` is `ref<Set<string>>(new Set())`. The `toggleReveal` function calls `revealedCells.value.delete(cellId)` and `revealedCells.value.add(cellId)` — direct mutations of the inner Set. Vue 3 **does not track mutations to Set or Map instances** held inside a `ref` (only `reactive()` wraps them with Proxy tracking). The ref value itself is not replaced, so Vue will not trigger re-renders when items are added/deleted.

**Impact**: Clicking a masked cell to reveal it will not update the UI. The `isRevealed` and `cellIsMasked` template calls read `revealedCells.value.has(cellId)` — these will return stale results because the reactive dependency was not established for `Set.has`.

**Recommendation**: Replace with `ref<Set<string>>(new Set())` where mutations create a new Set:
```ts
function toggleReveal(cellId: string) {
  const next = new Set(revealedCells.value);
  if (next.has(cellId)) { next.delete(cellId); } else { next.add(cellId); }
  revealedCells.value = next;
}
```
Or use `reactive(new Set<string>())` which is tracked by Vue 3's Proxy.

---

## [LOW] Finding 16: `useEnvParser.parseEnv` — inline comment values are not stripped

**File**: `src/composables/useEnvParser.ts:24`
**Category**: edge-case
**Description**: The parser strips the value from `KEY=value # comment` as `value # comment` (including the inline comment). Many `.env` loaders (including Laravel's `vlucas/phpdotenv`) strip inline comments from unquoted values. For example `APP_NAME=Laravel # app` would parse the value as `"Laravel # app"` instead of `"Laravel"`. This will cause false drift detection when one set has `APP_NAME=Laravel` and another has `APP_NAME=Laravel # app` — they would show as different even though the effective runtime value is the same.

**Impact**: False positive drift alerts for `.env` files that use inline comments on unquoted values.
**Recommendation**: Strip inline `#` comments from unquoted values (not from quoted values, where `#` is literal). The logic should be: after finding `=`, if the value is not wrapped in quotes, strip everything from the first unescaped `#` onwards.

---

## [LOW] Finding 17: `ProjectForm` — form values not reset when active project changes to a different project

**File**: `src/components/project/ProjectForm.vue:30–37`
**Category**: reactivity
**Description**: The `watch` on `props.activeProject` at line 30 correctly updates `projectName` and `projectPath` when the active project changes. However, the watch uses the default `{ immediate: false }` option, so on initial component mount when `activeProject` is already set, the form fields are pre-filled from `props.activeProject?.name ?? ""` at lines 23–24. If `activeProject` is `undefined` on mount (possible during the first render) and then becomes defined, the watch fires and fills the fields. This is correct. The subtle bug is that `lastSuggestedName` is initialised from `projectName.value` at line 25 — which at mount time is `props.activeProject?.name ?? ""`. If `activeProject` is `undefined` at mount, `lastSuggestedName` is `""`. When the active project later becomes defined via the watch, `lastSuggestedName` is updated too. This is fine. But `shouldReplaceProjectNameWithSuggestion` at line 45 compares `currentName === lastSuggestedName.value` — if the user typed something before the watch fired, this check may incorrectly conclude the user's input should be overwritten.

**Impact**: In a narrow timing window (component mounts, user types a project name, project watch fires), the user's typed name could be silently overwritten by the suggested name from folder inference.
**Recommendation**: Add `{ immediate: true }` to the watch or initialise `lastSuggestedName` after the first watch callback has run.

---

## [LOW] Finding 18: `WarningsList` — non-stable `:key="i"` on `v-for` with mutable list

**File**: `src/components/comparison/WarningsList.vue:43`
**Category**: reactivity / template bug
**Description**: The `v-for` on warnings uses `:key="i"` (array index). When the warnings array reorders or an item is inserted/removed at a non-terminal position, Vue will patch the wrong DOM nodes, potentially causing stale text content in list items.

**Impact**: Minor visual glitch when warnings change order (e.g. coverage warnings always appear first, then per-set warnings are inserted). No data loss.
**Recommendation**: Use `:key="w"` (the warning string itself) since warning strings are unique enough for this use case, or generate a stable key.

---

## [LOW] Finding 19: `OnboardingGuide` — `features` and `safetyPoints` arrays defined at module scope, not inside `<script setup>`

**File**: `src/components/help/OnboardingGuide.vue:49–106`
**Category**: maintainability
**Description**: `features` and `safetyPoints` are declared as `const` arrays at module scope (outside any function). In `<script setup>`, code outside reactive primitives runs once per component instance, but these constants are effectively static. This is fine for correctness. The potential issue is that they are not reactive and cannot be easily made translatable or configurable without refactoring. This is a minor pattern concern rather than a bug.

**Impact**: No bug. Maintainability concern only.
**Recommendation**: No action required unless i18n or configurability is needed.

---

## [INFO] Finding 20: `useProjects.saveProject` — case-insensitive name deduplication may surprise users

**File**: `src/composables/useProjects.ts:66–68`
**Category**: edge-case
**Description**: Project deduplication compares `p.name.toLowerCase() === name.toLowerCase()`. This means creating a project named "MyApp" when "myapp" already exists will update the existing record's path without warning the user.

**Impact**: Could silently overwrite a project path if the user capitalises a name differently, believing they are creating a new project.
**Recommendation**: Show a confirmation or at minimum return a more descriptive status message indicating the update was to an existing project (the current message `"Updated ${existing.name}."` does do this, so the risk is low).

---

## [INFO] Finding 21: `useActivityLog.generateId` has theoretical collision risk

**File**: `src/composables/useActivityLog.ts:24–26`
**Category**: edge-case
**Description**: IDs are generated as `` `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` ``. With 6 base-36 characters, the random component has ~2.2 billion combinations. For a local single-user app this is effectively collision-proof. Noted for completeness.

**Impact**: Negligible in practice.
**Recommendation**: No action required.

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH | 3 |
| MEDIUM | 8 |
| LOW | 7 |
| INFO | 2 |

### Priority fixes

1. **Finding 15 (CRITICAL path)** — `revealedCells` Set mutation does not trigger Vue re-renders. Cell reveal clicks will appear broken.
2. **Finding 2** — The positional diff algorithm produces misleading previews before file writes, undermining the core safety feature.
3. **Finding 12** — Patch entries re-computed at execution time, diverging from the previewed diff.
4. **Finding 3** — Unguarded `localStorage.setItem` calls across all persistence functions.
5. **Finding 6** — Auto-scan race condition on rapid project saves.

### Positive observations

- The "always replace, never mutate" pattern used for `sessionEdits` (creating a new Map on each update) is correct and prevents the class of bug described in Finding 15.
- The `useStatus` clearTimer debounce pattern is well-implemented.
- All Tauri command calls correctly use try/catch with user-facing error messages.
- `clearProjectSets` uses a reverse-iteration splice pattern, which is correct and avoids index shifting bugs.
- `useEnvParser.parseEnv` correctly handles `export KEY=value` syntax, duplicate detection, and quote stripping.
- The `applyRawToSet` pattern (re-parsing raw text rather than directly mutating `values`) correctly keeps `rawText` and `values` in sync.
