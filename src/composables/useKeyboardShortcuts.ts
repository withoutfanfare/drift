import { ref, onMounted, onUnmounted } from "vue";

export interface ShortcutEntry {
  keys: string;
  label: string;
  description: string;
}

const SHORTCUT_HELP: ShortcutEntry[] = [
  { keys: "Cmd+F", label: "Search", description: "Focus the filter/search input" },
  { keys: "Cmd+S", label: "Save", description: "Save pending changes to disk" },
  { keys: "Cmd+/", label: "Shortcuts", description: "Toggle this shortcuts overlay" },
  { keys: "Arrow Up/Down", label: "Navigate", description: "Move between rows in the comparison matrix" },
  { keys: "Enter", label: "Expand", description: "Open the inline editor for the focused row" },
  { keys: "Escape", label: "Close", description: "Close the editor or dismiss dialogs" },
];

const helpVisible = ref(false);

export function useKeyboardShortcuts(handlers: {
  onSearch?: () => void;
  onSave?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onEnter?: () => void;
  onEscape?: () => void;
}) {
  function handleKeydown(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement;
    const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

    // Cmd+/ — toggle help overlay
    if (meta && e.key === "/") {
      e.preventDefault();
      helpVisible.value = !helpVisible.value;
      return;
    }

    // Cmd+F — focus search
    if (meta && e.key === "f") {
      e.preventDefault();
      handlers.onSearch?.();
      return;
    }

    // Cmd+S — save
    if (meta && e.key === "s") {
      e.preventDefault();
      handlers.onSave?.();
      return;
    }

    // Don't handle navigation keys when focused on inputs
    if (isInput) return;

    // Arrow keys — navigate matrix
    if (e.key === "ArrowUp") {
      e.preventDefault();
      handlers.onNavigateUp?.();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      handlers.onNavigateDown?.();
      return;
    }

    // Enter — expand/edit
    if (e.key === "Enter") {
      e.preventDefault();
      handlers.onEnter?.();
      return;
    }

    // Escape — close
    if (e.key === "Escape") {
      e.preventDefault();
      if (helpVisible.value) {
        helpVisible.value = false;
        return;
      }
      handlers.onEscape?.();
      return;
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", handleKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", handleKeydown);
  });

  return {
    helpVisible,
    SHORTCUT_HELP,
  };
}
