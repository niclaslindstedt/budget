import { memo, useRef, useState } from "react";
import { Package, Pencil, Trash2 } from "lucide-react";

import type { Item, Settings } from "../../data/types";
import { computeItemCurrentValue } from "../../data/items/value";
import type { FloatingPlacement } from "../../hooks";
import { useRowSwipe } from "../../hooks/useRowSwipe";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatDate } from "../../utils/format";
import { FloatingPanel } from "../FloatingPanel";
import { useClaimActiveRow } from "../useClaimActiveRow";

type Props = {
  item: Item;
  settings: Settings;
  // Today's ISO date, passed down so every row shares one value (and the
  // parent can memoize current-value math against it).
  todayIso: string;
  onEditItem: (itemId: string) => void;
  onDeleteItem: (itemId: string, name: string) => void;
};

// Description popovers open below the row and to the left of the
// pressed name cell, capped so a long note wraps instead of ballooning
// off-screen. Mirrors the budget description popover placement.
const DESCRIPTION_POPOVER_PLACEMENT: FloatingPlacement = {
  width: { kind: "max", maxPx: 280 },
  anchor: "left",
  coordinateSpace: "document",
};

function ItemRowImpl({
  item,
  settings,
  todayIso,
  onEditItem,
  onDeleteItem,
}: Props) {
  const t = useT();
  const lang = useLang();
  const { swiped, setSwiped, touchHandlers } = useRowSwipe();
  const [descOpen, setDescOpen] = useState(false);
  const nameRef = useRef<HTMLButtonElement>(null);

  // A swiped row and an open popover both claim the active-row slot so a
  // tap elsewhere dismisses them before firing the underlying control.
  useClaimActiveRow(item.id, swiped, () => setSwiped(false));

  const hasNote = item.note !== undefined && item.note.trim() !== "";
  const currentValue = computeItemCurrentValue(item, todayIso);

  const rowClass = [
    swiped ? "is-swiped" : "",
    "border-b border-line last:border-b-0 hover:bg-surface-2",
    hasNote ? "cursor-pointer" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // A tap on a swiped row retracts the swipe (matching AccountRow); an
  // empty tap on a row with a note toggles the description popover.
  const onRowClick = () => {
    if (swiped) {
      setSwiped(false);
      return;
    }
  };

  const acquired = item.acquiredAt
    ? formatDate(item.acquiredAt, settings.dateFormat, lang)
    : "";

  return (
    <tr
      className={rowClass}
      data-row-id={item.id}
      data-swipe-handled
      onClick={onRowClick}
      {...touchHandlers}
    >
      <td className="w-10 px-2.5 py-2 align-middle">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-muted"
        >
          <Package size={14} aria-hidden focusable={false} />
        </span>
      </td>
      <td className="px-2.5 py-2 align-middle">
        {hasNote ? (
          <button
            ref={nameRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (swiped) {
                setSwiped(false);
                return;
              }
              setDescOpen((v) => !v);
            }}
            aria-label={t("itemsSheet.showDescriptionAria", {
              name: item.name,
            })}
            className="cursor-pointer border-0 bg-transparent p-0 text-left font-mono font-bold text-fg-bright hover:text-accent"
          >
            {item.name}
          </button>
        ) : (
          <span className="block font-mono font-bold text-fg-bright">
            {item.name}
          </span>
        )}
        {hasNote && (
          <FloatingPanel
            open={descOpen}
            onClose={() => setDescOpen(false)}
            triggerRef={nameRef}
            placement={DESCRIPTION_POPOVER_PLACEMENT}
            rowId={item.id}
            arrow="up"
            className="p-3 text-xs whitespace-pre-wrap text-fg"
          >
            {item.note}
          </FloatingPanel>
        )}
      </td>
      <td className="hidden px-2.5 py-2 text-right align-middle font-mono text-xs whitespace-nowrap text-muted tabular-nums sm:table-cell">
        {acquired}
      </td>
      <td className="px-2.5 py-2 text-right align-middle font-mono whitespace-nowrap text-muted tabular-nums">
        {item.purchasePrice !== undefined
          ? formatBalance(item.purchasePrice, settings)
          : "—"}
      </td>
      <td className="px-2.5 py-2 text-right align-middle font-mono whitespace-nowrap text-fg tabular-nums">
        {formatBalance(currentValue, settings)}
      </td>
      <td className="w-24 p-0 align-middle">
        <div className="flex h-full w-full items-stretch justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onEditItem(item.id);
            }}
            aria-label={t("itemsSheet.editItemAria", { name: item.name })}
            title={t("itemsSheet.editItemTitle")}
            className="action-btn action-btn-pen inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
          >
            <Pencil size={16} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onDeleteItem(item.id, item.name);
            }}
            aria-label={t("itemsSheet.deleteItemAria", { name: item.name })}
            title={t("itemsSheet.deleteItemTitle")}
            className="action-btn action-btn-delete inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-danger"
          >
            <Trash2 size={16} aria-hidden focusable={false} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// Memoised so a swipe / popover on one row doesn't re-render every
// sibling — matches AccountRow.
export const ItemRow = memo(ItemRowImpl);
