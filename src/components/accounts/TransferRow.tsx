import { memo, type CSSProperties } from "react";
import { ArrowRight, Pencil, Wallet } from "lucide-react";

import { useRowSwipe } from "../../hooks/useRowSwipe";
import { useLang, useT } from "../../i18n";
import { displayCategoryName } from "../../i18n/preset-names";
import type { Account, Category, Settings, Transfer } from "../../data/types";
import { formatBalance, formatShortDate } from "../../utils/format";
import { useClaimActiveRow } from "../useClaimActiveRow";
import { CategoryIconGlyph } from "../icons";

type Props = {
  transfer: Transfer;
  from: Account | null;
  to: Account | null;
  category: Category | null;
  settings: Settings;
  monthColor: string | undefined;
  onEditTransfer: (transferId: string) => void;
};

function TransferRowImpl({
  transfer,
  from,
  to,
  category,
  settings,
  monthColor,
  onEditTransfer,
}: Props) {
  const t = useT();
  const lang = useLang();
  const { swiped, setSwiped, touchHandlers } = useRowSwipe();

  // Hook the row into the ActiveRowProvider so a tap elsewhere in the
  // table only dismisses the swipe — mirrors `AccountRow` /
  // `BudgetRow`.
  useClaimActiveRow(transfer.id, swiped, () => setSwiped(false));

  const colorStyle: CSSProperties | undefined = monthColor
    ? { color: monthColor }
    : undefined;

  const editLabel = t("accountsSheet.editTransferAria", {
    description: transfer.description || t("cell.editTransfer"),
  });

  const rowClass = [
    swiped ? "is-swiped" : "",
    "border-b border-line last:border-b-0 hover:bg-surface-2",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <tr
      className={rowClass}
      data-row-id={transfer.id}
      data-swipe-handled
      {...touchHandlers}
    >
      <td
        className="w-14 pr-1 pl-2 py-2 align-middle font-mono text-xs whitespace-nowrap md:w-20 md:px-2"
        style={colorStyle}
      >
        {formatShortDate(transfer.date, settings.shortDateFormat, lang)}
      </td>
      <td className="pr-2 pl-1 py-2 align-middle md:px-2">
        <span className="block text-fg-bright">{transfer.description}</span>
        {category && (
          <span
            className="mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
            style={{
              color: category.color,
              backgroundColor: `color-mix(in srgb, ${category.color} 18%, transparent)`,
            }}
          >
            {displayCategoryName(category, t)}
          </span>
        )}
        {/* On mobile the dedicated transfer column is hidden — fold the
            from/to summary into the description cell instead so the
            row still shows the direction at a glance. */}
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted md:hidden">
          <AccountGlyph account={from} />
          <span className="truncate">
            {from?.name ?? t("accountsSheet.unknown")}
          </span>
          <ArrowRight
            size={10}
            aria-hidden
            focusable={false}
            className="shrink-0 text-flag"
          />
          <AccountGlyph account={to} />
          <span className="truncate">
            {to?.name ?? t("accountsSheet.unknown")}
          </span>
        </span>
      </td>
      <td className="hidden px-2 py-2 align-middle text-xs text-muted md:table-cell">
        <span className="inline-flex items-center gap-1.5">
          <AccountChip account={from} />
          <ArrowRight
            size={12}
            aria-hidden
            focusable={false}
            className="shrink-0 text-flag"
          />
          <AccountChip account={to} />
        </span>
      </td>
      <td className="px-2 py-2 text-right align-middle font-mono tabular-nums whitespace-nowrap text-fg-bright">
        {formatBalance(transfer.amount, settings)}
      </td>
      <td className="transfer-action-cell w-16 p-0 align-middle">
        <div className="flex h-full w-full items-stretch justify-end">
          <button
            type="button"
            onClick={() => {
              setSwiped(false);
              onEditTransfer(transfer.id);
            }}
            aria-label={editLabel}
            title={t("cell.editTransfer")}
            className="action-btn action-btn-pen inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
          >
            <Pencil size={16} aria-hidden focusable={false} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// Memoised so a swipe on one row doesn't re-render every sibling.
export const TransferRow = memo(TransferRowImpl);

// Pill-shaped account label used in the desktop transfer column.
// Internal to this file because no other surface needs the chip in
// the same shape.
function AccountChip({ account }: { account: Account | null }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs text-fg-bright">
      <AccountGlyph account={account} size={10} />
      <span className="truncate">
        {account?.name ?? t("accountsSheet.unknown")}
      </span>
    </span>
  );
}

// Colored circle + glyph for an account, with no surrounding chip
// chrome. Used directly on mobile inside the transfer row's
// description cell where the dedicated transfer column is hidden.
// Falls back to a wallet glyph when the account has no custom icon,
// matching the ACCOUNTS table row.
function AccountGlyph({
  account,
  size = 12,
}: {
  account: Account | null;
  size?: number;
}) {
  const circleSize = size + 6;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: circleSize,
        height: circleSize,
        color: account?.color,
        backgroundColor: account?.color
          ? `color-mix(in srgb, ${account.color} 18%, transparent)`
          : undefined,
      }}
    >
      {account?.glyph ? (
        <CategoryIconGlyph name={account.glyph} size={size} />
      ) : (
        <Wallet size={size} aria-hidden focusable={false} />
      )}
    </span>
  );
}
