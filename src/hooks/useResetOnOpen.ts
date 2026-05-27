import { useEffect } from "react";

// Re-seed a modal's local state every time the modal opens (or the
// resetKey changes while open). Modals snapshot props into `useState`
// at mount, then need to re-snapshot when the user reopens them with
// different props — `open=false → true` or `row?.id` changing under
// an already-open modal.
//
// The `reset` closure typically calls a list of `setX(initialX)`
// statements. Captured fresh on each render so it sees the latest
// derived `initial*` values; we deliberately depend only on `open`
// and `resetKey` so unrelated prop churn (toast queue, language
// switch) doesn't discard the user's in-progress input.
export function useResetOnOpen(
  open: boolean,
  resetKey: unknown,
  reset: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resetKey]);
}
