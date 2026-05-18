import { Fragment, useMemo } from "react";

import { useEscapeKey } from "../hooks";
import { X } from "lucide-react";

import type {
  Account,
  HistoryEntry,
  HistoryImport,
  Settings,
} from "../data/types";
import { formatBalance, formatDayOnly, formatShortDate } from "../utils/format";
import { monthColorVar, monthNumberFromKey } from "../utils/monthColor";
import { useBodyScrollLock } from "../utils/scroll-lock";

const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

function formatMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return monthFormat.format(new Date(y, m - 1, 1));
}

type Props = {
  open: boolean;
  account: Account | null;
  entries: readonly HistoryEntry[];
  imports: readonly HistoryImport[];
  settings: Settings;
  onCancel: () => void;
};

// Read-only viewer for an account's imported history. Sorted
// newest-first so the user lands on the most recent activity, the
// way they think about their own bank statements. The imports audit
// trail sits below the entries — a quiet log of what was pulled in
// when, which a future "undo last import" affordance can hang off.
export function HistoryModal({
  open,
  account,
  entries,
  imports,
  settings,
  onCancel,
}: Props) {
  useBodyScrollLock(open);

  useEscapeKey(open, onCancel);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
  }, [entries]);

  const accountSettings = useMemo(
    () =>
      account?.currency
        ? { ...settings, currency: account.currency }
        : settings,
    [account, settings],
  );

  // Walk the sorted (newest-first) entries and emit one group per
  // `YYYY-MM` so the table can drop a colored month-marker row between
  // groups. Sequential entries that share a month stay together.
  const groups = useMemo(() => {
    const result: { monthKey: string; entries: HistoryEntry[] }[] = [];
    for (const e of sortedEntries) {
      const key = e.date.slice(0, 7);
      const last = result[result.length - 1];
      if (last && last.monthKey === key) last.entries.push(e);
      else result.push({ monthKey: key, entries: [e] });
    }
    return result;
  }, [sortedEntries]);

  // Size amount + balance columns from the longest formatted value in
  // the data so they don't claim more space than they need (which is
  // what was forcing the table off the right edge on narrow phones).
  // Description picks up whatever is left.
  const colChars = useMemo(() => {
    let amount = 0;
    let balance = 0;
    for (const e of sortedEntries) {
      const a = formatBalance(e.amount, accountSettings).length;
      const b = formatBalance(e.balance, accountSettings).length;
      if (a > amount) amount = a;
      if (b > balance) balance = b;
    }
    return { amount: Math.max(amount, 4), balance: Math.max(balance, 4) };
  }, [sortedEntries, accountSettings]);

  if (!open || !account) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="history-modal-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            History · {account.name}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden focusable={false} />
          </button>
        </header>

        <div className="flex-1 overflow-x-hidden overflow-y-auto">
          {sortedEntries.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">
              No history yet. Import a bank statement to populate this view.
            </p>
          ) : (
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-9 md:w-14" />
                <col />
                <col style={{ width: `calc(${colChars.amount}ch + 1rem)` }} />
                <col style={{ width: `calc(${colChars.balance}ch + 1rem)` }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface-3 text-xs tracking-wider uppercase text-muted">
                <tr className="border-b border-line">
                  <th className="px-1 py-1.5 text-center md:px-2 md:text-left">
                    Date
                  </th>
                  <th className="px-2 py-1.5 text-left">Description</th>
                  <th className="px-1 py-1.5 text-right md:px-2">Amount</th>
                  <th className="px-1 py-1.5 text-right md:px-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const monthNum = monthNumberFromKey(group.monthKey);
                  const monthColor =
                    monthNum !== null ? monthColorVar(monthNum) : undefined;
                  return (
                    <Fragment key={group.monthKey}>
                      <tr className="border-b border-line bg-surface-2">
                        <td
                          colSpan={4}
                          className="px-2 py-1 text-xs font-bold tracking-wider uppercase"
                          style={monthColor ? { color: monthColor } : undefined}
                        >
                          {formatMonth(group.monthKey)}
                        </td>
                      </tr>
                      {group.entries.map((e) => (
                        <tr
                          key={e.id}
                          className={`border-b border-line last:border-b-0 ${
                            e.hidden ? "opacity-50" : ""
                          }`}
                        >
                          <td
                            className="px-1 py-1.5 text-center align-top font-mono text-xs font-bold whitespace-nowrap md:px-2 md:text-left md:font-normal"
                            style={
                              monthColor ? { color: monthColor } : undefined
                            }
                          >
                            <span className="md:hidden">
                              {formatDayOnly(e.date)}
                            </span>
                            <span className="hidden md:inline">
                              {formatShortDate(
                                e.date,
                                settings.shortDateFormat,
                              )}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 align-top text-fg break-words">
                            {e.description}
                          </td>
                          <td
                            className={`px-1 py-1.5 text-right align-top font-mono tabular-nums whitespace-nowrap md:px-2 ${
                              e.amount < 0 ? "text-negative" : "text-positive"
                            }`}
                          >
                            {formatBalance(e.amount, accountSettings)}
                          </td>
                          <td className="px-1 py-1.5 text-right align-top font-mono tabular-nums whitespace-nowrap text-muted md:px-2">
                            {formatBalance(e.balance, accountSettings)}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {imports.length > 0 && (
          <div className="border-t border-line bg-surface-2 px-4 py-2 text-xs text-muted">
            <h3 className="mb-1 font-bold tracking-wider uppercase">Imports</h3>
            <ul className="flex flex-col gap-0.5">
              {imports.map((imp) => (
                <li key={imp.id} className="flex justify-between gap-2">
                  <span className="truncate font-mono text-fg">
                    {imp.filename}
                  </span>
                  <span className="whitespace-nowrap">
                    {imp.addedCount} new
                    {imp.duplicateCount > 0
                      ? `, ${imp.duplicateCount} skipped`
                      : ""}{" "}
                    · {imp.rangeStart} → {imp.rangeEnd}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
