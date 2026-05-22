import { useCallback, useState } from "react";
import { ChevronDown, Repeat } from "lucide-react";

import { CATEGORY_ICON_NAMES } from "../data/constants";
import type { CategoryIcon } from "../data/types";
import { useEscapeKey } from "../hooks";
import { useT } from "../i18n";
import { DismissBackdrop } from "./DismissBackdrop";
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
  defaultLabel,
  icons = CATEGORY_ICON_NAMES,
  tintColor,
}: Props) {
  const t = useT();
  const resolvedDefaultLabel =
    defaultLabel ??
    (defaultIcon
      ? t("glyph.defaultPrefix", { name: defaultIcon })
      : t("glyph.defaultRecurring"));
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEscapeKey(open, close);

  function pick(next: CategoryIcon | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="relative inline-block w-full">
      {open && <DismissBackdrop onDismiss={close} />}
      <button
        type="button"
        className="field-input relative z-[60] flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm hover:border-accent focus-visible:outline-none"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("glyph.chooseGlyph")}
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
            {value === null ? resolvedDefaultLabel : value}
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
          aria-label={t("glyph.glyphDialog")}
          className="absolute z-[60] mt-1 w-full rounded border border-line bg-surface-2 p-2 shadow-lg"
        >
          <GlyphGrid
            icons={icons}
            value={value}
            onChange={pick}
            tintColor={tintColor}
            defaultSlot={{
              icon: defaultIcon ?? null,
              label: defaultIcon
                ? t("glyph.defaultGlyphLabel", { name: defaultIcon })
                : t("glyph.defaultRecurringGlyphLabel"),
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
