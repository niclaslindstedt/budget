import { memo, type CSSProperties } from "react";
import { ArrowRight, Pencil, Wallet } from "lucide-react";

import { useRowSwipe } from "../../hooks/useRowSwipe";
import { useLang, useT } from "../../i18n";
import { displayCategoryName } from "../../i18n/preset-names";
import type { Account, Category, Settings, Transfer } from "../../data/types";
import { formatBalance, formatShortDate } from "../../utils/format";
import { tintBorder, tintFill } from "../../utils/tint";
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
        className="w-14 pr-1 pl-2 py-2 align-middle font-mono text-xs whitespace-nowrap md:w-20 md:px-2.5"
        style={colorStyle}
      >
        {formatShortDate(transfer.date, settings.shortDateFormat, lang)}
      </td>
      <td className="pr-2 pl-1 py-2 align-middle font-mono md:px-2.5">
        <span className="block text-fg-bright">{transfer.description}</span>
        {category && (
          <span
            className="mt-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: tintFill(category.color),
              borderColor: tintBorder(category.color),
              color: category.color,
            }}
          >
            <CategoryIconGlyph name={category.icon} size={12} />
            <span className="truncate">{displayCategoryName(category, t)}</span>
          </span>
        )}
      </td>
      <td className="px-1 py-2 align-middle font-mono text-xs text-muted md:px-2.5">
        {/* Mobile keeps the column tight: just the coloured glyph
            circles + arrow. Desktop swaps in the full pilled chip so
            the from/to account names are visible at a glance. */}
        <span className="inline-flex items-center gap-1 md:hidden">
          <AccountGlyph account={from} />
          <ArrowRight
            size={10}
            aria-hidden
            focusable={false}
            className="shrink-0 text-flag"
          />
          <AccountGlyph account={to} />
        </span>
        <span className="hidden items-center gap-1.5 md:inline-flex">
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
      <td className="px-2.5 py-2 text-right align-middle font-mono tabular-nums whitespace-nowrap text-fg-bright">
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
export const AccountTransferRow = memo(TransferRowImpl);

// Colored circle + glyph for an account, with no surrounding chip
// chrome. Used on mobile in the transfer column where there's no room
// for the full account name — the pair of glyphs + arrow keeps the
// column narrow so the description doesn't have to wrap. Falls back
// to a wallet glyph when the account has no custom icon, matching
// the ACCOUNTS table row.
function AccountGlyph({
  account,
  size = 14,
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
        backgroundColor: account?.color ? tintFill(account.color) : undefined,
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

// Pill-shaped account label used in the desktop transfer column.
// Mirrors the budget table's readonly type pill (rounded-full, color-
// mixed bg + border, font-medium label, inline glyph) so accounts and
// budgets share a single visual vocabulary for "tagged" identifiers.
function AccountChip({ account }: { account: Account | null }) {
  const t = useT();
  const color = account?.color;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: color ? tintFill(color) : undefined,
        borderColor: color ? tintBorder(color) : "var(--line)",
        color: color ?? "var(--fg-bright)",
      }}
    >
      {account?.glyph ? (
        <CategoryIconGlyph name={account.glyph} size={12} />
      ) : (
        <Wallet size={12} aria-hidden focusable={false} />
      )}
      <span className="truncate">
        {account?.name ?? t("accountsSheet.unknown")}
      </span>
    </span>
  );
}
