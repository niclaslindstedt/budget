import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { FileText, History } from "lucide-react";

import { resolveEntryLabels } from "../data/sheet";
import type {
  Account,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Settings,
} from "../data/types";
import { useLang, useT } from "../i18n";
import { bcp47, type Lang } from "../i18n/locale";
import { formatBalance, formatShortDate } from "../utils/format";
import { monthColorVar, monthNumberFromKey } from "../utils/monthColor";
import { CategoryIconGlyph, ColumnIcon } from "./icons";
import { Modal } from "./Modal";
import { ModalSearchBar } from "./ModalSearchBar";

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

type ResolvedEntry = {
  entry: HistoryEntry;
  description: string;
  typeId: string | null;
};

type Props = {
  open: boolean;
  account: Account | null;
  entries: readonly HistoryEntry[];
  // EntryType registry so resolved typeIds can render their icon and
  // colour, matching the budget view's row chrome.
  types: readonly EntryType[];
  // Merchant-hint store + user match rules — fed through the same
  // priority chain as `synthesizeHistoryRow` so the description and
  // type icon shown here match what the budget view would render for
  // the same bank entry.
  merchantHints: Readonly<Record<string, MerchantHint>>;
  matchRules: readonly MatchRule[];
  settings: Settings;
  onCancel: () => void;
};

// Read-only viewer for an account's imported history. Mirrors the
// budget view's chrome: TYPE column with the resolved category icon,
// month dividers tinted by the per-month pastel, sticky thead, and
// the same date / amount / balance formatting. The search bar at the
// top filters rows in place against description, type name, and the
// amount text — and scrolls away with the content so the table claims
// the full viewport once the user is reading.
export function HistoryModal({
  open,
  account,
  entries,
  types,
  merchantHints,
  matchRules,
  settings,
  onCancel,
}: Props) {
  const t = useT();
  const lang = useLang();

  const typesById = useMemo(() => {
    const m = new Map<string, EntryType>();
    for (const ty of types) m.set(ty.id, ty);
    return m;
  }, [types]);

  // Resolve once per (entries, hints, rules) so the search filter
  // below can match against the labels users actually see rather
  // than the raw bank text.
  const resolved = useMemo<ResolvedEntry[]>(() => {
    const arr: ResolvedEntry[] = [];
    for (const entry of entries) {
      // Split entries have no single typeId — leave it null so the
      // icon column stays blank rather than picking an arbitrary
      // split's type. Description still flows through the override
      // chain so the user's label (if any) shows here.
      if (entry.splits && entry.splits.length > 0) {
        const { description } = resolveEntryLabels(
          entry,
          merchantHints,
          matchRules,
        );
        arr.push({ entry, description, typeId: null });
        continue;
      }
      const { description, typeId } = resolveEntryLabels(
        entry,
        merchantHints,
        matchRules,
      );
      arr.push({ entry, description, typeId });
    }
    return arr;
  }, [entries, merchantHints, matchRules]);

  const allSortedEntries = useMemo(() => {
    return [...resolved].sort((a, b) =>
      a.entry.date < b.entry.date ? 1 : a.entry.date > b.entry.date ? -1 : 0,
    );
  }, [resolved]);

  // In-place filter against description, resolved type name, and the
  // formatted amount text so a search like "550" or "amazon" or "rent"
  // narrows the table without leaving the modal.
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
  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return allSortedEntries;
    return allSortedEntries.filter((r) => {
      if (r.description.toLowerCase().includes(q)) return true;
      if (r.entry.description.toLowerCase().includes(q)) return true;
      const type = r.typeId ? typesById.get(r.typeId) : null;
      if (type && type.name.toLowerCase().includes(q)) return true;
      if (
        formatBalance(r.entry.amount, accountSettings).toLowerCase().includes(q)
      )
        return true;
      if (r.entry.date.includes(q)) return true;
      return false;
    });
  }, [allSortedEntries, query, typesById, accountSettings]);

  // The description column wraps with break-words to fit narrow phone
  // screens, which can mangle a long memo into a tower of two- or
  // three-letter fragments. Tapping a description opens a read-only
  // viewer that gives the text room to breathe.
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  useEffect(() => {
    if (!open) setSelectedEntry(null);
  }, [open]);

  // Walk the sorted (newest-first) entries and emit one group per
  // `YYYY-MM` so the table can drop a colored month-marker row between
  // groups. Sequential entries that share a month stay together.
  const groups = useMemo(() => {
    const result: { monthKey: string; entries: ResolvedEntry[] }[] = [];
    for (const e of filteredEntries) {
      const key = e.entry.date.slice(0, 7);
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
    () => filteredEntries.some((e) => e.entry.balance !== undefined),
    [filteredEntries],
  );
  // Show the TYPE column only when at least one entry resolves to a
  // known type — credit-card-only accounts that have never been
  // categorised stay narrower without an empty icon column.
  const hasAnyType = useMemo(
    () => filteredEntries.some((e) => e.typeId !== null),
    [filteredEntries],
  );
  // Size amount + balance columns from the longest formatted value in
  // the data so they don't claim more space than they need (which is
  // what was forcing the table off the right edge on narrow phones).
  // Description picks up whatever is left.
  const colChars = useMemo(() => {
    let amount = 0;
    let balance = 0;
    for (const r of filteredEntries) {
      const a = formatBalance(r.entry.amount, accountSettings).length;
      if (a > amount) amount = a;
      if (r.entry.balance !== undefined) {
        const b = formatBalance(r.entry.balance, accountSettings).length;
        if (b > balance) balance = b;
      }
    }
    return { amount: Math.max(amount, 4), balance: Math.max(balance, 4) };
  }, [filteredEntries, accountSettings]);

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
          clearLabel={t("history.searchClear")}
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
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-12 md:w-20" />
              {hasAnyType && <col className="w-9 md:w-10" />}
              <col />
              <col style={{ width: `calc(${colChars.amount}ch + 1rem)` }} />
              {hasAnyBalance && (
                <col style={{ width: `calc(${colChars.balance}ch + 1rem)` }} />
              )}
            </colgroup>
            {/* `top: -1px` closes a subpixel-rounded hairline on iOS Safari
                where scrolled rows would otherwise bleed through above the
                sticky band. Mirrors the `.sheet-table > thead` trick. */}
            <thead
              className="sticky z-10 bg-surface-3 text-xs tracking-wider uppercase text-muted"
              style={{ top: "-1px" }}
            >
              <tr className="border-b border-line">
                <th className="px-1 pt-2.5 pb-1.5 text-center md:px-2 md:text-left">
                  <span className="inline-flex items-center gap-1.5 md:gap-2">
                    <ColumnIcon type="date" className="shrink-0 text-accent" />
                    <span className="hidden md:inline">
                      {t("history.date")}
                    </span>
                  </span>
                </th>
                {hasAnyType && (
                  <th className="px-1 pt-2.5 pb-1.5 text-center md:px-2">
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <ColumnIcon
                        type="type"
                        className="shrink-0 text-accent"
                      />
                      <span className="hidden md:inline">
                        {t("history.type")}
                      </span>
                    </span>
                  </th>
                )}
                <th className="px-2 pt-2.5 pb-1.5 text-left">
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
                <th className="px-1 pt-2.5 pb-1.5 text-right md:px-2">
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
                  <th className="px-1 pt-2.5 pb-1.5 text-right md:px-2">
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
            <tbody>
              {groups.map((group) => {
                const monthNum = monthNumberFromKey(group.monthKey);
                const monthColor =
                  monthNum !== null ? monthColorVar(monthNum) : undefined;
                const colorStyle: CSSProperties | undefined = monthColor
                  ? { color: monthColor }
                  : undefined;
                const colSpan =
                  3 + (hasAnyType ? 1 : 0) + (hasAnyBalance ? 1 : 0);
                return (
                  <Fragment key={group.monthKey}>
                    <tr>
                      {/* Sticky on the `<td>` (not the `<tr>` — Chrome
                          ignores sticky on rows) so the month label
                          pins below the column-header band until the
                          next group's marker pushes it out. `top: 32px`
                          matches the thead's measured height after the
                          `pt-2.5 pb-1.5` padding; `z-[9]` sits one notch
                          below the thead so the two bands paint cleanly
                          when they overlap. Mirrors the same pattern
                          used in SheetViewerModal. */}
                      <td
                        colSpan={colSpan}
                        className="sticky top-[32px] z-[9] border-b border-line bg-surface-2 px-2 py-1 text-xs font-bold tracking-wider uppercase"
                        style={colorStyle}
                      >
                        {formatMonth(group.monthKey, lang)}
                      </td>
                    </tr>
                    {group.entries.map((r) => {
                      const e = r.entry;
                      const type = r.typeId
                        ? (typesById.get(r.typeId) ?? null)
                        : null;
                      return (
                        <tr
                          key={e.id}
                          className={`border-b border-line last:border-b-0 ${
                            e.hidden ? "opacity-50" : ""
                          }`}
                        >
                          <td
                            className="px-1 py-1.5 align-top font-mono text-xs font-bold whitespace-nowrap md:px-2 md:font-normal"
                            style={colorStyle}
                          >
                            {formatShortDate(
                              e.date,
                              settings.shortDateFormat,
                              lang,
                            )}
                          </td>
                          {hasAnyType && (
                            <td className="px-1 py-1.5 text-center align-top md:px-2">
                              {type ? (
                                <span
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-full"
                                  style={{
                                    backgroundColor: `color-mix(in srgb, ${type.color} 18%, transparent)`,
                                    color: type.color,
                                  }}
                                  title={type.name}
                                >
                                  <CategoryIconGlyph
                                    name={type.glyph}
                                    size={12}
                                  />
                                </span>
                              ) : null}
                            </td>
                          )}
                          <td className="align-top text-muted">
                            <button
                              type="button"
                              onClick={() => setSelectedEntry(e)}
                              className="block w-full cursor-pointer px-2 py-1.5 text-left break-words hover:text-fg"
                            >
                              {r.description}
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
                      );
                    })}
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
        centered
      >
        <Modal.Header
          icon={<FileText size={14} aria-hidden focusable={false} />}
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
    </Modal>
  );
}
