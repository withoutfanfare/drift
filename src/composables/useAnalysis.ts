import type { EnvSet, KeyAnalysisRow } from "../types";
import { normalizeForComparison } from "./useEnvParser";

export function analyzeRows(sets: EnvSet[]): KeyAnalysisRow[] {
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

    const drift = normalizedValues.size > 1 || (missingCount > 0 && normalizedValues.size > 0);
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

export function evaluateUnsafe(set: EnvSet, key: string, value: string | undefined): string | null {
  const productionLike = isProductionLike(set);
  const lowered = (value ?? "").toLowerCase();
  const blank = value === undefined || value.trim().length === 0;

  if (productionLike && key === "APP_KEY" && blank) {
    return "APP_KEY is empty or missing";
  }

  if (productionLike && key === "APP_DEBUG" && (lowered === "true" || lowered === "1" || lowered === "yes" || lowered === "on")) {
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

export function isProductionLike(set: EnvSet): boolean {
  if (set.role === "live") {
    return true;
  }

  const env = (set.values.APP_ENV ?? "").toLowerCase();
  const name = set.name.toLowerCase();
  return env.includes("prod") || name.includes("prod") || name.includes("live");
}
