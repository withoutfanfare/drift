import { ref, computed } from "vue";

const STORAGE_KEY = "edm.secretDetection.v1";

interface SecretRule {
  id: string;
  label: string;
  enabled: boolean;
}

const DEFAULT_RULES: SecretRule[] = [
  { id: "high-entropy", label: "High-entropy strings (likely tokens or keys)", enabled: true },
  { id: "known-prefix", label: "Known secret prefixes (sk_, pk_, key_, secret_, token_)", enabled: true },
  { id: "password-name", label: "Password/credential variable names", enabled: true },
  { id: "base64-key", label: "Base64-encoded keys", enabled: true },
];

/** Variable name patterns that indicate secrets */
const SECRET_NAME_PATTERNS = [
  /_SECRET$/i,
  /_PASSWORD$/i,
  /_TOKEN$/i,
  /_KEY$/i,
  /_PRIVATE/i,
  /^API_KEY$/i,
  /^SECRET$/i,
  /^PASSWORD$/i,
  /^AUTH_/i,
  /^JWT_/i,
  /^OAUTH_/i,
];

/** Value prefixes that indicate secrets */
const SECRET_VALUE_PREFIXES = ["sk_", "pk_", "key_", "secret_", "token_", "ghp_", "gho_", "ghs_", "ghr_", "xoxb-", "xoxp-", "xoxs-"];

/** Safe values that should never be flagged */
const SAFE_VALUES = new Set([
  "true", "false", "null", "", "0", "1", "yes", "no",
  "local", "production", "staging", "testing",
  "sync", "database", "redis", "sqs", "beanstalkd",
  "log", "smtp", "ses", "mailgun", "postmark", "sendmail",
  "debug", "info", "notice", "warning", "error", "critical", "alert", "emergency",
  "file", "single", "daily", "stack", "syslog", "errorlog",
  "mysql", "pgsql", "sqlite", "sqlsrv",
]);

function loadRules(): SecretRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RULES.map((r) => ({ ...r }));
    const parsed = JSON.parse(raw) as SecretRule[];
    if (!Array.isArray(parsed)) return DEFAULT_RULES.map((r) => ({ ...r }));
    return DEFAULT_RULES.map((def) => {
      const saved = parsed.find((p) => p.id === def.id);
      return saved ? { ...def, enabled: saved.enabled } : { ...def };
    });
  } catch {
    return DEFAULT_RULES.map((r) => ({ ...r }));
  }
}

const rules = ref<SecretRule[]>(loadRules());

function persistRules() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules.value));
  } catch {
    // Silently fail
  }
}

export function useSecretDetection() {
  function toggleRule(ruleId: string) {
    const rule = rules.value.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = !rule.enabled;
      persistRules();
    }
  }

  function isRuleEnabled(ruleId: string): boolean {
    return rules.value.find((r) => r.id === ruleId)?.enabled ?? false;
  }

  /**
   * Detect whether a value looks like a secret based on its key name and value.
   * Returns a description of why it was flagged, or null if not suspicious.
   */
  function detectSecret(key: string, value: string): string | null {
    if (!value || SAFE_VALUES.has(value.toLowerCase())) return null;

    // Rule: Password/credential variable names
    if (isRuleEnabled("password-name")) {
      if (SECRET_NAME_PATTERNS.some((p) => p.test(key))) {
        return "Variable name suggests a secret or credential";
      }
    }

    // Rule: Known secret prefixes in value
    if (isRuleEnabled("known-prefix")) {
      const lower = value.toLowerCase();
      for (const prefix of SECRET_VALUE_PREFIXES) {
        if (lower.startsWith(prefix)) {
          return `Value starts with '${prefix}' — likely an API key or token`;
        }
      }
    }

    // Rule: Base64-encoded keys
    if (isRuleEnabled("base64-key")) {
      if (/^base64:[A-Za-z0-9+/=]{20,}$/.test(value)) {
        return "Value appears to be a base64-encoded key";
      }
    }

    // Rule: High-entropy strings
    if (isRuleEnabled("high-entropy")) {
      if (isHighEntropy(value)) {
        return "High-entropy string — likely a generated token or key";
      }
    }

    return null;
  }

  return {
    rules: computed(() => rules.value),
    toggleRule,
    detectSecret,
  };
}

/**
 * Measure whether a string has high entropy (appears random).
 * A value is considered high-entropy if it is long and uses a mix of character classes.
 */
function isHighEntropy(value: string): boolean {
  if (value.length < 20) return false;

  // Skip URLs and paths — they're long but not secrets
  if (/^https?:\/\//i.test(value)) return false;
  if (value.startsWith("/") || value.includes("://")) return false;

  let hasUpper = false;
  let hasLower = false;
  let hasDigit = false;
  let hasSpecial = false;

  for (const ch of value) {
    if (/[A-Z]/.test(ch)) hasUpper = true;
    else if (/[a-z]/.test(ch)) hasLower = true;
    else if (/[0-9]/.test(ch)) hasDigit = true;
    else if (/[^A-Za-z0-9]/.test(ch)) hasSpecial = true;
  }

  const classCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

  // Require at least 3 character classes for strings >= 20 chars
  // or at least 2 classes for strings >= 32 chars
  return classCount >= 3 || (classCount >= 2 && value.length >= 32);
}
