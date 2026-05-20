import { Loader, Save } from "lucide-react";

import { useT } from "../i18n";

type Props = {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
};

// Sits next to the import/export icons in the header. The auto-save
// keeps storage clean (half-filled rows are filtered out), so when
// the user has typed something the auto-save deliberately skipped,
// the button lights up as the explicit "persist this anyway" escape
// hatch. Stays mounted in the disabled state when nothing is pending
// so the chrome doesn't shift. While a save is in flight the disk
// glyph swaps for a spinner so the click has visible feedback even
// when the cloud round-trip takes a moment.
export function SaveStateButton({ dirty, saving, onSave }: Props) {
  const t = useT();
  const label = saving
    ? t("saveState.saving")
    : dirty
      ? t("saveState.saveUnsaved")
      : t("saveState.allSaved");
  const enabled = dirty && !saving;
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={!enabled}
      aria-label={label}
      title={label}
      aria-busy={saving || undefined}
      className={
        enabled
          ? "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-accent bg-accent/15 text-accent hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          : saving
            ? "inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded border border-accent bg-accent/15 text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
            : "inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded border border-line bg-transparent text-muted opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
      }
    >
      {saving ? (
        <Loader
          size={18}
          aria-hidden
          focusable={false}
          className="animate-spin"
        />
      ) : (
        <Save size={18} aria-hidden focusable={false} />
      )}
    </button>
  );
}
