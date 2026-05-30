import { useCallback, useRef, useState } from "react";
import { CalendarArrowDown, CalendarArrowUp, Filter } from "lucide-react";

import type { TransactionSortOrder } from "../../data/types";
import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { FloatingPanel } from "../FloatingPanel";
import { Checkbox } from "../form";

const FILTER_MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 200 },
  anchor: "right",
  coordinateSpace: "viewport",
};

// Shared styling for the icon buttons that sit in the search bar's
// trailing cluster — mirrors the entry search modal's filter / sort
// buttons so the viewer's controls read as the same family.
function iconButtonClass(active: boolean): string {
  return `inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
    active
      ? "bg-accent/15 text-accent"
      : "text-muted hover:bg-surface-2 hover:text-fg"
  }`;
}

type Props = {
  // Current (viewer-local) sort order and the persisted default it was
  // seeded from. The button highlights when the user has steered away
  // from the default, matching the search modal's "non-default" cue.
  sortOrder: TransactionSortOrder;
  defaultSortOrder: TransactionSortOrder;
  onToggleSort: () => void;
  hideTransfers: boolean;
  onHideTransfersChange: (next: boolean) => void;
  hideUncompleted: boolean;
  onHideUncompletedChange: (next: boolean) => void;
  // Whether each filter is applicable to this sheet's data. An
  // inapplicable toggle is omitted; when neither applies the whole
  // filter button drops out.
  canHideTransfers: boolean;
  canHideUncompleted: boolean;
};

// Sort + filter cluster rendered next to the viewer modal's search
// field via `ModalSearchBar`'s `actions` slot. Read-only-viewer scoped:
// the sort toggle flips the same `transactionSortOrder` behaviour the
// editable sheet uses, and the filter popover hides transfers /
// uncompleted rows — all local to the open viewer, so closing it falls
// back to the persisted preferences.
export function BudgetViewerSearchControls({
  sortOrder,
  defaultSortOrder,
  onToggleSort,
  hideTransfers,
  onHideTransfersChange,
  hideUncompleted,
  onHideUncompletedChange,
  canHideTransfers,
  canHideUncompleted,
}: Props) {
  const t = useT();
  const newestFirst = sortOrder === "newestFirst";
  const sortLabel = newestFirst
    ? t("budget.viewerSortNewest")
    : t("budget.viewerSortOldest");
  const showFilter = canHideTransfers || canHideUncompleted;

  return (
    <>
      <button
        type="button"
        onClick={onToggleSort}
        aria-label={t("budget.viewerSortAria")}
        title={sortLabel}
        className={iconButtonClass(sortOrder !== defaultSortOrder)}
      >
        {newestFirst ? (
          <CalendarArrowDown size={16} aria-hidden focusable={false} />
        ) : (
          <CalendarArrowUp size={16} aria-hidden focusable={false} />
        )}
      </button>
      {showFilter && (
        <FilterMenu
          hideTransfers={hideTransfers}
          onHideTransfersChange={onHideTransfersChange}
          hideUncompleted={hideUncompleted}
          onHideUncompletedChange={onHideUncompletedChange}
          canHideTransfers={canHideTransfers}
          canHideUncompleted={canHideUncompleted}
        />
      )}
    </>
  );
}

function FilterMenu({
  hideTransfers,
  onHideTransfersChange,
  hideUncompleted,
  onHideUncompletedChange,
  canHideTransfers,
  canHideUncompleted,
}: {
  hideTransfers: boolean;
  onHideTransfersChange: (next: boolean) => void;
  hideUncompleted: boolean;
  onHideUncompletedChange: (next: boolean) => void;
  canHideTransfers: boolean;
  canHideUncompleted: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const active =
    open ||
    (canHideTransfers && hideTransfers) ||
    (canHideUncompleted && hideUncompleted);

  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("budget.viewerFilterMenuAria")}
        title={t("budget.viewerFilterMenuTitle")}
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
          aria-label={t("budget.viewerFilterMenuTitle")}
          className="flex flex-col"
        >
          <p className="border-b border-line bg-surface-3 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            {t("budget.viewerFilterMenuTitle")}
          </p>
          <div className="flex flex-col gap-2 px-3 py-3">
            {canHideTransfers && (
              <Checkbox
                checked={hideTransfers}
                onChange={onHideTransfersChange}
                label={t("budget.viewerFilterHideTransfers")}
              />
            )}
            {canHideUncompleted && (
              <Checkbox
                checked={hideUncompleted}
                onChange={onHideUncompletedChange}
                label={t("budget.viewerFilterHideUncompleted")}
              />
            )}
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
}
