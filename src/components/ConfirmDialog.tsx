import { useEffect, useState } from "react";
import { Loader } from "lucide-react";

import { useT } from "../i18n";
import { Modal } from "./Modal";

type Tone = "default" | "danger";

export type ConfirmAction = {
  label: string;
  tone?: Tone;
  // Free-form callback; the parent decides what each option means.
  onSelect: () => void;
};

type Props = {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  actions: ConfirmAction[];
  // Hide the bottom Cancel button when the action set already covers
  // dismissal (e.g. an idle-warning modal whose only action is "stay
  // signed in", which is what cancelling means too). The X close
  // button, Escape, and click-outside still trigger `onCancel`.
  hideCancel?: boolean;
  onCancel: () => void;
};

// A small generic confirmation modal. Title + description + a vertical
// stack of actions (each with its own tone), plus a Cancel. Used for the
// trash button on rows and for the "delete recurring series" prompt that
// adds extra scope options when the row belongs to a series.
//
// On mobile the shell fills the viewport, so the description + actions
// are centred between the header and the bottom edge (a `flex-1`
// wrapper with `justify-center`). On desktop the shell is content-sized
// and the wrapper degrades to a no-op stack.
//
// Tapping an action paints a spinner inside the button before running
// `onSelect`. A heavy reducer update (e.g. deleting an entire recurring
// series across many months) can otherwise block paint long enough that
// the tap feels lost — the two-frame defer lets the browser show the
// spinner first, then dispatch runs. The modal also blocks further
// dismissal while a dispatch is in flight so the user can't double-fire.
export function ConfirmDialog({
  open,
  title,
  description,
  actions,
  hideCancel,
  onCancel,
}: Props) {
  const t = useT();
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) setPendingIndex(null);
  }, [open]);

  const isPending = pendingIndex !== null;

  const runAction = (index: number, onSelect: () => void) => {
    if (isPending) return;
    setPendingIndex(index);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => onSelect());
    });
  };

  const handleClose = () => {
    if (isPending) return;
    onCancel();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      labelledBy="confirm-dialog-title"
      role="alertdialog"
      size="max-w-md"
      scrollableBody={false}
    >
      <Modal.Header title={title} onClose={handleClose} />
      <div className="flex flex-1 flex-col justify-center">
        {description && (
          <div className="border-b border-line px-4 py-3 text-sm text-fg">
            {description}
          </div>
        )}
        <div className="flex flex-col gap-2 px-4 py-3">
          {actions.map((action, i) => {
            const buttonPending = pendingIndex === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => runAction(i, action.onSelect)}
                disabled={isPending}
                aria-busy={buttonPending || undefined}
                className={`flex items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed ${
                  isPending && !buttonPending ? "opacity-50" : ""
                } ${isPending ? "" : "cursor-pointer"} ${
                  action.tone === "danger"
                    ? "border-danger/60 bg-danger/10 text-danger hover:bg-danger/20"
                    : "border-line bg-surface-2 text-fg hover:border-accent hover:text-fg-bright"
                }`}
              >
                <span className="flex-1">{action.label}</span>
                {buttonPending && (
                  <Loader
                    size={14}
                    aria-hidden
                    focusable={false}
                    className="animate-spin"
                  />
                )}
              </button>
            );
          })}
          {!hideCancel && (
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className={`rounded border border-line px-3 py-2 text-sm text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${
                isPending ? "" : "cursor-pointer"
              }`}
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
