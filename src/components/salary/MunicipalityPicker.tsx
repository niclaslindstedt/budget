import { useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";

import {
  MUNICIPALITIES,
  rateForMunicipality,
} from "../../data/tax/se/municipalities";
import { DEFAULT_TAX_YEAR } from "../../data/tax/se/constants";
import { useDesktopAutoFocus, type FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { FloatingPanel } from "../FloatingPanel";
import { ClearableInput, LISTBOX_OPTION_CLASS } from "../form";

// Searchable kommun picker. Modelled on EmployerPicker's FloatingPanel
// pattern but with a filter input above the list, since ~290 entries
// need narrowing. Custom button + listbox (never a native <select>).

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "left",
  coordinateSpace: "viewport",
};

type Props = {
  value: string;
  onChange: (municipalityId: string) => void;
};

function ratePercent(id: string): string {
  return `${(rateForMunicipality(id, DEFAULT_TAX_YEAR) * 100).toFixed(2)} %`;
}

export function MunicipalityPicker({ value, onChange }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(searchRef, open);

  const selected = useMemo(
    () => MUNICIPALITIES.find((m) => m.id === value) ?? null,
    [value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...MUNICIPALITIES].sort((a, b) =>
      a.name.localeCompare(b.name, "sv"),
    );
    if (q === "") return all;
    return all.filter((m) => m.name.toLowerCase().includes(q));
  }, [query]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative inline-block w-full">
      <button
        type="button"
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm hover:border-accent focus-visible:outline-none"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("tax.pickProfile")}
      >
        <span className="text-muted">
          <Building2 size={14} aria-hidden focusable={false} />
        </span>
        <span className="min-w-0 flex-1 truncate text-fg">
          {selected ? selected.name : t("tax.municipality")}
        </span>
        {selected && (
          <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
            {ratePercent(selected.id)}
          </span>
        )}
        <ChevronDown
          size={12}
          className="shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>

      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={rootRef}
        placement={PLACEMENT}
      >
        <div className="border-b border-line p-2">
          <ClearableInput
            ref={searchRef}
            value={query}
            onValueChange={setQuery}
            placeholder={t("tax.municipalitySearch")}
            className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
          />
        </div>
        <ul role="listbox" className="max-h-72 overflow-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">
              {t("tax.noMunicipalityMatch")}
            </li>
          ) : (
            filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={m.id === value}
                  onClick={() => {
                    onChange(m.id);
                    close();
                  }}
                  className={LISTBOX_OPTION_CLASS}
                >
                  <span className="min-w-0 flex-1 truncate text-fg">
                    {m.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                    {ratePercent(m.id)}
                  </span>
                  {m.id === value && (
                    <Check
                      size={14}
                      className="ml-1 shrink-0 text-accent"
                      aria-hidden
                      focusable={false}
                    />
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </FloatingPanel>
    </div>
  );
}
