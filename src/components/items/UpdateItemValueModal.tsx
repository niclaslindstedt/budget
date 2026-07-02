import { Coins } from "lucide-react";

import type { ImportedPoint } from "../../data/import/value-import";
import {
  isItemPurchaseValuePoint,
  resolveItemValueHistory,
} from "../../data/items/value";
import type { Item, ItemValuePoint, Settings } from "../../data/types";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatDate } from "../../utils/format";
import { ValueSnapshotModal } from "../ValueSnapshotModal";

// Record a new value for an owned item — appends one point to its
// `valueHistory` (the current value is the latest point on or before
// today). Lets an item that appreciates (art, sculptures, collectibles)
// track a rising value over time, which feeds the net-worth roll-up and
// graph. Lists the recorded history so the user can see and delete past
// snapshots. The item's purchase shows as the first value via
// `resolveItemValueHistory`; it's owned by the item's purchase fields, so
// it has no delete affordance. Mirrors `UpdateHoldingValueModal`.
//
// Values are stored as magnitudes (`Math.abs`) and the "as of" date caps at
// today. See `ValueSnapshotModal` for the shared shell.

type Props = {
  open: boolean;
  item: Item | null;
  settings: Settings;
  onClose: () => void;
  onAddValue: (itemId: string, point: ItemValuePoint) => void;
  onImportValues: (itemId: string, points: ImportedPoint[]) => void;
  onDeleteValue: (itemId: string, pointId: string) => void;
};

export function UpdateItemValueModal({
  open,
  item,
  settings,
  onClose,
  onAddValue,
  onImportValues,
  onDeleteValue,
}: Props) {
  const t = useT();
  const lang = useLang();

  if (!open || !item) return null;

  // Newest first, with the synthesised purchase point folded in.
  const history = resolveItemValueHistory(item).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  return (
    <ValueSnapshotModal
      open
      resetKey={item.id}
      icon={<Coins size={14} aria-hidden focusable={false} />}
      title={t("items.updateValueTitle")}
      labelledBy="update-item-value-modal-title"
      subject={item.name}
      settings={settings}
      valueLabel={t("items.valueLabel")}
      valuePlaceholder={t("items.valuePlaceholder")}
      asOfLabel={t("items.asOfLabel")}
      dateMax={todayIso()}
      historyHeading={t("items.valueHistoryHeading")}
      emptyHistoryText={t("items.noValueHistory")}
      importValueLabel={t("items.valueLabel")}
      normalizeAmount={Math.abs}
      history={history}
      onClose={onClose}
      onAdd={(point) => onAddValue(item.id, point)}
      onImport={(points) => onImportValues(item.id, points)}
      renderHistoryRow={(point) => {
        const isPurchase = isItemPurchaseValuePoint(point);
        return (
          <li
            key={point.id}
            className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
          >
            <span className="flex items-center gap-2 text-muted">
              {formatDate(point.date, settings.dateFormat, lang)}
              {isPurchase && (
                <span className="rounded-full border border-line px-1.5 text-[0.65rem] tracking-wider uppercase text-muted">
                  {t("items.purchaseValueTag")}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums text-fg-bright">
                {formatBalance(point.value, settings, {
                  neverAbbreviate: true,
                })}
              </span>
              {isPurchase ? (
                <span aria-hidden className="px-1 text-xs opacity-0">
                  ✕
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onDeleteValue(item.id, point.id)}
                  aria-label={t("items.deleteValue")}
                  className="cursor-pointer rounded border-0 bg-transparent px-1 text-xs text-muted hover:text-danger"
                >
                  ✕
                </button>
              )}
            </span>
          </li>
        );
      }}
    />
  );
}
