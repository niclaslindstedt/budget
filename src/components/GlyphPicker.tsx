import { useEffect, useRef, useState } from "react";
import { ChevronDown, Repeat } from "lucide-react";

import { CATEGORY_ICON_NAMES } from "../data/constants";
import type { CategoryIcon } from "../data/types";
import { CategoryIconGlyph } from "./icons";

type Props = {
  // `null` means "no custom glyph" — the description cell falls back to
  // the default Repeat icon on series rows and to nothing on one-offs.
  value: CategoryIcon | null;
  onChange: (next: CategoryIcon | null) => void;
};

export function GlyphPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: PointerEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function pick(next: CategoryIcon | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative inline-block w-full">
      <button
        type="button"
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm hover:border-accent focus-visible:outline-none"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Choose glyph"
      >
        <span className="inline-flex items-center gap-2 text-fg">
          {value === null ? (
            <Repeat
              size={14}
              className="text-flag"
              aria-hidden
              focusable={false}
            />
          ) : (
            <CategoryIconGlyph name={value} size={14} className="text-flag" />
          )}
          <span className="text-xs text-muted">
            {value === null ? "Default (recurring)" : value}
          </span>
        </span>
        <ChevronDown
          size={12}
          className="ml-auto shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Glyph"
          className="absolute z-30 mt-1 w-full rounded border border-line bg-surface-2 p-2 shadow-lg"
        >
          <div className="grid grid-cols-8 gap-1">
            <button
              type="button"
              onClick={() => pick(null)}
              aria-label="Default recurring glyph"
              aria-pressed={value === null}
              title="Default (recurring)"
              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded border ${
                value === null
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:border-fg"
              }`}
            >
              <Repeat size={14} aria-hidden focusable={false} />
            </button>
            {CATEGORY_ICON_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => pick(name)}
                aria-label={`Glyph ${name}`}
                aria-pressed={value === name}
                title={name}
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded border ${
                  value === name
                    ? "border-accent text-accent"
                    : "border-line text-muted hover:border-fg"
                }`}
              >
                <CategoryIconGlyph name={name} size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
