import { Save } from "lucide-react";

type Props = {
  dirty: boolean;
  onSave: () => void;
};

// Sits next to the import/export icons in the header. The auto-save
// keeps storage clean (half-filled rows are filtered out), so when
// the user has typed something the auto-save deliberately skipped,
// the button lights up as the explicit "persist this anyway" escape
// hatch. Stays mounted in the disabled state when nothing is pending
// so the chrome doesn't shift.
export function SaveStateButton({ dirty, onSave }: Props) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={!dirty}
      aria-label={dirty ? "Save unsaved changes" : "All changes saved"}
      title={dirty ? "Save unsaved changes" : "All changes saved"}
      className={
        dirty
          ? "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-accent bg-accent/15 text-accent hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          : "inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded border border-line bg-transparent text-muted opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
      }
    >
      <Save size={18} aria-hidden focusable={false} />
    </button>
  );
}
