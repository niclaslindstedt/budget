import { useCallback, useRef, useState } from "react";
import { CalendarArrowDown, CalendarArrowUp, Filter } from "lucide-react";

import type { TransactionSortOrder } from "../data/types";
import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { FloatingPanel } from "./FloatingPanel";
import { Checkbox } from "./form";

const FILTER_MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 200 },
  anchor: "right",
  coordinateSpace: "viewport",
};

// Shared styling for the icon buttons that sit in a search bar's
// trailing cluster. Centralised here so every modal's sort / filter
// controls read as the same family — restyle once, propagate to all of
// them.
function iconButtonClass(active: boolean): string {
  return `inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
    active
      ? "bg-accent/15 text-accent"
      : "text-muted hover:bg-surface-2 hover:text-fg"
  }`;
}

export type ModalSearchSort = {
  // Current order and the persisted default it was seeded from. The
  // toggle highlights when the user has steered away from the default,
  // matching the entry search modal's "non-default" cue.
  order: TransactionSortOrder;
  defaultOrder: TransactionSortOrder;
  onToggle: () => void;
};

export type ModalSearchFilter = {
  // Stable React key. The label is caller-owned (already translated) so
  // each modal phrases its own filter while sharing this chrome.
  key: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
};

type Props = {
  // Both surfaces are optional so a modal can opt into sort, filter, or
  // both. Omit `sort` for a filter-only bar; pass an empty `filters`
  // (or omit it) to drop the filter button.
  sort?: ModalSearchSort;
  filters?: readonly ModalSearchFilter[];
};

// Universal sort + filter cluster for a search modal, rendered into
// `ModalSearchBar`'s `actions` slot. Keeping the chrome here means a
// design change to the search controls lands in every modal that shows
// them at once, instead of being copy-pasted per modal.
export function ModalSearchControls({ sort, filters }: Props) {
  return (
    <>
      {sort && <SortToggle sort={sort} />}
      {filters && filters.length > 0 && <FilterMenu filters={filters} />}
    </>
  );
}

function SortToggle({ sort }: { sort: ModalSearchSort }) {
  const t = useT();
  const newestFirst = sort.order === "newestFirst";
  const sortLabel = newestFirst
    ? t("search.sortNewest")
    : t("search.sortOldest");
  return (
    <button
      type="button"
      onClick={sort.onToggle}
      aria-label={t("search.sortAria")}
      title={sortLabel}
      className={iconButtonClass(sort.order !== sort.defaultOrder)}
    >
      {newestFirst ? (
        <CalendarArrowDown size={16} aria-hidden focusable={false} />
      ) : (
        <CalendarArrowUp size={16} aria-hidden focusable={false} />
      )}
    </button>
  );
}

function FilterMenu({ filters }: { filters: readonly ModalSearchFilter[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const active = open || filters.some((f) => f.checked);

  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("search.filterAria")}
        title={t("search.filterTitle")}
        className={iconButtonClass(active)}
      >
        <Filter size={16} aria-hidden focusable={false} />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        placement={FILTER_MENU_PLACEMENT}
        className="overflow-hidden"
      >
        <div
          role="dialog"
          aria-label={t("search.filterTitle")}
          className="flex flex-col"
        >
          <p className="border-b border-line bg-surface-3 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            {t("search.filterTitle")}
          </p>
          <div className="flex flex-col gap-2 px-3 py-3">
            {filters.map((f) => (
              <Checkbox
                key={f.key}
                checked={f.checked}
                onChange={f.onChange}
                label={f.label}
              />
            ))}
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
}
