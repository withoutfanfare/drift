import { ref, computed } from "vue";

const STORAGE_KEY = "edm.masking.v1";
const MASK_PLACEHOLDER = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

const SENSITIVE_PATTERNS = [
  /_SECRET$/i,
  /_KEY$/i,
  /_PASSWORD$/i,
  /_TOKEN$/i,
  /^DB_/i,
  /^AWS_/i,
  /^STRIPE_/i,
  /^REDIS_PASSWORD$/i,
  /^MAIL_PASSWORD$/i,
  /^PUSHER_APP_SECRET$/i,
  /_PRIVATE/i,
  /^API_KEY$/i,
  /^SECRET$/i,
];

const SAFE_VALUES = new Set(["true", "false", "null", "", "0", "1", "yes", "no"]);

function loadMasked(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== "false";
  } catch {
    return true;
  }
}

const globalMasked = ref(loadMasked());

export function useMasking() {
  function toggleMasking() {
    globalMasked.value = !globalMasked.value;
    localStorage.setItem(STORAGE_KEY, String(globalMasked.value));
  }

  function isSensitiveKey(key: string): boolean {
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
  }

  function maskValue(key: string, value: string): string {
    if (SAFE_VALUES.has(value.toLowerCase())) return value;
    if (!globalMasked.value && !isSensitiveKey(key)) return value;
    return MASK_PLACEHOLDER;
  }

  function shouldMask(key: string, value: string): boolean {
    if (SAFE_VALUES.has(value.toLowerCase())) return false;
    if (globalMasked.value) return true;
    return isSensitiveKey(key);
  }

  return {
    globalMasked: computed(() => globalMasked.value),
    toggleMasking,
    isSensitiveKey,
    maskValue,
    shouldMask,
    MASK_PLACEHOLDER,
  };
}
