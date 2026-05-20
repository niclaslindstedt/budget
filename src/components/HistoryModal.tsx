import { Fragment, useEffect, useMemo, useState } from "react";

import type {
  Account,
  HistoryEntry,
  HistoryImport,
  Settings,
} from "../data/types";
import { useLang, useT } from "../i18n";
import { bcp47, type Lang } from "../i18n/locale";
import { formatBalance, formatDayOnly, formatShortDate } from "../utils/format";
import { monthColorVar, monthNumberFromKey } from "../utils/monthColor";
import { Modal } from "./Modal";

const monthFormatCache = new Map<Lang, Intl.DateTimeFormat>();

function monthFormatFor(lang: Lang): Intl.DateTimeFormat {
  let f = monthFormatCache.get(lang);
  if (!f) {
    f = new Intl.DateTimeFormat(bcp47(lang), {
      month: "long",
      year: "numeric",
    });
    monthFormatCache.set(lang, f);
  }
  return f;
}

function formatMonth(key: string, lang: Lang): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return monthFormatFor(lang).format(new Date(y, m - 1, 1));
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
  const t = useT();
  const lang = useLang();
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
  }, [entries]);

  // The description column wraps with break-words to fit narrow phone
  // screens, which can mangle a long memo into a tower of two- or
  // three-letter fragments. Tapping a description opens a read-only
  // viewer that gives the text room to breathe.
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  useEffect(() => {
    if (!open) setSelectedEntry(null);
  }, [open]);

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
  // Credit-card imports leave `balance` undefined on every row; if no
  // entry carries one, we collapse the Balance column to zero width so
  // the table doesn't leave a visible empty stripe.
  const hasAnyBalance = useMemo(
    () => sortedEntries.some((e) => e.balance !== undefined),
    [sortedEntries],
  );
  const colChars = useMemo(() => {
    let amount = 0;
    let balance = 0;
    for (const e of sortedEntries) {
      const a = formatBalance(e.amount, accountSettings).length;
      if (a > amount) amount = a;
      if (e.balance !== undefined) {
        const b = formatBalance(e.balance, accountSettings).length;
        if (b > balance) balance = b;
      }
    }
    return { amount: Math.max(amount, 4), balance: Math.max(balance, 4) };
  }, [sortedEntries, accountSettings]);

  return (
    <Modal
      open={open && account !== null}
      onClose={onCancel}
      labelledBy="history-modal-title"
      size="max-w-2xl"
    >
      <Modal.Header
        title={t("history.titleAccount", { name: account?.name ?? "" })}
        onClose={onCancel}
      />
      <Modal.Body className="px-0 py-0 overflow-x-hidden">
        {sortedEntries.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted">
            {t("history.noEntries")}
          </p>
        ) : (
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-9 md:w-14" />
              <col />
              <col style={{ width: `calc(${colChars.amount}ch + 1rem)` }} />
              {hasAnyBalance && (
                <col style={{ width: `calc(${colChars.balance}ch + 1rem)` }} />
              )}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-3 text-xs tracking-wider uppercase text-muted">
              <tr className="border-b border-line">
                <th className="px-1 py-1.5 text-center md:px-2 md:text-left">
                  {t("history.date")}
                </th>
                <th className="px-2 py-1.5 text-left">
                  {t("history.description")}
                </th>
                <th className="px-1 py-1.5 text-right md:px-2">
                  {t("history.amount")}
                </th>
                {hasAnyBalance && (
                  <th className="px-1 py-1.5 text-right md:px-2">
                    {t("history.balance")}
                  </th>
                )}
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
                        colSpan={hasAnyBalance ? 4 : 3}
                        className="px-2 py-1 text-xs font-bold tracking-wider uppercase"
                        style={monthColor ? { color: monthColor } : undefined}
                      >
                        {formatMonth(group.monthKey, lang)}
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
                          style={monthColor ? { color: monthColor } : undefined}
                        >
                          <span className="md:hidden">
                            {formatDayOnly(e.date)}
                          </span>
                          <span className="hidden md:inline">
                            {formatShortDate(
                              e.date,
                              settings.shortDateFormat,
                              lang,
                            )}
                          </span>
                        </td>
                        <td className="align-top text-fg">
                          <button
                            type="button"
                            onClick={() => setSelectedEntry(e)}
                            className="block w-full cursor-pointer px-2 py-1.5 text-left break-words hover:text-fg-bright"
                          >
                            {e.description}
                          </button>
                        </td>
                        <td
                          className={`px-1 py-1.5 text-right align-top font-mono tabular-nums whitespace-nowrap md:px-2 ${
                            e.amount < 0 ? "text-negative" : "text-positive"
                          }`}
                        >
                          {formatBalance(e.amount, accountSettings)}
                        </td>
                        {hasAnyBalance && (
                          <td className="px-1 py-1.5 text-right align-top font-mono tabular-nums whitespace-nowrap text-muted md:px-2">
                            {e.balance !== undefined
                              ? formatBalance(e.balance, accountSettings)
                              : ""}
                          </td>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </Modal.Body>

      <Modal
        open={open && account !== null && selectedEntry !== null}
        onClose={() => setSelectedEntry(null)}
        labelledBy="history-description-title"
        size="max-w-md"
        scrollableBody={false}
      >
        <Modal.Header
          title={t("history.description")}
          onClose={() => setSelectedEntry(null)}
        />
        {selectedEntry && (
          <div className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-xs text-muted">
              <span className="font-mono whitespace-nowrap">
                {formatShortDate(
                  selectedEntry.date,
                  settings.shortDateFormat,
                  lang,
                )}
              </span>
              <span
                className={`font-mono tabular-nums whitespace-nowrap ${
                  selectedEntry.amount < 0 ? "text-negative" : "text-positive"
                }`}
              >
                {formatBalance(selectedEntry.amount, accountSettings)}
              </span>
            </div>
            <p className="text-sm break-words whitespace-pre-wrap text-fg">
              {selectedEntry.description}
            </p>
          </div>
        )}
      </Modal>

      {imports.length > 0 && (
        <div className="border-t border-line bg-surface-2 px-4 py-2 text-xs text-muted">
          <h3 className="mb-1 font-bold tracking-wider uppercase">
            {t("history.importsLabel")}
          </h3>
          <ul className="flex flex-col gap-0.5">
            {imports.map((imp) => (
              <li key={imp.id} className="flex justify-between gap-2">
                <span className="truncate font-mono text-fg">
                  {imp.filename}
                </span>
                <span className="whitespace-nowrap">
                  {imp.duplicateCount > 0
                    ? t("history.addedSkippedBoth", {
                        added: imp.addedCount,
                        duplicate: imp.duplicateCount,
                      })
                    : t("history.addedOnly", { added: imp.addedCount })}{" "}
                  · {imp.rangeStart} → {imp.rangeEnd}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
