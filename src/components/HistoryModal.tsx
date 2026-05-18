import { useEffect, useMemo } from "react";
import { X } from "lucide-react";

import type {
  Account,
  HistoryEntry,
  HistoryImport,
  Settings,
} from "../data/types";
import { formatBalance, formatShortDate } from "../utils/format";
import { useBodyScrollLock } from "../utils/scroll-lock";

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

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

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

        <div className="flex-1 overflow-y-auto">
          {sortedEntries.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">
              No history yet. Import a bank statement to populate this view.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-surface-3 text-xs tracking-wider uppercase text-muted">
                <tr className="border-b border-line">
                  <th className="px-2 py-1.5 text-left">Date</th>
                  <th className="px-2 py-1.5 text-left">Description</th>
                  <th className="px-2 py-1.5 text-right">Amount</th>
                  <th className="px-2 py-1.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((e) => (
                  <tr
                    key={e.id}
                    className={`border-b border-line last:border-b-0 ${
                      e.hidden ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-2 py-1.5 align-middle font-mono text-xs text-muted whitespace-nowrap">
                      {formatShortDate(e.date, settings.shortDateFormat)}
                    </td>
                    <td className="px-2 py-1.5 align-middle text-fg">
                      {e.description}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right align-middle font-mono tabular-nums whitespace-nowrap ${
                        e.amount < 0 ? "text-negative" : "text-positive"
                      }`}
                    >
                      {formatBalance(e.amount, accountSettings)}
                    </td>
                    <td className="px-2 py-1.5 text-right align-middle font-mono tabular-nums whitespace-nowrap text-muted">
                      {formatBalance(e.balance, accountSettings)}
                    </td>
                  </tr>
                ))}
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
