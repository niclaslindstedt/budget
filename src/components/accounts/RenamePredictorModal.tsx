import { useCallback, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import { useRefIdentity } from "../../hooks";
import { useT } from "../../i18n";
import type { RenameSuggestion } from "../../data/rename-patterns";
import { Button, ClearableInput } from "../form";
import { Modal } from "../Modal";

// Last step of every bank-history import that has rename suggestions to
// offer. Each row shows the raw bank description alongside an inline-
// editable input pre-filled with the learned suggestion; the user
// toggles a checkbox to accept / reject each row, optionally tweaks the
// text, and commits the batch.
//
// Footer (three buttons, by user direction):
//
// - `Cancel` discards the staged import — nothing lands in history.
// - `Skip` commits the import without any renames; the bank text rides
//   through unchanged. Useful when the suggestions all look wrong on a
//   one-off statement (a foreign currency receipt that happens to
//   match a normalised key, say).
// - `Apply renames (n)` commits the import and stamps `userDescription`
//   on the n checked entries. Label updates live with the count so the
//   button reflects what it will actually do.
//
// Inputs that open the soft keyboard (the per-row text fields) force
// this modal into the default fullscreen-on-mobile layout — the
// `centered` branch in `Modal` only suits modals whose footers never
// have to ride above the iOS keyboard.

export type RenameDecision = {
  entryId: string;
  userDescription: string;
  // Company learned alongside the description. Undefined when the
  // pattern never recorded one; the reducer leaves `userCompanyId`
  // untouched on the entry in that case.
  userCompanyId?: string;
};

type Props = {
  open: boolean;
  suggestions: readonly RenameSuggestion[];
  // The user closed the dialog without committing (Cancel button, X,
  // Escape, click-outside). Caller drops the staged import unread —
  // matches `ReconciliationModal.onCancel`.
  onCancel: () => void;
  // "Commit the import; here are the renames I want applied". An
  // empty array means "Skip" (commit without renames); a non-empty
  // array carries the user's accepted predictions.
  onCommit: (decisions: RenameDecision[]) => void;
};

export function RenamePredictorModal({
  open,
  suggestions,
  onCancel,
  onCommit,
}: Props) {
  const t = useT();

  // Local state per suggestion. Checked + edited text are mirrored so
  // the user can toggle a row off, leave its draft text alone, and
  // toggle it back on without losing what they typed.
  type RowState = {
    accepted: boolean;
    text: string;
  };
  const initialState = useMemo<Record<string, RowState>>(() => {
    const out: Record<string, RowState> = {};
    for (const s of suggestions) {
      out[s.entryId] = {
        accepted: true,
        text: s.suggestedDescription,
      };
    }
    return out;
  }, [suggestions]);
  const [rowState, setRowState] = useState<Record<string, RowState>>(
    () => initialState,
  );

  // Reset when the suggestion list identity changes — e.g. the user
  // cancelled and re-ran an import. The memo above re-fires; this
  // syncs the working state to the fresh defaults.
  const lastSeedRef = useRefIdentity(initialState);
  if (lastSeedRef.changed) {
    // Safe to call setState here — `useRefIdentity` only flips the
    // flag once per fresh `initialState` identity, so this is the
    // equivalent of a synchronous post-render sync and React handles
    // re-renders cleanly.
    setRowState(initialState);
  }

  const acceptedCount = useMemo(() => {
    let n = 0;
    for (const s of suggestions) {
      const state = rowState[s.entryId];
      if (state?.accepted && state.text.trim() !== "") n += 1;
    }
    return n;
  }, [suggestions, rowState]);

  const handleToggle = useCallback((entryId: string) => {
    setRowState((prev) => {
      const cur = prev[entryId];
      if (!cur) return prev;
      return { ...prev, [entryId]: { ...cur, accepted: !cur.accepted } };
    });
  }, []);

  const handleEdit = useCallback((entryId: string, value: string) => {
    setRowState((prev) => {
      const cur = prev[entryId];
      if (!cur) return prev;
      return { ...prev, [entryId]: { ...cur, text: value } };
    });
  }, []);

  const handleSkip = useCallback(() => {
    onCommit([]);
  }, [onCommit]);

  const handleCommit = useCallback(() => {
    const decisions: RenameDecision[] = [];
    for (const s of suggestions) {
      const state = rowState[s.entryId];
      if (!state?.accepted) continue;
      const trimmed = state.text.trim();
      if (trimmed === "") continue;
      decisions.push({
        entryId: s.entryId,
        userDescription: trimmed,
        userCompanyId: s.suggestedCompanyId,
      });
    }
    onCommit(decisions);
  }, [suggestions, rowState, onCommit]);

  if (!open) return null;

  const commitLabel =
    acceptedCount === 1
      ? t("renamePredictor.commitCountOne")
      : acceptedCount > 1
        ? t("renamePredictor.commitCountOther", { n: acceptedCount })
        : t("renamePredictor.commit");

  return (
    <Modal
      open={open}
      onClose={onCancel}
      labelledBy="rename-predictor-modal-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<Sparkles size={14} aria-hidden focusable={false} />}
        title={t("renamePredictor.title")}
        onClose={onCancel}
      />
      <Modal.Body>
        <p className="mb-3 text-sm text-muted">{t("renamePredictor.intro")}</p>
        <ul>
          {suggestions.map((s) => {
            const state = rowState[s.entryId] ?? {
              accepted: true,
              text: s.suggestedDescription,
            };
            const hitLabel =
              s.hitCount === 1
                ? t("renamePredictor.hitCountOne")
                : t("renamePredictor.hitCountOther", { n: s.hitCount });
            return (
              <li
                key={s.entryId}
                className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={state.accepted}
                    onChange={() => handleToggle(s.entryId)}
                    aria-label={t("renamePredictor.acceptAria", {
                      description: s.originalDescription,
                    })}
                    className="mt-1 cursor-pointer"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted">
                        {t("renamePredictor.original")}
                      </span>
                      <span className="font-mono text-sm break-words text-fg">
                        {s.originalDescription || "—"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted">
                        {t("renamePredictor.suggested")}
                      </span>
                      <ClearableInput
                        value={state.text}
                        onValueChange={(v) => handleEdit(s.entryId, v)}
                        placeholder={t("renamePredictor.suggestedPlaceholder")}
                        aria-label={t("renamePredictor.suggestionAria", {
                          description: s.originalDescription,
                        })}
                        disabled={!state.accepted}
                        className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                      />
                    </div>
                    <span className="text-xs text-muted">{hitLabel}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          {t("renamePredictor.cancel")}
        </Button>
        <Button variant="secondary" onClick={handleSkip}>
          {t("renamePredictor.skip")}
        </Button>
        <Button
          variant="primary"
          onClick={handleCommit}
          disabled={acceptedCount === 0}
        >
          {commitLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
