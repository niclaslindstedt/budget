import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { History } from "lucide-react";

import { compareDateStrings } from "../../data/fiscal-month";
import type { Account, HistoryEntry, Settings } from "../../data/types";
import { useLang, useT } from "../../i18n";
import {
  formatBalance,
  formatNumber,
  formatShortDate,
  formatYearMonth,
  withCurrency,
} from "../../utils/format";
import { monthColorVar, monthNumberFromKey } from "../../utils/monthColor";
import { ColumnIcon } from "../icons";
import { Modal } from "../Modal";
import { ModalSearchBar } from "../ModalSearchBar";

type Props = {
  open: boolean;
  account: Account | null;
  entries: readonly HistoryEntry[];
  settings: Settings;
  onCancel: () => void;
};

// Read-only viewer for an account's imported history. Shows only the
// raw bank-statement fields the import carried (date, bank
// description, amount, balance) — no resolved type, no user-curated
// description override. User-curated metadata (types, merchant
// hints, renames) belongs to the budget view; this is the unmodified
// bank statement. Visually it mirrors the budget view's coloring
// (per-month tint on the date column and month headers, signed
// green/red on amount and balance) so the columns scan as easily.
export function HistoryModal({
  open,
  account,
  entries,
  settings,
  onCancel,
}: Props) {
  const t = useT();
  const lang = useLang();

  const allSortedEntries = useMemo(() => {
    const order = settings.transactionSortOrder;
    return [...entries].sort((a, b) =>
      compareDateStrings(a.date, b.date, order),
    );
  }, [entries, settings.transactionSortOrder]);

  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  const accountSettings = useMemo(
    () =>
      account?.currency
        ? { ...settings, currency: account.currency }
        : settings,
    [account, settings],
  );
  // Lowercase the searchable fields once per (entries, settings) change.
  // Without this, every keystroke in the search bar walked the full
  // list re-lowercasing each description and re-running `formatBalance`
  // (an `Intl.NumberFormat` call) per entry — a multi-year account
  // with thousands of entries did thousands of Intl format calls per
  // keystroke. The cached haystacks reduce per-keystroke work to a
  // plain `indexOf`.
  const indexedEntries = useMemo(
    () =>
      allSortedEntries.map((entry) => ({
        entry,
        descriptionLc: entry.description.toLowerCase(),
        amountLc: formatBalance(entry.amount, accountSettings).toLowerCase(),
      })),
    [allSortedEntries, accountSettings],
  );
  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return allSortedEntries;
    const out: HistoryEntry[] = [];
    for (const indexed of indexedEntries) {
      if (
        indexed.descriptionLc.includes(q) ||
        indexed.amountLc.includes(q) ||
        indexed.entry.date.includes(q)
      ) {
        out.push(indexed.entry);
      }
    }
    return out;
  }, [allSortedEntries, indexedEntries, query]);

  const groups = useMemo(() => {
    const result: { monthKey: string; entries: HistoryEntry[] }[] = [];
    for (const e of filteredEntries) {
      const key = e.date.slice(0, 7);
      const last = result[result.length - 1];
      if (last && last.monthKey === key) last.entries.push(e);
      else result.push({ monthKey: key, entries: [e] });
    }
    return result;
  }, [filteredEntries]);

  // Credit-card imports leave `balance` undefined on every row; if no
  // entry carries one, we collapse the Balance column to zero width so
  // the table doesn't leave a visible empty stripe.
  const hasAnyBalance = useMemo(
    () => filteredEntries.some((e) => e.balance !== undefined),
    [filteredEntries],
  );

  const colWidths = useMemo(() => {
    let amountChars = 0;
    let balanceChars = 0;
    for (const e of filteredEntries) {
      const fullAmount = withCurrency(
        formatNumber(Math.abs(e.amount), accountSettings, {
          alwaysTwoFractionDigits: true,
        }),
        accountSettings,
      );
      if (fullAmount.length > amountChars) amountChars = fullAmount.length;
      if (e.balance !== undefined) {
        const fullBalance = withCurrency(
          formatNumber(Math.abs(e.balance), accountSettings, {
            alwaysTwoFractionDigits: true,
          }),
          accountSettings,
        );
        if (fullBalance.length > balanceChars)
          balanceChars = fullBalance.length;
      }
    }
    return {
      amountChars: Math.max(amountChars, 4),
      balanceChars: Math.max(balanceChars, 4),
    };
  }, [filteredEntries, accountSettings]);

  const mobileGridTemplate = useMemo(() => {
    const tracks: string[] = ["auto"];
    tracks.push("minmax(0, 1fr)");
    tracks.push(`minmax(56px, calc(${colWidths.amountChars} * 1ch + 1rem))`);
    if (hasAnyBalance) {
      tracks.push(`minmax(56px, calc(${colWidths.balanceChars} * 1ch + 1rem))`);
    }
    return tracks.join(" ");
  }, [hasAnyBalance, colWidths]);

  return (
    <Modal
      open={open && account !== null}
      onClose={onCancel}
      labelledBy="history-modal-title"
      size="max-w-6xl"
      fixedHeight
    >
      <Modal.Header
        icon={<History size={14} aria-hidden focusable={false} />}
        title={t("history.titleAccount", { name: account?.name ?? "" })}
        onClose={onCancel}
      />
      <Modal.Body noPadding className="overflow-x-hidden">
        <ModalSearchBar
          value={query}
          onChange={setQuery}
          placeholder={t("history.searchPlaceholder")}
        />
        {allSortedEntries.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted">
            {t("history.noEntries")}
          </p>
        ) : filteredEntries.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted">
            {t("history.searchNoResults")}
          </p>
        ) : (
          <table
            className="budget-viewer-table w-full border-collapse text-sm"
            style={
              {
                "--viewer-row-template": mobileGridTemplate,
              } as CSSProperties
            }
          >
            {/* `top: -1px` closes a subpixel-rounded hairline on iOS Safari
                where scrolled rows would otherwise bleed through above the
                sticky band. Mirrors the `.budget-table > thead` trick. */}
            <thead
              className="sticky z-10 bg-surface-3 text-xs tracking-wider uppercase text-muted"
              style={{ top: "-1px" }}
            >
              <tr className="border-b border-line">
                <th className="px-1 pt-2.5 pb-1.5 text-center whitespace-nowrap md:px-2 md:text-left">
                  <span className="inline-flex items-center gap-1.5 md:gap-2">
                    <ColumnIcon type="date" className="shrink-0 text-accent" />
                    <span className="hidden md:inline">
                      {t("history.date")}
                    </span>
                  </span>
                </th>
                <th className="px-2 pt-2.5 pb-1.5 text-left md:w-full md:pl-4">
                  <span className="inline-flex items-center gap-1.5 md:gap-2">
                    <ColumnIcon
                      type="description"
                      className="shrink-0 text-accent"
                    />
                    <span className="hidden md:inline">
                      {t("history.description")}
                    </span>
                  </span>
                </th>
                <th className="px-1 pt-2.5 pb-1.5 text-right whitespace-nowrap md:px-2">
                  <span className="inline-flex items-center gap-1.5 md:gap-2">
                    <ColumnIcon
                      type="amount"
                      className="shrink-0 text-accent"
                    />
                    <span className="hidden md:inline">
                      {t("history.amount")}
                    </span>
                  </span>
                </th>
                {hasAnyBalance && (
                  <th className="px-1 pt-2.5 pb-1.5 text-right whitespace-nowrap md:pr-2 md:pl-4">
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <ColumnIcon
                        type="balance"
                        className="shrink-0 text-accent"
                      />
                      <span className="hidden md:inline">
                        {t("history.balance")}
                      </span>
                    </span>
                  </th>
                )}
              </tr>
            </thead>
            {/* One <tbody> per month so each month-header tr's
                sticky containing block ends at the next month — gives
                the natural slide-off-as-next-arrives behaviour without
                stacking every label at the same offset. */}
            {groups.map((group) => {
              const colSpan = 3 + (hasAnyBalance ? 1 : 0);
              const monthNum = monthNumberFromKey(group.monthKey);
              const monthColor =
                monthNum !== null ? monthColorVar(monthNum) : undefined;
              const monthColorStyle: CSSProperties | undefined = monthColor
                ? { color: monthColor }
                : undefined;
              return (
                <tbody key={group.monthKey}>
                  <tr className="budget-viewer-fullspan budget-viewer-month-header">
                    <td
                      colSpan={colSpan}
                      className={`border-b border-line bg-surface-2 px-2 text-xs font-bold tracking-wider uppercase ${monthColor ? "" : "text-muted"}`}
                      style={monthColorStyle}
                    >
                      <span className="flex h-7 items-center">
                        {formatYearMonth(group.monthKey, lang)}
                      </span>
                    </td>
                  </tr>
                  {group.entries.map((e) => {
                    const entryMonthNum = monthNumberFromKey(e.date);
                    const entryMonthColor =
                      entryMonthNum !== null
                        ? monthColorVar(entryMonthNum)
                        : undefined;
                    const dateStyle: CSSProperties | undefined = entryMonthColor
                      ? { color: entryMonthColor }
                      : undefined;
                    return (
                      <tr
                        key={e.id}
                        className={`border-b border-line last:border-b-0 ${
                          e.hidden ? "opacity-50" : ""
                        }`}
                      >
                        <td
                          className={`px-1 py-1.5 align-top font-mono text-xs whitespace-nowrap md:px-2 ${entryMonthColor ? "" : "text-muted"}`}
                          style={dateStyle}
                        >
                          {formatShortDate(
                            e.date,
                            settings.shortDateFormat,
                            lang,
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top break-words md:pl-4">
                          {e.description}
                        </td>
                        <td
                          className={`px-1 py-1.5 text-right align-top font-mono tabular-nums whitespace-nowrap md:px-2 ${
                            e.amount < 0 ? "text-negative" : "text-positive"
                          }`}
                        >
                          {formatBalance(e.amount, accountSettings)}
                        </td>
                        {hasAnyBalance && (
                          <td
                            className={`px-1 py-1.5 text-right align-top font-mono tabular-nums whitespace-nowrap md:pr-2 md:pl-4 ${
                              e.balance === undefined
                                ? "text-muted"
                                : e.balance < 0
                                  ? "text-negative"
                                  : "text-positive"
                            }`}
                          >
                            {e.balance !== undefined
                              ? formatBalance(e.balance, accountSettings)
                              : ""}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        )}
      </Modal.Body>
    </Modal>
  );
}
