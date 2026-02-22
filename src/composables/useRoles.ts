import type { EnvRole, RowFilter } from "../types";

export function detectRole(name: string, values: Record<string, string>): EnvRole {
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

export function roleSort(role: EnvRole): number {
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

export function asRole(value: string): EnvRole {
  if (value === "local" || value === "staging" || value === "live" || value === "other") {
    return value;
  }
  return "other";
}

export function asFilter(value: string): RowFilter {
  if (value === "missing" || value === "drift" || value === "unsafe" || value === "aligned") {
    return value;
  }
  return "all";
}
