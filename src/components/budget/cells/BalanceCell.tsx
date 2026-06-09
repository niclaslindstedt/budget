import { Minus, Plus } from "lucide-react";

import type { Settings } from "../../../data/types";
import { formatNumber } from "../../../utils/format";
import { plural, useT } from "../../../i18n";
import { CELL_BASE } from "./constants";

// Shared readonly balance cell. Three render paths in `BudgetCell` (default,
// `isTransfer`, `isHistory`) all need the same display logic plus
// the optional ↔ button that reveals hidden transfers behind this
// balance step, so the JSX is factored out here. When
// `hiddenTransferCount` is 0 the button branch never renders, so a
// balance with no hidden run upstream looks exactly like it always
// did.
export function BalanceCell({
  value,
  settings,
  hiddenTransferCount,
  transferExpanded,
  onToggleTransferAnchor,
}: {
  value: number;
  settings: Settings;
  hiddenTransferCount: number;
  transferExpanded: boolean;
  onToggleTransferAnchor?: () => void;
}) {
  const t = useT();
  const negative = value < 0;
  const abs = Math.abs(value);
  const body = formatNumber(abs, settings, {
    alwaysTwoFractionDigits: true,
    alwaysAbbreviate: settings.alwaysAbbreviateBalance,
  });
  const colourClass = negative ? "text-negative" : "text-positive";
  const showButton = hiddenTransferCount > 0 && !!onToggleTransferAnchor;
  return (
    <td className={`${CELL_BASE} bg-surface-3`} aria-readonly="true">
      <div className="relative flex items-stretch">
        {/* Non-clickable +/- glyph mirrors AmountCellDisplay so the
           balance reads in the same visual format as the amount column;
           sign is conveyed by the glyph rather than baked into the text.
           Muted on purpose — a colour-matched sign would read as a
           tappable sign-toggle button (which it is on the editable
           AmountCell). The number itself keeps its sign colour. Hidden
           on mobile to claw back column width — the number's sign colour
           still conveys direction, and balance has no tap-to-toggle
           affordance so the glyph carries no interactive meaning. */}
        <span
          className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-6 items-center justify-center text-muted opacity-60 md:flex"
          aria-hidden
        >
          {negative ? (
            <Minus size={14} aria-hidden focusable={false} />
          ) : (
            <Plus size={14} aria-hidden focusable={false} />
          )}
        </span>
        <span
          className={`flex w-full items-center justify-end px-[var(--table-cell-px)] py-[var(--table-cell-py)] font-mono tabular-nums whitespace-pre md:pl-6 ${
            settings.showCurrency && settings.currencyPosition === "after"
              ? "pr-8"
              : ""
          } ${colourClass}`}
        >
          {showButton ? (
            // Hidden transfers contributed to this balance step. Instead
            // of an explicit reveal-affordance, the number itself becomes
            // italic — a subtle hint that something is special about it —
            // and clickable, toggling the expansion that surfaces the
            // hidden transfer rows above.
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleTransferAnchor?.();
              }}
              aria-label={plural(
                t,
                "budget.hiddenTransferOne",
                "budget.hiddenTransferOther",
                hiddenTransferCount,
              )}
              title={
                transferExpanded
                  ? t("budget.collapseHiddenTransfers")
                  : t("budget.expandHiddenTransfers")
              }
              aria-expanded={transferExpanded}
              className="cursor-pointer border-0 bg-transparent p-0 font-mono tabular-nums whitespace-pre italic underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              {body}
            </button>
          ) : (
            <span>{body}</span>
          )}
        </span>
        {settings.showCurrency && (
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 ${
              settings.currencyPosition === "before"
                ? "left-0 md:left-6"
                : "right-2"
            } flex items-center font-mono text-xs text-muted`}
          >
            {settings.currency}
          </span>
        )}
      </div>
    </td>
  );
}
