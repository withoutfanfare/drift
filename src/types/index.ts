export type AppPage = "dashboard" | "projects" | "help";
export type EnvSource = "file" | "manual" | "scan";
export type EnvRole = "local" | "staging" | "live" | "other";
export type RowFilter = "all" | "missing" | "drift" | "unsafe" | "aligned";

export interface ProjectProfile {
  id: string;
  name: string;
  rootPath: string;
}

export interface EnvSet {
  id: string;
  projectId: string;
  name: string;
  role: EnvRole;
  source: EnvSource;
  rawText: string;
  filePath?: string;
  values: Record<string, string>;
  duplicates: string[];
  comments: Record<string, EnvComment>;
  validationWarnings: EnvValidationWarning[];
}

export interface KeyAnalysisRow {
  key: string;
  valuesBySet: Record<string, string | undefined>;
  missingCount: number;
  drift: boolean;
  unsafe: boolean;
  unsafeReasons: string[];
  primaryStatus: "missing" | "drift" | "unsafe" | "aligned";
}

export interface PersistedSet {
  id: string;
  projectId?: string;
  name: string;
  role?: EnvRole;
  source: EnvSource;
  rawText: string;
  filePath?: string;
}

export interface PersistedProject {
  id: string;
  name: string;
  rootPath: string;
}

export interface ScannedEnvFile {
  path: string;
  name: string;
  content: string;
}

export interface MissingEntry {
  key: string;
  value: string;
}

export interface PatchResult {
  appendedCount: number;
  skippedExisting: number;
  backupPath: string | null;
  updatedContent: string;
}

export interface UpsertResult {
  matchedCount: number;
  appended: boolean;
  backupPath: string | null;
  updatedContent: string;
}

export interface ProjectBackupSet {
  name: string;
  role: EnvRole;
  source: EnvSource;
  filePath?: string;
  rawText: string;
}

export interface ProjectBackupResult {
  backupPath: string;
  itemCount: number;
}

export interface WriteEnvResult {
  backupPath: string | null;
}

export interface LocalUpsertResult {
  updatedContent: string;
  matchedCount: number;
  appended: boolean;
}

export interface BackupEntry {
  path: string;
  fileName: string;
  reason: string;
  timestamp: number;
  sizeBytes: number;
  backupType: "json" | "bak";
}

export type ActivityCategory = "info" | "write" | "destructive" | "success" | "error";

export interface ActivityEntry {
  id: string;
  timestamp: number;
  category: ActivityCategory;
  summary: string;
  detail?: string;
  projectId?: string;
}

/** Comment documentation extracted from .env files */
export interface EnvComment {
  /** Line comment(s) preceding the key (lines starting with #) */
  above: string[];
  /** Inline comment after the value (KEY=value # this part) */
  inline: string | null;
}

/** Result of validating an .env file's syntax */
export interface EnvValidationWarning {
  line: number;
  message: string;
  severity: "error" | "warning";
}

/** A single change history entry for a key */
export interface ChangeHistoryEntry {
  key: string;
  previousValue: string | undefined;
  newValue: string;
  timestamp: number;
  envFilePath: string;
  envSetName: string;
}

/** Configuration for drift analysis rules */
export interface DriftRule {
  id: string;
  label: string;
  enabled: boolean;
}

/** A flagged value from cross-environment drift analysis */
export interface DriftWarning {
  ruleId: string;
  key: string;
  setId: string;
  setName: string;
  message: string;
  suggestion: string;
}

/** Grouping of variables by service prefix */
export interface VariableGroup {
  prefix: string;
  label: string;
  keys: string[];
  driftCount: number;
}

/** Backup rotation result from Rust backend */
export interface BackupRotationResult {
  deletedCount: number;
  deletedPaths: string[];
}

/** File watcher event from Rust backend */
export interface FileChangeEvent {
  path: string;
  kind: "modified" | "created" | "removed";
}
