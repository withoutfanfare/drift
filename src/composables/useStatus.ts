import { ref } from "vue";

const statusMessage = ref("");
let clearTimer: ReturnType<typeof setTimeout> | null = null;

export function useStatus() {
  function setStatus(message: string, autoClearMs = 8000) {
    statusMessage.value = message;

    if (clearTimer) {
      clearTimeout(clearTimer);
    }

    if (autoClearMs > 0) {
      clearTimer = setTimeout(() => {
        statusMessage.value = "";
        clearTimer = null;
      }, autoClearMs);
    }
  }

  function clearStatus() {
    statusMessage.value = "";
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
  }

  return { statusMessage, setStatus, clearStatus };
}
