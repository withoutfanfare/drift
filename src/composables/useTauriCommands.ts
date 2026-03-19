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
