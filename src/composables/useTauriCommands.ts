import { invoke } from "@tauri-apps/api/core";
import type {
  ScannedEnvFile,
  PatchResult,
  UpsertResult,
  WriteEnvResult,
  MissingEntry,
  ProjectBackupSet,
  ProjectBackupResult,
  BackupEntry,
  BackupRotationResult,
  EnvSchemaResult,
  SchemaVariable,
  SchemaValidationIssue,
  GitEnvStatus,
  FileMtimeEntry,
  UnusedKeyResult,
} from "../types";

export function scanEnvFiles(projectRoot: string): Promise<ScannedEnvFile[]> {
  return invoke<ScannedEnvFile[]>("scan_env_files", { projectRoot });
}

export function inferProjectName(projectRoot: string): Promise<string> {
  return invoke<string>("infer_project_name", { projectRoot });
}

export function appendMissingEnvKeys(
  targetPath: string,
  projectRoot: string,
  entries: MissingEntry[],
  createBackup: boolean,
): Promise<PatchResult> {
  return invoke<PatchResult>("append_missing_env_keys", {
    targetPath,
    projectRoot,
    entries,
    createBackup,
  });
}

export function upsertEnvKey(
  targetPath: string,
  projectRoot: string,
  key: string,
  value: string,
  createBackup: boolean,
): Promise<UpsertResult> {
  return invoke<UpsertResult>("upsert_env_key", {
    targetPath,
    projectRoot,
    key,
    value,
    createBackup,
  });
}

export function writeEnvFile(
  targetPath: string,
  projectRoot: string,
  content: string,
  createBackup: boolean,
): Promise<WriteEnvResult> {
  return invoke<WriteEnvResult>("write_env_file", {
    targetPath,
    projectRoot,
    content,
    createBackup,
  });
}

export function writeProjectBackup(
  projectName: string,
  projectRoot: string,
  reason: string,
  sets: ProjectBackupSet[],
): Promise<ProjectBackupResult> {
  return invoke<ProjectBackupResult>("write_project_backup", {
    projectName,
    projectRoot,
    reason,
    sets,
  });
}

export function listProjectBackups(projectRoot: string): Promise<BackupEntry[]> {
  return invoke<BackupEntry[]>("list_project_backups", { projectRoot });
}

export function rotateBackups(
  envFilePath: string,
  keep: number,
): Promise<BackupRotationResult> {
  return invoke<BackupRotationResult>("rotate_backups", {
    envFilePath,
    keep,
  });
}

export function getFileMtime(filePath: string): Promise<number> {
  return invoke<number>("get_file_mtime", { filePath });
}

export function writeEnvExample(
  projectRoot: string,
  content: string,
): Promise<string> {
  return invoke<string>("write_env_example", { projectRoot, content });
}

// Schema validation commands

export function readEnvSchema(projectRoot: string): Promise<EnvSchemaResult> {
  return invoke<EnvSchemaResult>("read_env_schema", { projectRoot });
}

export function validateEnvAgainstSchema(
  values: Record<string, string>,
  schema: Record<string, SchemaVariable>,
): Promise<SchemaValidationIssue[]> {
  return invoke<SchemaValidationIssue[]>("validate_env_against_schema", {
    values,
    schema,
  });
}

export function generateEnvSchema(
  values: Record<string, string>,
): Promise<string> {
  return invoke<string>("generate_env_schema", { values });
}

export function writeEnvSchema(
  projectRoot: string,
  content: string,
): Promise<string> {
  return invoke<string>("write_env_schema", { projectRoot, content });
}

// Git status commands

export function checkEnvGitStatus(
  projectRoot: string,
): Promise<GitEnvStatus[]> {
  return invoke<GitEnvStatus[]>("check_env_git_status", { projectRoot });
}

// Cache validation commands

export function getEnvFileMtimes(
  projectRoot: string,
): Promise<FileMtimeEntry[]> {
  return invoke<FileMtimeEntry[]>("get_env_file_mtimes", { projectRoot });
}

// Unused variable detection commands

export function detectUnusedEnvKeys(
  projectRoot: string,
  keys: string[],
): Promise<UnusedKeyResult[]> {
  return invoke<UnusedKeyResult[]>("detect_unused_env_keys", {
    projectRoot,
    keys,
  });
}
