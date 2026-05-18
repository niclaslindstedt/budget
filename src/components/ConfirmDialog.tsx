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
export function ConfirmDialog({
  open,
  title,
  description,
  actions,
  hideCancel,
  onCancel,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      labelledBy="confirm-dialog-title"
      role="alertdialog"
      size="max-w-md"
      scrollableBody={false}
    >
      <Modal.Header title={title} onClose={onCancel} />
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
        {!hideCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded border border-line px-3 py-2 text-sm text-muted hover:text-fg"
          >
            Cancel
          </button>
        )}
      </div>
    </Modal>
  );
}
