import { TrendingUp } from "lucide-react";

import type { ImportedPoint } from "../../data/import/value-import";
import {
  isPurchaseValuePoint,
  resolveValueHistory,
} from "../../data/property-value/value";
import type { Property, PropertyValuePoint, Settings } from "../../data/types";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatDate } from "../../utils/format";
import { ValueSnapshotModal } from "../ValueSnapshotModal";

// Record a new market value for a property — appends one point to its
// `valueHistory` (the current value is the latest point). Also lists the
// recorded history so the user can see and delete past snapshots. The
// property's purchase (`purchaseAmount` at `purchaseDate`) shows as the first
// value via `resolveValueHistory`; it's owned by the property's purchase
// fields, so it has no delete affordance — change it by editing the property.
//
// Values are stored as magnitudes (`Math.abs`). See `ValueSnapshotModal` for
// the shared shell.

type Props = {
  open: boolean;
  property: Property | null;
  settings: Settings;
  onClose: () => void;
  onAddValue: (propertyId: string, point: PropertyValuePoint) => void;
  onImportValues: (propertyId: string, points: ImportedPoint[]) => void;
  onDeleteValue: (propertyId: string, pointId: string) => void;
};

export function UpdatePropertyValueModal({
  open,
  property,
  settings,
  onClose,
  onAddValue,
  onImportValues,
  onDeleteValue,
}: Props) {
  const t = useT();
  const lang = useLang();

  if (!open || !property) return null;

  // Newest snapshot first. Includes the synthesised purchase point (the
  // property's first value) so the list is never empty for a dated purchase.
  const history = resolveValueHistory(property).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  return (
    <ValueSnapshotModal
      open
      resetKey={property.id}
      icon={<TrendingUp size={14} aria-hidden focusable={false} />}
      title={t("properties.updateValueTitle")}
      labelledBy="update-value-modal-title"
      subject={property.name}
      settings={settings}
      valueLabel={t("properties.valueLabel")}
      valuePlaceholder={t("properties.valuePlaceholder")}
      asOfLabel={t("properties.asOfLabel")}
      historyHeading={t("properties.valueHistory")}
      emptyHistoryText={t("properties.noValueHistory")}
      importValueLabel={t("properties.valueLabel")}
      normalizeAmount={Math.abs}
      history={history}
      onClose={onClose}
      onAdd={(point) => onAddValue(property.id, point)}
      onImport={(points) => onImportValues(property.id, points)}
      renderHistoryRow={(point) => {
        const isPurchase = isPurchaseValuePoint(point);
        return (
          <li
            key={point.id}
            className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
          >
            <span className="flex items-center gap-2 text-muted">
              {formatDate(point.date, settings.dateFormat, lang)}
              {isPurchase && (
                <span className="rounded-full border border-line px-1.5 text-[0.65rem] tracking-wider uppercase text-muted">
                  {t("properties.purchaseValueTag")}
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
                // The purchase value is owned by the property's purchase
                // fields — change it by editing the property, not by
                // deleting a snapshot here.
                <span aria-hidden className="px-1 text-xs opacity-0">
                  ✕
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onDeleteValue(property.id, point.id)}
                  aria-label={t("properties.delete")}
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
