import { useCallback, useRef, useState } from "react";
import { ChevronDown, Repeat } from "lucide-react";

import { CATEGORY_ICON_NAMES } from "../data/constants";
import type { CategoryIcon } from "../data/types";
import { useEscapeKey, usePointerOutside } from "../hooks";
import { GlyphGrid } from "./GlyphGrid";
import { CategoryIconGlyph } from "./icons";

type Props = {
  // `null` means "no custom glyph" — the description cell falls back to
  // the default Repeat icon on series rows and to nothing on one-offs.
  value: CategoryIcon | null;
  onChange: (next: CategoryIcon | null) => void;
  // What "null" looks like in this context. Default is the recurring
  // Repeat icon (used by series rows). Account modal passes "wallet"
  // so the picker's default matches the wallet avatar it shows next
  // to the name.
  defaultIcon?: CategoryIcon;
  defaultLabel?: string;
  // Optional curated palette. Defaults to the full allowlist so legacy
  // call sites (the cell-level recurring-glyph picker) keep showing
  // every glyph. Context-specific call sites pass a narrower list
  // (e.g. AccountModal passes ACCOUNT_GLYPH_NAMES).
  icons?: readonly CategoryIcon[];
  // Tints the trigger glyph and the selected cell in the dropdown.
  // When unset, both fall back to the "flag" accent.
  tintColor?: string;
};

export function GlyphPicker({
  value,
  onChange,
  defaultIcon,
  defaultLabel = defaultIcon
    ? `Default (${defaultIcon})`
    : "Default (recurring)",
  icons = CATEGORY_ICON_NAMES,
  tintColor,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEscapeKey(open, close);
  usePointerOutside(open, [rootRef], close);

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
            defaultIcon ? (
              <CategoryIconGlyph
                name={defaultIcon}
                size={14}
                className={tintColor ? undefined : "text-flag"}
                style={tintColor ? { color: tintColor } : undefined}
              />
            ) : (
              <Repeat
                size={14}
                className={tintColor ? undefined : "text-flag"}
                style={tintColor ? { color: tintColor } : undefined}
                aria-hidden
                focusable={false}
              />
            )
          ) : (
            <CategoryIconGlyph
              name={value}
              size={14}
              className={tintColor ? undefined : "text-flag"}
              style={tintColor ? { color: tintColor } : undefined}
            />
          )}
          <span className="text-xs text-muted">
            {value === null ? defaultLabel : value}
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
          <GlyphGrid
            icons={icons}
            value={value}
            onChange={pick}
            tintColor={tintColor}
            defaultSlot={{
              icon: defaultIcon ?? null,
              label: defaultIcon
                ? `Default ${defaultIcon} glyph`
                : "Default recurring glyph",
              selected: value === null,
              onSelect: () => pick(null),
              render: () =>
                defaultIcon ? (
                  <CategoryIconGlyph name={defaultIcon} size={14} />
                ) : (
                  <Repeat size={14} aria-hidden focusable={false} />
                ),
            }}
          />
        </div>
      )}
    </div>
  );
}
