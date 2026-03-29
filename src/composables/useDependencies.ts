import { computed } from "vue";

/**
 * Well-known Laravel/common dependency patterns.
 * Each entry maps a composite variable to its component variables.
 */
const DEPENDENCY_MAP: Record<string, string[]> = {
  DATABASE_URL: ["DB_HOST", "DB_PORT", "DB_DATABASE", "DB_USERNAME", "DB_PASSWORD"],
  DB_CONNECTION: ["DB_HOST", "DB_PORT", "DB_DATABASE", "DB_USERNAME", "DB_PASSWORD"],
  REDIS_URL: ["REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD"],
  REDIS_CLIENT: ["REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD"],
  MAIL_MAILER: ["MAIL_HOST", "MAIL_PORT", "MAIL_USERNAME", "MAIL_PASSWORD", "MAIL_ENCRYPTION", "MAIL_FROM_ADDRESS", "MAIL_FROM_NAME"],
  MAIL_DSN: ["MAIL_HOST", "MAIL_PORT", "MAIL_USERNAME", "MAIL_PASSWORD"],
  APP_URL: ["ASSET_URL", "SESSION_DOMAIN", "SANCTUM_STATEFUL_DOMAINS"],
  AWS_ENDPOINT_URL: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_DEFAULT_REGION", "AWS_BUCKET"],
  AWS_ACCESS_KEY_ID: ["AWS_SECRET_ACCESS_KEY", "AWS_DEFAULT_REGION", "AWS_BUCKET"],
  PUSHER_APP_ID: ["PUSHER_APP_KEY", "PUSHER_APP_SECRET", "PUSHER_APP_CLUSTER"],
  PUSHER_APP_KEY: ["PUSHER_APP_ID", "PUSHER_APP_SECRET", "PUSHER_APP_CLUSTER"],
  STRIPE_KEY: ["STRIPE_SECRET", "STRIPE_WEBHOOK_SECRET"],
  STRIPE_SECRET: ["STRIPE_KEY", "STRIPE_WEBHOOK_SECRET"],
};

/** Build reverse index: component → composite variables that reference it */
const REVERSE_MAP = new Map<string, Set<string>>();
for (const [composite, components] of Object.entries(DEPENDENCY_MAP)) {
  for (const component of components) {
    if (!REVERSE_MAP.has(component)) REVERSE_MAP.set(component, new Set());
    REVERSE_MAP.get(component)!.add(composite);
  }
}

export function useDependencies() {
  /**
   * Get variables that this key depends on (components of a composite).
   * e.g. DATABASE_URL → [DB_HOST, DB_PORT, ...]
   */
  function getDependencies(key: string): string[] {
    return DEPENDENCY_MAP[key] ?? [];
  }

  /**
   * Get composite variables that reference this key.
   * e.g. DB_HOST → [DATABASE_URL, DB_CONNECTION]
   */
  function getDependents(key: string): string[] {
    const set = REVERSE_MAP.get(key);
    return set ? [...set] : [];
  }

  /**
   * Get all related keys — both directions combined, deduplicated.
   */
  function getRelatedKeys(key: string): string[] {
    const deps = getDependencies(key);
    const dependents = getDependents(key);
    const all = new Set([...deps, ...dependents]);
    all.delete(key);
    return [...all];
  }

  /**
   * Check if modifying this key should prompt the user to check related variables.
   */
  function hasRelatedKeys(key: string): boolean {
    return getDependencies(key).length > 0 || REVERSE_MAP.has(key);
  }

  return {
    getDependencies,
    getDependents,
    getRelatedKeys,
    hasRelatedKeys,
  };
}
