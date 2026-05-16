import { useEffect } from "react";
import { X } from "lucide-react";

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
  onCancel: () => void;
};

// A small generic confirmation modal. Title + description + a vertical
// stack of actions (each with its own tone), plus a Cancel. Used for the
// trash button on rows and for the "delete recurring series" prompt that
// adds extra scope options when the row belongs to a series.
export function ConfirmDialog({
  open,
  title,
  description,
  actions,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="confirm-dialog-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden focusable={false} />
          </button>
        </header>

        {description && (
          <div className="border-b border-line px-4 py-3 text-sm text-fg">
            {description}
          </div>
        )}

        <div className="flex flex-col gap-2 px-4 py-3">
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={action.onSelect}
              className={`cursor-pointer rounded border px-3 py-2 text-left text-sm font-medium ${
                action.tone === "danger"
                  ? "border-danger/60 bg-danger/10 text-danger hover:bg-danger/20"
                  : "border-line bg-surface-2 text-fg hover:border-accent hover:text-fg-bright"
              }`}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded border border-line px-3 py-2 text-sm text-muted hover:text-fg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
