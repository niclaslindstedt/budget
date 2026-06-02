import { useCallback, useEffect } from "react";

import type { ActionHistoryEntry } from "../../../storage/useUserDataStorage";
import { useT } from "../../../i18n";
import { formatActionLabel } from "../../action-history-label";
import type { useToast } from "../../../hooks";

type Params = {
  canUndo: boolean;
  canRedo: boolean;
  historyEntries: readonly ActionHistoryEntry[];
  historyIndex: number;
  undo: () => void;
  redo: () => void;
  toast: ReturnType<typeof useToast>;
};

type Result = {
  handleUndo: () => void;
  handleRedo: () => void;
};

// Wraps the storage hook's undo / redo with a translated toast and a
// global Cmd/Ctrl+Z (and Cmd/Ctrl+Shift+Z / Ctrl+Y for redo) shortcut.
// The keyboard handler bails out when focus is inside an editable
// element so the browser's native field-level undo keeps working
// while the user is typing.
export function useUndoRedo({
  canUndo,
  canRedo,
  historyEntries,
  historyIndex,
  undo,
  redo,
  toast,
}: Params): Result {
  const t = useT();

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    // The entry at `historyIndex` is the action being reverted; the
    // cursor moves to the previous one after `undo()`.
    const entry = historyEntries[historyIndex];
    undo();
    if (entry) {
      toast.push({
        kind: "info",
        message: t("toast.undid", {
          action: formatActionLabel(t, entry.actionType, entry.subject),
        }),
      });
    }
  }, [canUndo, historyEntries, historyIndex, undo, toast, t]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    // The entry one slot past the cursor is the action being
    // re-applied; the cursor advances to it after `redo()`.
    const entry = historyEntries[historyIndex + 1];
    redo();
    if (entry) {
      toast.push({
        kind: "info",
        message: t("toast.redid", {
          action: formatActionLabel(t, entry.actionType, entry.subject),
        }),
      });
    }
  }, [canRedo, historyEntries, historyIndex, redo, toast, t]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (isUndo && canUndo) {
        e.preventDefault();
        handleUndo();
      } else if (isRedo && canRedo) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo, canUndo, canRedo]);

  return { handleUndo, handleRedo };
}
