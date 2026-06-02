import { type MessageKey, type TFunction } from "../i18n";
import type { ActionSubject } from "../data/action-summary";

// Resolve a reducer action type to a translated label, falling back to
// the generic "Action" label when the catalog doesn't carry a specific
// entry for the type (defensive against new action types landing without
// a translation).
function labelForAction(t: TFunction, actionType: string): string {
  const key = `actionHistory.action.${actionType}` as MessageKey;
  const resolved = t(key);
  if (resolved === key) return t("actionHistory.action.unknown");
  return resolved;
}

// Compose the full action-history line: the verb+object label plus the
// object it acted on. A named subject is quoted ("Edited payslip 'BookBeat
// 2026-04'"); a count is suffixed ("Deleted rows (3)"). Shared by the
// action-history modal and the undo / redo toasts so both read
// identically.
export function formatActionLabel(
  t: TFunction,
  actionType: string,
  subject?: ActionSubject,
): string {
  const base =
    actionType === "initial"
      ? t("actionHistory.initial")
      : labelForAction(t, actionType);
  if (!subject) return base;
  return subject.kind === "name"
    ? t("actionHistory.subjectFormat", { label: base, subject: subject.value })
    : t("actionHistory.countFormat", { label: base, count: subject.value });
}
