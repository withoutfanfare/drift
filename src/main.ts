import { invoke } from "@tauri-apps/api/core";

type EnvSource = "file" | "manual" | "scan";
type EnvRole = "local" | "staging" | "live" | "other";
type RowFilter = "all" | "missing" | "drift" | "unsafe" | "aligned";

interface ProjectProfile {
  id: string;
  name: string;
  rootPath: string;
}

interface EnvSet {
  id: string;
  projectId: string;
  name: string;
  role: EnvRole;
  source: EnvSource;
  rawText: string;
  filePath?: string;
  values: Record<string, string>;
  duplicates: string[];
}

interface KeyAnalysisRow {
  key: string;
  valuesBySet: Record<string, string | undefined>;
  missingCount: number;
  drift: boolean;
  unsafe: boolean;
  unsafeReasons: string[];
  primaryStatus: "missing" | "drift" | "unsafe" | "aligned";
}

interface PersistedSet {
  id: string;
  projectId?: string;
  name: string;
  role?: EnvRole;
  source: EnvSource;
  rawText: string;
  filePath?: string;
}

interface PersistedProject {
  id: string;
  name: string;
  rootPath: string;
}

interface ScannedEnvFile {
  path: string;
  name: string;
  content: string;
}

interface MissingEntry {
  key: string;
  value: string;
}

interface PatchResult {
  appendedCount: number;
  skippedExisting: number;
  backupPath: string | null;
  updatedContent: string;
}

interface UpsertResult {
  matchedCount: number;
  appended: boolean;
  backupPath: string | null;
  updatedContent: string;
}

interface LocalUpsertResult {
  updatedContent: string;
  matchedCount: number;
  appended: boolean;
}

const SET_STORAGE_KEY = "edm.envSets.v1";
const PROJECT_STORAGE_KEY = "edm.projects.v1";
const ACTIVE_PROJECT_KEY = "edm.activeProject.v1";

const app = must<HTMLDivElement>("#app");

app.innerHTML = `
  <main class="shell">
    <header class="header">
      <h1>Drift MVP</h1>
      <p>Manage local/staging/live <code>.env</code> sets for multiple Laravel projects, compare drift, and patch values safely.</p>
    </header>

    <section class="summary">
      <article class="kpi"><span>Loaded sets</span><strong id="kpi-files">0</strong></article>
      <article class="kpi"><span>Total keys</span><strong id="kpi-keys">0</strong></article>
      <article class="kpi"><span>Drift keys</span><strong id="kpi-drift">0</strong></article>
      <article class="kpi"><span>Unsafe flags</span><strong id="kpi-unsafe">0</strong></article>
    </section>

    <section class="grid">
      <article class="card">
        <h2>1) Project + Env Set Management</h2>

        <label for="project-select">Active project</label>
        <select id="project-select"></select>

        <label for="project-name">Project name</label>
        <input id="project-name" placeholder="Client Platform" />

        <label for="project-path">Project root path</label>
        <input id="project-path" placeholder="/Users/you/Code/client-platform" />

        <div class="actions">
          <button id="save-project" type="button">Save Project</button>
          <button id="delete-project" class="alt" type="button">Delete Project</button>
          <button id="scan-project" class="alt" type="button">Scan Folder for .env*</button>
          <button id="create-baseline" class="alt" type="button">Create local/staging/live Baseline</button>
        </div>

        <input id="env-files" type="file" accept=".env,.txt" multiple hidden />

        <div class="actions">
          <button id="load-files" type="button">Load .env Files</button>
          <button id="load-sample" class="alt" type="button">Load Sample Trio</button>
          <button id="clear-project" class="warn" type="button">Clear Active Project Sets</button>
        </div>

        <label for="manual-name">Manual set name</label>
        <input id="manual-name" placeholder=".env.staging" />

        <label for="manual-role">Manual set role</label>
        <select id="manual-role">
          <option value="local">local</option>
          <option value="staging">staging</option>
          <option value="live">live</option>
          <option value="other" selected>other</option>
        </select>

        <label for="manual-content">Manual .env content</label>
        <textarea id="manual-content" placeholder="APP_NAME=Laravel\nAPP_ENV=staging"></textarea>

        <div class="actions">
          <button id="add-manual" class="alt" type="button">Add Manual Set</button>
        </div>

        <h3>Sets in Active Project</h3>
        <ul id="set-list" class="env-list"></ul>
      </article>

      <article class="card">
        <h2>2) Compare, Drift Control, and Write-Back</h2>

        <div class="tool-row">
          <div>
            <label for="filter">Filter rows</label>
            <select id="filter">
              <option value="all">All</option>
              <option value="missing">Missing</option>
              <option value="drift">Drift</option>
              <option value="unsafe">Unsafe</option>
              <option value="aligned">Aligned</option>
            </select>
          </div>
          <div>
            <label for="search">Search key</label>
            <input id="search" placeholder="APP_" />
          </div>
          <div>
            <label for="reference-select">Reference set</label>
            <select id="reference-select"></select>
          </div>
        </div>

        <div class="tool-row">
          <div>
            <label for="target-select">Target set</label>
            <select id="target-select"></select>
          </div>
          <div class="actions" style="align-items:flex-end; margin-top: 0;">
            <button id="copy-missing" type="button">Copy Missing-Key Template</button>
            <button id="copy-merged" class="alt" type="button">Copy Merged Template</button>
            <button id="patch-target" class="warn" type="button">Patch Missing Keys to Target</button>
          </div>
        </div>

        <h3>Inline Drift Editor</h3>
        <div class="tool-row">
          <div>
            <label for="editor-key-select">Key</label>
            <select id="editor-key-select"></select>
          </div>
          <div>
            <label for="editor-source-select">Source set</label>
            <select id="editor-source-select"></select>
          </div>
          <div>
            <label for="editor-target-select">Target set</label>
            <select id="editor-target-select"></select>
          </div>
        </div>

        <label for="editor-value">Value</label>
        <textarea id="editor-value" class="editor-value" placeholder="Set value for selected key"></textarea>

        <div class="actions">
          <button id="editor-load-source" class="alt" type="button">Load Value From Source</button>
          <button id="editor-apply-memory" type="button">Apply to Target (In-App)</button>
          <button id="editor-apply-file" class="warn" type="button">Apply to Target File</button>
        </div>

        <p id="status" class="status"></p>

        <div class="table-wrap">
          <table>
            <thead>
              <tr id="drift-header">
                <th>Key</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="drift-body"></tbody>
          </table>
        </div>

        <h3>Warnings + Coverage</h3>
        <ul id="warning-list" class="warnings"></ul>
      </article>
    </section>
  </main>
`;

const projects = loadProjects();
let activeProjectId = loadActiveProjectId(projects);
const envSets = loadSets(projects, activeProjectId);
let editorContextKey = "";

const fileInputEl = must<HTMLInputElement>("#env-files");
const projectSelectEl = must<HTMLSelectElement>("#project-select");
const projectNameEl = must<HTMLInputElement>("#project-name");
const projectPathEl = must<HTMLInputElement>("#project-path");
const manualNameEl = must<HTMLInputElement>("#manual-name");
const manualRoleEl = must<HTMLSelectElement>("#manual-role");
const manualContentEl = must<HTMLTextAreaElement>("#manual-content");
const setListEl = must<HTMLUListElement>("#set-list");
const filterEl = must<HTMLSelectElement>("#filter");
const searchEl = must<HTMLInputElement>("#search");
const referenceSelectEl = must<HTMLSelectElement>("#reference-select");
const targetSelectEl = must<HTMLSelectElement>("#target-select");
const editorKeySelectEl = must<HTMLSelectElement>("#editor-key-select");
const editorSourceSelectEl = must<HTMLSelectElement>("#editor-source-select");
const editorTargetSelectEl = must<HTMLSelectElement>("#editor-target-select");
const editorValueEl = must<HTMLTextAreaElement>("#editor-value");
const statusEl = must<HTMLParagraphElement>("#status");
const driftHeaderEl = must<HTMLTableRowElement>("#drift-header");
const driftBodyEl = must<HTMLTableSectionElement>("#drift-body");
const warningListEl = must<HTMLUListElement>("#warning-list");

seedManualInput();
render();

projectSelectEl.addEventListener("change", () => {
  activeProjectId = projectSelectEl.value;
  saveActiveProjectId(activeProjectId);
  syncProjectInputs();
  render();
});

must<HTMLButtonElement>("#save-project").addEventListener("click", () => {
  const name = projectNameEl.value.trim();
  const rootPath = projectPathEl.value.trim();

  if (!name || !rootPath) {
    setStatus("Project name and root path are required.");
    return;
  }

  const existing = projects.find((project) => project.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    existing.rootPath = rootPath;
    activeProjectId = existing.id;
    setStatus(`Updated ${existing.name}.`);
  } else {
    const project: ProjectProfile = {
      id: crypto.randomUUID(),
      name,
      rootPath,
    };
    projects.push(project);
    activeProjectId = project.id;
    setStatus(`Added ${project.name}.`);
  }

  persistProjects();
  saveActiveProjectId(activeProjectId);
  render();
});

must<HTMLButtonElement>("#delete-project").addEventListener("click", () => {
  const index = projects.findIndex((project) => project.id === activeProjectId);

  if (index < 0) {
    setStatus("No active project selected.");
    return;
  }

  const [removed] = projects.splice(index, 1);

  for (let i = envSets.length - 1; i >= 0; i -= 1) {
    if (envSets[i].projectId === removed.id) {
      envSets.splice(i, 1);
    }
  }

  if (projects.length === 0) {
    projects.push(createDefaultProject());
  }

  activeProjectId = projects[0].id;
  persistProjects();
  persistSets();
  saveActiveProjectId(activeProjectId);
  render();
  setStatus(`Deleted ${removed.name} and its env sets.`);
});

must<HTMLButtonElement>("#scan-project").addEventListener("click", async () => {
  const project = activeProject();
  if (!project) {
    setStatus("No active project selected.");
    return;
  }

  if (!project.rootPath.trim()) {
    setStatus("Set a valid project root path first.");
    return;
  }

  try {
    const scanned = await invoke<ScannedEnvFile[]>("scan_env_files", {
      projectRoot: project.rootPath,
    });

    for (const file of scanned) {
      addOrReplaceSet({
        projectId: project.id,
        name: file.name,
        source: "scan",
        rawText: file.content,
        filePath: file.path,
      });
    }

    persistSets();
    render();
    setStatus(`Discovered ${scanned.length} .env file${scanned.length === 1 ? "" : "s"} in ${project.name}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Scan failed: ${message}`);
  }
});

must<HTMLButtonElement>("#create-baseline").addEventListener("click", () => {
  const project = activeProject();
  if (!project) {
    setStatus("No active project selected.");
    return;
  }

  const created = createBaselineSets(project.id);
  persistSets();
  render();
  setStatus(created > 0 ? `Created ${created} baseline set${created > 1 ? "s" : ""}.` : "Baseline already complete.");
});

must<HTMLButtonElement>("#load-files").addEventListener("click", () => {
  fileInputEl.click();
});

fileInputEl.addEventListener("change", async () => {
  const project = activeProject();
  if (!project) {
    setStatus("No active project selected.");
    fileInputEl.value = "";
    return;
  }

  const files = Array.from(fileInputEl.files ?? []);

  if (files.length === 0) {
    return;
  }

  for (const file of files) {
    const raw = await file.text();
    addOrReplaceSet({
      projectId: project.id,
      name: file.name,
      source: "file",
      rawText: raw,
    });
  }

  fileInputEl.value = "";
  persistSets();
  render();
  setStatus(`Loaded ${files.length} file${files.length > 1 ? "s" : ""} into ${project.name}.`);
});

must<HTMLButtonElement>("#add-manual").addEventListener("click", () => {
  const project = activeProject();
  if (!project) {
    setStatus("No active project selected.");
    return;
  }

  const name = manualNameEl.value.trim();
  const rawText = manualContentEl.value;

  if (!name || rawText.trim().length === 0) {
    setStatus("Manual set name and content are required.");
    return;
  }

  addOrReplaceSet({
    projectId: project.id,
    name,
    source: "manual",
    rawText,
    role: asRole(manualRoleEl.value),
  });

  persistSets();
  render();
  setStatus(`Added ${name} to ${project.name}.`);
});

must<HTMLButtonElement>("#load-sample").addEventListener("click", () => {
  const project = activeProject();
  if (!project) {
    setStatus("No active project selected.");
    return;
  }

  loadSampleData(project.id);
  persistSets();
  render();
  setStatus(`Loaded sample local/staging/live sets into ${project.name}.`);
});

must<HTMLButtonElement>("#clear-project").addEventListener("click", () => {
  const project = activeProject();
  if (!project) {
    setStatus("No active project selected.");
    return;
  }

  for (let i = envSets.length - 1; i >= 0; i -= 1) {
    if (envSets[i].projectId === project.id) {
      envSets.splice(i, 1);
    }
  }

  persistSets();
  render();
  setStatus(`Cleared env sets for ${project.name}.`);
});

setListEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const setId = target.dataset.setId;
  if (!setId) {
    return;
  }

  const index = envSets.findIndex((set) => set.id === setId);
  if (index === -1) {
    return;
  }

  const [removed] = envSets.splice(index, 1);
  persistSets();
  render();
  setStatus(`Removed ${removed.name}.`);
});

filterEl.addEventListener("change", render);
searchEl.addEventListener("input", render);
referenceSelectEl.addEventListener("change", render);
targetSelectEl.addEventListener("change", render);

editorKeySelectEl.addEventListener("change", () => {
  syncEditorValueFromSource(true);
});

editorSourceSelectEl.addEventListener("change", () => {
  syncEditorValueFromSource(true);
});

must<HTMLButtonElement>("#editor-load-source").addEventListener("click", () => {
  syncEditorValueFromSource(true);
  setStatus("Loaded source set value into editor.");
});

must<HTMLButtonElement>("#editor-apply-memory").addEventListener("click", () => {
  const target = selectedEditorTargetSet();
  const key = selectedEditorKey();

  if (!target || !key) {
    setStatus("Select key and target set for inline update.");
    return;
  }

  const value = editorValueEl.value;
  const result = upsertEnvKeyInRaw(target.rawText, key, value);
  applyRawToSet(target, result.updatedContent);

  persistSets();
  render();

  if (result.appended) {
    setStatus(`Added ${key} to ${target.name} (in-app).`);
  } else {
    setStatus(`Updated ${key} in ${target.name} (in-app, matched ${result.matchedCount}).`);
  }
});

must<HTMLButtonElement>("#editor-apply-file").addEventListener("click", async () => {
  const target = selectedEditorTargetSet();
  const key = selectedEditorKey();

  if (!target || !key) {
    setStatus("Select key and target set for file update.");
    return;
  }

  if (!target.filePath) {
    setStatus("Target set has no file path. Use scanned env files for direct file updates.");
    return;
  }

  try {
    const result = await invoke<UpsertResult>("upsert_env_key", {
      targetPath: target.filePath,
      key,
      value: editorValueEl.value,
      createBackup: true,
    });

    applyRawToSet(target, result.updatedContent);
    persistSets();
    render();

    const mode = result.appended ? "added" : "updated";
    const backupInfo = result.backupPath ? ` backup: ${result.backupPath}` : "";
    setStatus(`File ${mode} ${key} in ${target.name}.${backupInfo}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Inline file update failed: ${message}`);
  }
});

driftBodyEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const row = target.closest<HTMLTableRowElement>("tr[data-key]");
  if (!row) {
    return;
  }

  const key = row.dataset.key;
  if (!key) {
    return;
  }

  editorKeySelectEl.value = key;
  syncEditorValueFromSource(true);
  setStatus(`Loaded ${key} into inline editor.`);
});

must<HTMLButtonElement>("#copy-missing").addEventListener("click", async () => {
  const reference = selectedReferenceSet();
  const target = selectedTargetSet();

  if (!reference || !target) {
    setStatus("Choose a valid reference and target set.");
    return;
  }

  const template = buildMissingTemplate(reference, target);
  await navigator.clipboard.writeText(template);
  setStatus(`Missing-key template copied (${reference.name} -> ${target.name}).`);
});

must<HTMLButtonElement>("#copy-merged").addEventListener("click", async () => {
  const sets = currentSets();
  if (sets.length === 0) {
    setStatus("Load at least one set first.");
    return;
  }

  const merged = buildMergedTemplate(sets);
  await navigator.clipboard.writeText(merged);
  setStatus("Merged template copied to clipboard.");
});

must<HTMLButtonElement>("#patch-target").addEventListener("click", async () => {
  const reference = selectedReferenceSet();
  const target = selectedTargetSet();

  if (!reference || !target) {
    setStatus("Choose a valid reference and target set.");
    return;
  }

  if (!target.filePath) {
    setStatus("Target set has no filesystem path. Use folder scan import for safe write-back.");
    return;
  }

  const entries = getMissingEntries(reference, target);
  if (entries.length === 0) {
    setStatus("No missing keys to append.");
    return;
  }

  try {
    const result = await invoke<PatchResult>("append_missing_env_keys", {
      targetPath: target.filePath,
      entries,
      createBackup: true,
    });

    applyRawToSet(target, result.updatedContent);
    persistSets();
    render();

    const backupInfo = result.backupPath ? ` backup: ${result.backupPath}` : "";
    setStatus(`Patched ${target.name}: appended ${result.appendedCount}, skipped ${result.skippedExisting}.${backupInfo}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Patch failed: ${message}`);
  }
});

function render(): void {
  const sets = currentSets();
  const analysis = analyzeRows(sets);
  const filteredRows = applyFilters(analysis, asFilter(filterEl.value), searchEl.value);

  renderProjectControls();
  renderSetList(sets);
  renderReferenceTargetSelects(sets);
  renderEditorControls(sets, analysis);
  renderSummary(analysis, sets);
  renderTable(filteredRows, sets);
  renderWarnings(sets);
}

function renderProjectControls(): void {
  projectSelectEl.innerHTML = projects
    .map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`)
    .join("");

  if (!projects.some((project) => project.id === activeProjectId)) {
    activeProjectId = projects[0]?.id ?? createDefaultProject().id;
  }

  projectSelectEl.value = activeProjectId;
  syncProjectInputs();
}

function syncProjectInputs(): void {
  const project = activeProject();
  if (!project) {
    return;
  }

  projectNameEl.value = project.name;
  projectPathEl.value = project.rootPath;
}

function renderSetList(sets: EnvSet[]): void {
  setListEl.innerHTML = sets
    .map((set) => {
      const keyCount = Object.keys(set.values).length;
      const duplicateCount = set.duplicates.length;
      const pathInfo = set.filePath ? `<br/><small>${escapeHtml(set.filePath)}</small>` : "";

      return `<li><strong>${escapeHtml(set.name)}</strong> <small>(${set.role}, ${set.source}, ${keyCount} keys${duplicateCount > 0 ? `, ${duplicateCount} duplicate declarations` : ""})</small>${pathInfo} <button data-set-id="${set.id}" class="alt" type="button">Remove</button></li>`;
    })
    .join("");

  if (sets.length === 0) {
    setListEl.innerHTML = "<li>No env sets loaded for this project.</li>";
  }
}

function renderReferenceTargetSelects(sets: EnvSet[]): void {
  const previousReference = referenceSelectEl.value;
  const previousTarget = targetSelectEl.value;

  const options = sets
    .map((set) => `<option value="${set.id}">${escapeHtml(set.name)} (${set.role})</option>`)
    .join("");

  referenceSelectEl.innerHTML = options;
  targetSelectEl.innerHTML = options;

  if (sets.length === 0) {
    return;
  }

  const hasReference = sets.some((set) => set.id === previousReference);
  const hasTarget = sets.some((set) => set.id === previousTarget);

  referenceSelectEl.value = hasReference ? previousReference : sets[0].id;

  if (hasTarget) {
    targetSelectEl.value = previousTarget;
  } else if (sets.length > 1) {
    targetSelectEl.value = sets[1].id;
  } else {
    targetSelectEl.value = sets[0].id;
  }

  if (referenceSelectEl.value === targetSelectEl.value && sets.length > 1) {
    const fallback = sets.find((set) => set.id !== referenceSelectEl.value);
    if (fallback) {
      targetSelectEl.value = fallback.id;
    }
  }
}

function renderEditorControls(sets: EnvSet[], analysis: KeyAnalysisRow[]): void {
  const previousKey = editorKeySelectEl.value;
  const previousSource = editorSourceSelectEl.value;
  const previousTarget = editorTargetSelectEl.value;

  editorKeySelectEl.innerHTML = analysis
    .map((row) => `<option value="${row.key}">${escapeHtml(row.key)}</option>`)
    .join("");

  const setOptions = sets
    .map((set) => `<option value="${set.id}">${escapeHtml(set.name)} (${set.role})</option>`)
    .join("");

  editorSourceSelectEl.innerHTML = setOptions;
  editorTargetSelectEl.innerHTML = setOptions;

  if (analysis.length > 0) {
    editorKeySelectEl.value = analysis.some((row) => row.key === previousKey) ? previousKey : analysis[0].key;
  }

  if (sets.length > 0) {
    const sourceCandidate = sets.some((set) => set.id === previousSource)
      ? previousSource
      : referenceSelectEl.value || sets[0].id;
    editorSourceSelectEl.value = sourceCandidate;

    let targetCandidate = sets.some((set) => set.id === previousTarget)
      ? previousTarget
      : targetSelectEl.value || sets[0].id;

    if (targetCandidate === editorSourceSelectEl.value && sets.length > 1) {
      targetCandidate = sets.find((set) => set.id !== editorSourceSelectEl.value)?.id ?? targetCandidate;
    }

    editorTargetSelectEl.value = targetCandidate;
  }

  const nextContext = `${editorKeySelectEl.value}|${editorSourceSelectEl.value}`;
  if (nextContext !== editorContextKey) {
    syncEditorValueFromSource(true);
    editorContextKey = nextContext;
  }
}

function syncEditorValueFromSource(overwrite: boolean): void {
  const source = selectedEditorSourceSet();
  const key = selectedEditorKey();

  if (!source || !key) {
    return;
  }

  if (!overwrite && editorValueEl.value.trim().length > 0) {
    return;
  }

  editorValueEl.value = source.values[key] ?? "";
}

function selectedEditorKey(): string | null {
  const key = editorKeySelectEl.value.trim();
  return key.length > 0 ? key : null;
}

function selectedEditorSourceSet(): EnvSet | undefined {
  return currentSets().find((set) => set.id === editorSourceSelectEl.value);
}

function selectedEditorTargetSet(): EnvSet | undefined {
  return currentSets().find((set) => set.id === editorTargetSelectEl.value);
}

function renderSummary(rows: KeyAnalysisRow[], sets: EnvSet[]): void {
  const driftRows = rows.filter((row) => row.drift).length;
  const unsafeRows = rows.filter((row) => row.unsafe).length;

  must<HTMLElement>("#kpi-files").textContent = String(sets.length);
  must<HTMLElement>("#kpi-keys").textContent = String(rows.length);
  must<HTMLElement>("#kpi-drift").textContent = String(driftRows);
  must<HTMLElement>("#kpi-unsafe").textContent = String(unsafeRows);
}

function renderTable(rows: KeyAnalysisRow[], sets: EnvSet[]): void {
  const headerCells = ["<th>Key</th>", "<th>Status</th>"];

  for (const set of sets) {
    headerCells.push(`<th>${escapeHtml(set.name)}</th>`);
  }

  driftHeaderEl.innerHTML = headerCells.join("");

  driftBodyEl.innerHTML = rows
    .map((row) => {
      const badges = renderBadges(row);
      const valueCells = sets
        .map((set) => {
          const value = row.valuesBySet[set.id];
          if (value === undefined) {
            return `<td><span class="missing">Missing</span></td>`;
          }
          return `<td><code class="value">${escapeHtml(value)}</code></td>`;
        })
        .join("");

      return `<tr data-key="${escapeHtml(row.key)}"><td><code>${escapeHtml(row.key)}</code></td><td><div class="badges">${badges}</div></td>${valueCells}</tr>`;
    })
    .join("");
}

function renderWarnings(sets: EnvSet[]): void {
  const warnings: string[] = [];

  const rolesPresent = new Set<EnvRole>(sets.map((set) => set.role));
  if (!rolesPresent.has("local")) {
    warnings.push("Coverage: local set missing.");
  }
  if (!rolesPresent.has("staging")) {
    warnings.push("Coverage: staging set missing.");
  }
  if (!rolesPresent.has("live")) {
    warnings.push("Coverage: live set missing.");
  }

  for (const set of sets) {
    const requiredKeys = ["APP_KEY", "APP_DEBUG", "APP_ENV", "APP_URL", "DB_PASSWORD", "QUEUE_CONNECTION", "MAIL_MAILER"];
    const allKeys = new Set<string>([...Object.keys(set.values), ...requiredKeys]);

    for (const key of allKeys) {
      const reason = evaluateUnsafe(set, key, set.values[key]);
      if (reason) {
        warnings.push(`${set.name}: ${key} -> ${reason}`);
      }
    }

    if (set.duplicates.length > 0) {
      warnings.push(`${set.name}: duplicate key declarations (${set.duplicates.join(", ")}).`);
    }
  }

  warningListEl.innerHTML = warnings.map((line) => `<li>${escapeHtml(line)}</li>`).join("");

  if (warnings.length === 0) {
    warningListEl.innerHTML = "<li>No warnings detected for this project.</li>";
  }
}

function renderBadges(row: KeyAnalysisRow): string {
  const badges: string[] = [];

  if (row.missingCount > 0) {
    badges.push(`<span class="badge missing">Missing (${row.missingCount})</span>`);
  }
  if (row.drift) {
    badges.push('<span class="badge drift">Drift</span>');
  }
  if (row.unsafe) {
    badges.push(`<span class="badge unsafe" title="${escapeHtml(row.unsafeReasons.join(" | "))}">Unsafe</span>`);
  }
  if (badges.length === 0) {
    badges.push('<span class="badge aligned">Aligned</span>');
  }

  return badges.join("");
}

function activeProject(): ProjectProfile | undefined {
  return projects.find((project) => project.id === activeProjectId);
}

function currentSets(): EnvSet[] {
  return envSets
    .filter((set) => set.projectId === activeProjectId)
    .sort((a, b) => roleSort(a.role) - roleSort(b.role) || a.name.localeCompare(b.name));
}

function selectedReferenceSet(): EnvSet | undefined {
  return currentSets().find((set) => set.id === referenceSelectEl.value);
}

function selectedTargetSet(): EnvSet | undefined {
  return currentSets().find((set) => set.id === targetSelectEl.value);
}

function roleSort(role: EnvRole): number {
  switch (role) {
    case "local":
      return 1;
    case "staging":
      return 2;
    case "live":
      return 3;
    default:
      return 4;
  }
}

function createBaselineSets(projectId: string): number {
  const templates: Array<{ name: string; role: EnvRole; content: string }> = [
    {
      name: ".env.local",
      role: "local",
      content: [
        "APP_NAME=Laravel",
        "APP_ENV=local",
        "APP_KEY=",
        "APP_DEBUG=true",
        "APP_URL=http://localhost",
        "DB_PASSWORD=",
        "QUEUE_CONNECTION=sync",
        "MAIL_MAILER=log",
        "LOG_LEVEL=debug",
      ].join("\n"),
    },
    {
      name: ".env.staging",
      role: "staging",
      content: [
        "APP_NAME=Laravel",
        "APP_ENV=staging",
        "APP_KEY=",
        "APP_DEBUG=false",
        "APP_URL=https://staging.example.com",
        "DB_PASSWORD=",
        "QUEUE_CONNECTION=database",
        "MAIL_MAILER=smtp",
        "LOG_LEVEL=info",
      ].join("\n"),
    },
    {
      name: ".env.production",
      role: "live",
      content: [
        "APP_NAME=Laravel",
        "APP_ENV=production",
        "APP_KEY=",
        "APP_DEBUG=false",
        "APP_URL=https://example.com",
        "DB_PASSWORD=",
        "QUEUE_CONNECTION=database",
        "MAIL_MAILER=smtp",
        "LOG_LEVEL=warning",
      ].join("\n"),
    },
  ];

  let created = 0;

  for (const template of templates) {
    const exists = envSets.some((set) => set.projectId === projectId && set.role === template.role);
    if (exists) {
      continue;
    }

    addOrReplaceSet({
      projectId,
      name: template.name,
      role: template.role,
      source: "manual",
      rawText: template.content,
    });
    created += 1;
  }

  return created;
}

function addOrReplaceSet(input: {
  projectId: string;
  name: string;
  source: EnvSource;
  rawText: string;
  role?: EnvRole;
  filePath?: string;
}): void {
  const { values, duplicates } = parseEnv(input.rawText);
  const role = input.role ?? detectRole(input.name, values);

  const existing = input.filePath
    ? envSets.find((set) => set.projectId === input.projectId && set.filePath === input.filePath)
    : envSets.find((set) => set.projectId === input.projectId && !set.filePath && set.name === input.name);

  if (existing) {
    existing.name = input.name;
    existing.source = input.source;
    existing.rawText = input.rawText;
    existing.filePath = input.filePath;
    existing.values = values;
    existing.duplicates = duplicates;
    existing.role = role;
    return;
  }

  envSets.push({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    name: input.name,
    source: input.source,
    rawText: input.rawText,
    filePath: input.filePath,
    values,
    duplicates,
    role,
  });
}

function applyRawToSet(set: EnvSet, rawText: string): void {
  const parsed = parseEnv(rawText);
  set.rawText = rawText;
  set.values = parsed.values;
  set.duplicates = parsed.duplicates;
}

function analyzeRows(sets: EnvSet[]): KeyAnalysisRow[] {
  const keySet = new Set<string>();

  for (const set of sets) {
    for (const key of Object.keys(set.values)) {
      keySet.add(key);
    }
  }

  const rows: KeyAnalysisRow[] = [];

  for (const key of [...keySet].sort()) {
    const valuesBySet: Record<string, string | undefined> = {};
    let missingCount = 0;
    const normalizedValues = new Set<string>();
    const unsafeReasons: string[] = [];

    for (const set of sets) {
      const raw = set.values[key];
      valuesBySet[set.id] = raw;

      if (raw === undefined) {
        missingCount += 1;
      } else {
        normalizedValues.add(normalizeForComparison(raw));
      }

      const reason = evaluateUnsafe(set, key, raw);
      if (reason) {
        unsafeReasons.push(`${set.name}: ${reason}`);
      }
    }

    const drift = normalizedValues.size > 1;
    const unsafe = unsafeReasons.length > 0;

    const primaryStatus: KeyAnalysisRow["primaryStatus"] = unsafe
      ? "unsafe"
      : missingCount > 0
        ? "missing"
        : drift
          ? "drift"
          : "aligned";

    rows.push({
      key,
      valuesBySet,
      missingCount,
      drift,
      unsafe,
      unsafeReasons,
      primaryStatus,
    });
  }

  return rows;
}

function evaluateUnsafe(set: EnvSet, key: string, value: string | undefined): string | null {
  const productionLike = isProductionLike(set);
  const lowered = (value ?? "").toLowerCase();
  const blank = value === undefined || value.trim().length === 0;

  if (key === "APP_KEY" && blank) {
    return "APP_KEY is empty or missing";
  }

  if (productionLike && key === "APP_DEBUG" && isTruthy(lowered)) {
    return "APP_DEBUG enabled in production-like set";
  }

  if (productionLike && key === "APP_ENV" && lowered === "local") {
    return "APP_ENV is local for production-like set";
  }

  if (productionLike && key === "DB_PASSWORD" && blank) {
    return "DB_PASSWORD is empty";
  }

  if (productionLike && key === "QUEUE_CONNECTION" && lowered === "sync") {
    return "QUEUE_CONNECTION is sync";
  }

  if (productionLike && key === "MAIL_MAILER" && lowered === "log") {
    return "MAIL_MAILER is log";
  }

  if (productionLike && key === "APP_URL" && lowered.startsWith("http://")) {
    return "APP_URL is not HTTPS";
  }

  if (productionLike && key === "LOG_LEVEL" && lowered === "debug") {
    return "LOG_LEVEL is debug";
  }

  if (/(?:_SECRET|_PASSWORD|_TOKEN|_PRIVATE_KEY)$/i.test(key) && blank) {
    return "sensitive value is blank";
  }

  return null;
}

function isProductionLike(set: EnvSet): boolean {
  if (set.role === "live") {
    return true;
  }

  const env = (set.values.APP_ENV ?? "").toLowerCase();
  const name = set.name.toLowerCase();
  return env.includes("prod") || name.includes("prod") || name.includes("live");
}

function getMissingEntries(reference: EnvSet, target: EnvSet): MissingEntry[] {
  const entries: MissingEntry[] = [];

  for (const key of Object.keys(reference.values).sort()) {
    if (target.values[key] !== undefined) {
      continue;
    }

    entries.push({ key, value: reference.values[key] });
  }

  return entries;
}

function buildMissingTemplate(reference: EnvSet, target: EnvSet): string {
  const entries = getMissingEntries(reference, target);

  if (entries.length === 0) {
    return `# No missing keys from ${reference.name} into ${target.name}`;
  }

  const lines = entries.map((entry) => `${entry.key}=${formatValue(entry.value)}`);

  return [`# Missing keys for ${target.name}`, `# Generated from reference: ${reference.name}`, ...lines].join("\n");
}

function buildMergedTemplate(sets: EnvSet[]): string {
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

function upsertEnvKeyInRaw(rawText: string, key: string, value: string): LocalUpsertResult {
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

  const updatedContent = `${lines.join("\n")}\n`;

  return {
    updatedContent,
    matchedCount,
    appended,
  };
}

function parseKeyFromEnvLine(rawLine: string): string | null {
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

function applyFilters(rows: KeyAnalysisRow[], filter: RowFilter, search: string): KeyAnalysisRow[] {
  const query = search.trim().toLowerCase();

  return rows.filter((row) => {
    if (query && !row.key.toLowerCase().includes(query)) {
      return false;
    }

    if (filter === "all") {
      return true;
    }

    if (filter === "missing") {
      return row.missingCount > 0;
    }

    if (filter === "drift") {
      return row.drift;
    }

    if (filter === "unsafe") {
      return row.unsafe;
    }

    return row.primaryStatus === "aligned";
  });
}

function parseEnv(content: string): { values: Record<string, string>; duplicates: string[] } {
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

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2) {
    const starts = value[0];
    const ends = value[value.length - 1];
    if ((starts === '"' && ends === '"') || (starts === "'" && ends === "'")) {
      return value.slice(1, -1);
    }
  }

  return value;
}

function normalizeForComparison(value: string): string {
  return value.trim();
}

function isTruthy(value: string): boolean {
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

function formatValue(value: string): string {
  if (value.length === 0) {
    return "";
  }

  if (/\s|#/.test(value)) {
    return `"${value.replace(/"/g, "\\\"")}"`;
  }

  return value;
}

function detectRole(name: string, values: Record<string, string>): EnvRole {
  const env = (values.APP_ENV ?? "").toLowerCase();
  const loweredName = name.toLowerCase();
  const signature = `${loweredName} ${env}`;

  if (/(local|dev|development)/.test(signature)) {
    return "local";
  }

  if (/(staging|stage|qa|uat|test)/.test(signature)) {
    return "staging";
  }

  if (/(prod|production|live)/.test(signature)) {
    return "live";
  }

  return "other";
}

function asRole(value: string): EnvRole {
  if (value === "local" || value === "staging" || value === "live" || value === "other") {
    return value;
  }
  return "other";
}

function asFilter(value: string): RowFilter {
  if (value === "missing" || value === "drift" || value === "unsafe" || value === "aligned") {
    return value;
  }
  return "all";
}

function loadProjects(): ProjectProfile[] {
  const raw = localStorage.getItem(PROJECT_STORAGE_KEY);

  if (!raw) {
    const initial = [createDefaultProject()];
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedProject[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((project) => ({
        id: project.id,
        name: project.name,
        rootPath: project.rootPath,
      }));
    }
  } catch {
    // Keep fallback below
  }

  const fallback = [createDefaultProject()];
  localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(fallback));
  return fallback;
}

function persistProjects(): void {
  localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
}

function loadActiveProjectId(knownProjects: ProjectProfile[]): string {
  const stored = localStorage.getItem(ACTIVE_PROJECT_KEY);
  if (stored && knownProjects.some((project) => project.id === stored)) {
    return stored;
  }

  return knownProjects[0].id;
}

function saveActiveProjectId(projectId: string): void {
  localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
}

function loadSets(knownProjects: ProjectProfile[], defaultProjectId: string): EnvSet[] {
  const raw = localStorage.getItem(SET_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as PersistedSet[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    const fallbackProjectId = knownProjects[0]?.id ?? defaultProjectId;

    return parsed
      .map((entry) => {
        const projectId = entry.projectId && knownProjects.some((project) => project.id === entry.projectId)
          ? entry.projectId
          : fallbackProjectId;

        const env = parseEnv(entry.rawText);

        return {
          id: entry.id,
          projectId,
          name: entry.name,
          role: entry.role ?? detectRole(entry.name, env.values),
          source: entry.source,
          rawText: entry.rawText,
          filePath: entry.filePath,
          values: env.values,
          duplicates: env.duplicates,
        };
      })
      .filter((entry) => entry.projectId.length > 0);
  } catch {
    return [];
  }
}

function persistSets(): void {
  const payload: PersistedSet[] = envSets.map((set) => ({
    id: set.id,
    projectId: set.projectId,
    name: set.name,
    role: set.role,
    source: set.source,
    rawText: set.rawText,
    filePath: set.filePath,
  }));

  localStorage.setItem(SET_STORAGE_KEY, JSON.stringify(payload));
}

function loadSampleData(projectId: string): void {
  addOrReplaceSet({
    projectId,
    name: ".env.local",
    role: "local",
    source: "manual",
    rawText: [
      "APP_NAME=Laravel",
      "APP_ENV=local",
      "APP_KEY=base64:localkey",
      "APP_DEBUG=true",
      "APP_URL=http://localhost",
      "DB_PASSWORD=localpass",
      "QUEUE_CONNECTION=sync",
      "MAIL_MAILER=log",
      "LOG_LEVEL=debug",
    ].join("\n"),
  });

  addOrReplaceSet({
    projectId,
    name: ".env.staging",
    role: "staging",
    source: "manual",
    rawText: [
      "APP_NAME=Laravel",
      "APP_ENV=staging",
      "APP_KEY=base64:stagingkey",
      "APP_DEBUG=false",
      "APP_URL=https://staging.example.com",
      "DB_PASSWORD=stagingpass",
      "QUEUE_CONNECTION=database",
      "MAIL_MAILER=smtp",
      "LOG_LEVEL=info",
    ].join("\n"),
  });

  addOrReplaceSet({
    projectId,
    name: ".env.production",
    role: "live",
    source: "manual",
    rawText: [
      "APP_NAME=Laravel",
      "APP_ENV=production",
      "APP_KEY=",
      "APP_DEBUG=true",
      "APP_URL=http://example.com",
      "QUEUE_CONNECTION=sync",
      "MAIL_MAILER=log",
      "LOG_LEVEL=debug",
    ].join("\n"),
  });
}

function seedManualInput(): void {
  manualNameEl.value = ".env.qa";
  manualRoleEl.value = "staging";
  manualContentEl.value = [
    "APP_NAME=Laravel",
    "APP_ENV=qa",
    "APP_KEY=base64:qakey",
    "APP_DEBUG=false",
    "APP_URL=https://qa.example.com",
    "DB_PASSWORD=qapass",
  ].join("\n");
}

function createDefaultProject(): ProjectProfile {
  return {
    id: crypto.randomUUID(),
    name: "Default Project",
    rootPath: "/Users/you/Code/laravel-app",
  };
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
