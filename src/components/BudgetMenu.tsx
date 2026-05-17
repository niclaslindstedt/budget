import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Settings as SettingsIcon } from "lucide-react";

type Props = {
  onOpenSettings: () => void;
};

// Per-budget "..." dropdown that lives next to the budget name in the
// sheet header. Today it only offers "Settings"; future budget-level
// actions (rename inline, duplicate, delete) slot in here as the
// multi-sheet UI lands.
export function BudgetMenu({ onOpenSettings }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Budget menu"
        title="Budget menu"
        className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
          open
            ? "border-fg bg-surface-2 text-fg"
            : "border-line text-muted hover:border-fg hover:bg-surface-2 hover:text-fg"
        }`}
      >
        <MoreHorizontal size={16} aria-hidden focusable={false} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          >
            <span className="text-muted">
              <SettingsIcon size={16} aria-hidden focusable={false} />
            </span>
            <span>Settings</span>
          </button>
        </div>
      )}
    </div>
  );
}
