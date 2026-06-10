import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CalendarClock,
  ChartArea,
  Coins,
  HandCoins,
  Pencil,
  Percent,
  Plus,
  Shapes,
  Tag,
  Wrench,
} from "lucide-react";

import { unlock } from "../../data/achievements";
import {
  linkedMortgageFigures,
  loanRemainingBalance,
  resolveLinkedMortgages,
} from "../../data/loans/balance";
import type { Settings, Sheet, UserData } from "../../data/types";
import { useActionsCompaction, useAmountColumns } from "../../hooks";
import { useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance } from "../../utils/format";
import { ActionsCompactContext } from "../ActionsCompactContext";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { useModalDispatch } from "../modal-dispatch";
import {
  SheetTitleMenu,
  favoriteMenuItem,
  type SheetTitleMenuItem,
} from "../SheetTitleMenu";
import { LoansChartModal } from "./LoansChartModal";
import { LoanRow } from "./LoanRow";

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  onCreateLoan: () => void;
  onEditLoan: (loanId: string) => void;
  // Arms the delete confirmation (owned by the loans modal host, so the
  // edit modal's Delete button shares it). Fires from a row's trash button.
  onRequestDeleteLoan: (loanId: string, name: string) => void;
  // Opens the read-only loan view — fires from a tap on the row body.
  onViewLoan: (loanId: string) => void;
  onUpdateBalance: (loanId: string) => void;
  onImportPayments: (loanId: string) => void;
  onViewPayments: (loanId: string) => void;
};

export function LoansPage({
  sheet,
  data,
  settings,
  onCreateLoan,
  onEditLoan,
  onRequestDeleteLoan,
  onViewLoan,
  onUpdateBalance,
  onImportPayments,
  onViewPayments,
}: Props) {
  const t = useT();
  const { cellClass, headerClass, headerJustifyClass } = useAmountColumns();
  // Collapse the trailing action column to a lone ⋯ when the table would
  // overflow its wrapper on the desktop layout — see useActionsCompaction.
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);
  const actionsCompact = useActionsCompaction(tableWrapperRef);
  const dispatchModal = useModalDispatch();

  // Stable, scannable order by name.
  const loans = useMemo(
    () => data.loans.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [data.loans],
  );

  // Footer roll-up: total remaining debt across the visible loans (linked
  // mortgages resolve live from the property), mirroring the savings
  // total. The same walk measures the widest formatted amount for the
  // mobile row template below.
  const { total, amountChars } = useMemo(() => {
    const today = todayIso();
    let sum = 0;
    let chars = 4;
    for (const loan of loans) {
      const linked = resolveLinkedMortgages(loan, data.properties);
      const remaining = linked
        ? linkedMortgageFigures(linked.mortgages, today).remaining
        : loanRemainingBalance(loan, today);
      sum += remaining ?? 0;
      if (remaining !== null) {
        const text = formatBalance(remaining, settings);
        if (text.length > chars) chars = text.length;
      }
    }
    const totalText = formatBalance(sum, settings);
    if (totalText.length > chars) chars = totalText.length;
    return { total: sum, amountChars: chars };
  }, [loans, data.properties, settings]);

  // Mobile renders each row as its own CSS grid (the table goes
  // display:block), so a `max-content` amount track resolves to a
  // different width on every row — knocking the type-glyph column out
  // of line. Pin one shared template instead: a fixed type track and an
  // amount track sized to the widest formatted amount, so all rows (and
  // the header) resolve identical columns. Mirrors the
  // `--transfers-row-template` trick in `AccountTransfersModal`. The
  // amount track adds 1ch over the cell padding (1.25rem) for the
  // column's trailing gutter — see the remaining cells' pr-[…] class.
  const mobileRowTemplate = `40px minmax(0, 1fr) 36px minmax(64px, calc(${amountChars + 1} * 1ch + 1.25rem))`;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [sheet.id]);

  const [chartOpen, setChartOpen] = useState(false);

  function handleVisualizeLoans() {
    setChartOpen(true);
    unlock("loansChart");
  }

  const titleMenuItems: SheetTitleMenuItem[] = [
    favoriteMenuItem(sheet, t, dispatchModal),
    {
      key: "visualize",
      icon: <ChartArea size={16} aria-hidden focusable={false} />,
      label: t("loansSheet.visualizeLoans"),
      onClick: handleVisualizeLoans,
    },
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("sheet.editSheet"),
      onClick: () =>
        dispatchModal({ kind: "open-edit-sheet", sheetId: sheet.id }),
    },
  ];

  const secondaryHeaderClass =
    "loans-secondary-cell hidden px-2.5 py-2 text-right text-xs md:table-cell";

  return (
    <ActiveRowProvider>
      <section>
        <header className="mb-2 flex items-center justify-center md:mb-6">
          <h2 className="m-0">
            <SheetTitleMenu sheetName={sheet.name} items={titleMenuItems} />
          </h2>
        </header>

        <section className="mb-6" data-sheet-content>
          <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
            {t("loansSheet.title")}
          </h3>
          <div
            ref={tableWrapperRef}
            className="overflow-clip rounded border border-line bg-surface"
          >
            <ActionsCompactContext.Provider value={actionsCompact}>
              <table
                className={`swipe-table loans-table w-full border-collapse text-sm md:text-[13px] ${
                  actionsCompact ? "actions-compact" : ""
                }`}
                style={
                  { "--loans-row-template": mobileRowTemplate } as CSSProperties
                }
              >
                <thead>
                  {/* `text-xs` lives on each <th>, not on the grid-container
                    <tr>: the mobile `--loans-row-template` sizes its
                    amount track in `ch`, which resolves against this
                    row's font-size — keeping the row at the body's size
                    makes the header and data grids agree. */}
                  <tr className="border-b border-line bg-surface-3 font-bold tracking-wider uppercase text-muted">
                    <th
                      scope="col"
                      className="w-10 px-2.5 py-2 text-left text-xs"
                      aria-label={t("loansSheet.name")}
                    >
                      <Tag
                        size={16}
                        className="inline-block shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                    </th>
                    <th
                      scope="col"
                      className="px-2.5 py-2 text-left text-xs"
                      aria-label={t("loansSheet.name")}
                    >
                      <span className="hidden md:inline">
                        {t("loansSheet.name")}
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="px-2.5 py-2 text-left text-xs"
                      aria-label={t("loansSheet.type")}
                    >
                      <span className="inline-flex items-center gap-1.5 md:gap-2">
                        <Shapes
                          size={16}
                          className="shrink-0 text-accent"
                          aria-hidden
                          focusable={false}
                        />
                        <span className="hidden md:inline">
                          {t("loansSheet.type")}
                        </span>
                      </span>
                    </th>
                    <th
                      scope="col"
                      className={secondaryHeaderClass}
                      aria-label={t("loansSheet.monthly")}
                    >
                      <span className="inline-flex items-center justify-end gap-1.5 md:gap-2">
                        <CalendarClock
                          size={16}
                          className="shrink-0 text-accent"
                          aria-hidden
                          focusable={false}
                        />
                        <span className="hidden md:inline">
                          {t("loansSheet.monthly")}
                        </span>
                      </span>
                    </th>
                    <th
                      scope="col"
                      className={secondaryHeaderClass}
                      aria-label={t("loansSheet.rate")}
                    >
                      <span className="inline-flex items-center justify-end gap-1.5 md:gap-2">
                        <Percent
                          size={16}
                          className="shrink-0 text-accent"
                          aria-hidden
                          focusable={false}
                        />
                        <span className="hidden md:inline">
                          {t("loansSheet.rate")}
                        </span>
                      </span>
                    </th>
                    <th
                      scope="col"
                      className={secondaryHeaderClass}
                      aria-label={t("loansSheet.paid")}
                    >
                      <span className="inline-flex items-center justify-end gap-1.5 md:gap-2">
                        <HandCoins
                          size={16}
                          className="shrink-0 text-accent"
                          aria-hidden
                          focusable={false}
                        />
                        <span className="hidden md:inline">
                          {t("loansSheet.paid")}
                        </span>
                      </span>
                    </th>
                    <th
                      scope="col"
                      className={`py-2 pr-[calc(0.625rem_+_1ch)] pl-2.5 text-xs ${headerClass}`}
                      aria-label={t("loansSheet.remaining")}
                    >
                      <span
                        className={`inline-flex items-center gap-1.5 md:gap-2 ${headerJustifyClass}`}
                      >
                        <Coins
                          size={16}
                          className="shrink-0 text-accent"
                          aria-hidden
                          focusable={false}
                        />
                        <span className="hidden md:inline">
                          {t("loansSheet.remaining")}
                        </span>
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="swipe-action-cell loans-action-cell w-32 px-2.5 py-2 text-xs"
                      aria-label={t("loansSheet.actions")}
                    >
                      <span className="flex items-center justify-start gap-1.5 md:gap-2">
                        <Wrench
                          size={16}
                          className="shrink-0 text-accent"
                          aria-hidden
                          focusable={false}
                        />
                        <span className="action-header-label hidden md:inline">
                          {t("loansSheet.actions")}
                        </span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loans.length === 0 && (
                    <tr className="loans-fullspan">
                      <td
                        colSpan={8}
                        className="px-3 py-6 text-center text-xs text-muted"
                      >
                        {t("loansSheet.noLoans")}
                      </td>
                    </tr>
                  )}
                  {loans.map((loan) => (
                    <LoanRow
                      key={loan.id}
                      loan={loan}
                      settings={settings}
                      properties={data.properties}
                      companies={data.companies}
                      onEditLoan={onEditLoan}
                      onDeleteLoan={onRequestDeleteLoan}
                      onViewLoan={onViewLoan}
                      onUpdateBalance={onUpdateBalance}
                      onImportPayments={onImportPayments}
                      onViewPayments={onViewPayments}
                    />
                  ))}
                  {loans.length > 0 && (
                    <tr className="border-t border-line bg-surface-3 font-mono text-xs font-bold text-fg-bright">
                      <td className="px-2.5 py-2" />
                      <td className="px-2.5 py-2 text-left tracking-wider uppercase text-muted">
                        {t("loansSheet.total")}
                      </td>
                      <td className="px-2.5 py-2" />
                      <td className="loans-secondary-cell hidden md:table-cell" />
                      <td className="loans-secondary-cell hidden md:table-cell" />
                      <td className="loans-secondary-cell hidden md:table-cell" />
                      <td
                        className={`py-2 pr-[calc(0.625rem_+_1ch)] pl-2.5 whitespace-nowrap tabular-nums ${cellClass}`}
                      >
                        <span className="loans-amount">
                          {formatBalance(total, settings)}
                        </span>
                      </td>
                      <td className="swipe-action-cell loans-action-cell px-2.5 py-2" />
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8} className="bg-surface-3 p-0">
                      <button
                        type="button"
                        onClick={onCreateLoan}
                        className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-3 py-2 text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                      >
                        <Plus size={16} aria-hidden focusable={false} />
                        {t("loansSheet.addLoan")}
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </ActionsCompactContext.Provider>
          </div>
        </section>

        <LoansChartModal
          open={chartOpen}
          loans={data.loans}
          properties={data.properties}
          salaries={data.salaries}
          settings={settings}
          onClose={() => setChartOpen(false)}
        />
      </section>
    </ActiveRowProvider>
  );
}
