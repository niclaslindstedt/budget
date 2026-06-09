import { useEffect, useMemo, useState } from "react";
import {
  Coins,
  Landmark,
  LineChart,
  Pencil,
  Plus,
  Tag,
  Wrench,
} from "lucide-react";

import { unlock } from "../../data/achievements";
import { currentSavingBalance } from "../../data/savings/value";
import type { Settings, Sheet, UserData } from "../../data/types";
import { useAmountColumns } from "../../hooks";
import { useT } from "../../i18n";
import { formatBalance } from "../../utils/format";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { useModalDispatch } from "../modal-dispatch";
import {
  SheetTitleMenu,
  favoriteMenuItem,
  type SheetTitleMenuItem,
} from "../SheetTitleMenu";
import { SavingsRow } from "./SavingsRow";
import { SavingsValueChartModal } from "./SavingsValueChartModal";

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  onCreateSaving: () => void;
  onEditSaving: (savingId: string) => void;
  onUpdateBalance: (savingId: string) => void;
  // Arms the delete confirmation (owned by the savings modal host, so the
  // edit modal's Delete button shares it). Fires from a row's trash button.
  onRequestDeleteSaving: (savingId: string, name: string) => void;
  // Bank-history flows (reused from the accounts import pipeline) — a savings
  // account stores transactions for transfer detection, not surfaced here.
  onImportHistory: (savingId: string) => void;
  onViewHistory: (savingId: string) => void;
  onCutHistory: (savingId: string) => void;
};

export function SavingsPage({
  sheet,
  data,
  settings,
  onCreateSaving,
  onEditSaving,
  onUpdateBalance,
  onRequestDeleteSaving,
  onImportHistory,
  onViewHistory,
  onCutHistory,
}: Props) {
  const t = useT();
  const { cellClass, headerClass, headerJustifyClass } = useAmountColumns();
  const dispatchModal = useModalDispatch();

  // The sheet-level value-over-time chart. Self-contained: it reads
  // `data.savings` directly and needs no dispatch, so it's hosted here with a
  // single open flag rather than threaded through the savings modal host.
  const [chartOpen, setChartOpen] = useState(false);

  // Stable, scannable order by name.
  const savings = useMemo(
    () => data.savings.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [data.savings],
  );

  // Per-saving "…" menu gating: View needs imported transactions; Cut needs
  // transactions or transfers in range. One pass over transfers.
  const cutBySaving = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const tx of data.transfers) {
      m.set(tx.fromAccountId, true);
      m.set(tx.toAccountId, true);
    }
    return m;
  }, [data.transfers]);

  // Footer roll-up across the visible accounts — an at-a-glance "total set
  // aside" figure, mirroring the accounts / items page totals.
  const total = useMemo(
    () => savings.reduce((sum, s) => sum + (currentSavingBalance(s) ?? 0), 0),
    [savings],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [sheet.id]);

  // Open the value-over-time chart, recording the achievement the first time
  // the user visualizes their savings.
  function handleVisualizeValue() {
    setChartOpen(true);
    unlock("savingsValueChart");
  }

  const titleMenuItems: SheetTitleMenuItem[] = [
    favoriteMenuItem(sheet, t, dispatchModal),
    {
      key: "visualize",
      icon: <LineChart size={16} aria-hidden focusable={false} />,
      label: t("savingsSheet.visualizeValue"),
      onClick: handleVisualizeValue,
    },
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("sheet.editSheet"),
      onClick: () =>
        dispatchModal({ kind: "open-edit-sheet", sheetId: sheet.id }),
    },
  ];

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
            {t("savingsSheet.title")}
          </h3>
          <div className="overflow-clip rounded border border-line bg-surface">
            <table className="swipe-table savings-table w-full border-collapse text-sm md:text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface-3 text-xs font-bold tracking-wider uppercase text-muted">
                  <th
                    scope="col"
                    className="w-10 px-2.5 py-2 text-left"
                    aria-label={t("savingsSheet.name")}
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
                    className="px-2.5 py-2 text-left"
                    aria-label={t("savingsSheet.name")}
                  >
                    <span className="hidden md:inline">
                      {t("savingsSheet.name")}
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="savings-bank-cell hidden px-2.5 py-2 text-left md:table-cell"
                    aria-label={t("savingsSheet.bank")}
                  >
                    <span className="inline-flex items-center justify-start gap-1.5 md:gap-2">
                      <Landmark
                        size={16}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("savingsSheet.bank")}
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className={`px-2.5 py-2 ${headerClass}`}
                    aria-label={t("savingsSheet.balance")}
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
                        {t("savingsSheet.balance")}
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="swipe-action-cell savings-action-cell w-32 px-2.5 py-2"
                    aria-label={t("savingsSheet.actions")}
                  >
                    <span className="flex items-center justify-start gap-1.5 md:gap-2">
                      <Wrench
                        size={16}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("savingsSheet.actions")}
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {savings.length === 0 && (
                  <tr className="savings-fullspan">
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-xs text-muted"
                    >
                      {t("savingsSheet.noAccounts")}
                    </td>
                  </tr>
                )}
                {savings.map((saving) => {
                  const hasHistory = (data.history[saving.id]?.length ?? 0) > 0;
                  return (
                    <SavingsRow
                      key={saving.id}
                      saving={saving}
                      settings={settings}
                      hasHistory={hasHistory}
                      canCut={hasHistory || cutBySaving.has(saving.id)}
                      onEditSaving={onEditSaving}
                      onDeleteSaving={onRequestDeleteSaving}
                      onUpdateBalance={onUpdateBalance}
                      onImportHistory={onImportHistory}
                      onViewHistory={onViewHistory}
                      onCutHistory={onCutHistory}
                    />
                  );
                })}
                {savings.length > 0 && (
                  <tr className="border-t border-line bg-surface-3 font-mono text-xs font-bold text-fg-bright">
                    <td className="px-2.5 py-2" />
                    <td className="px-2.5 py-2 text-left tracking-wider uppercase text-muted">
                      {t("savingsSheet.total")}
                    </td>
                    <td className="savings-bank-cell hidden md:table-cell" />
                    <td
                      className={`px-2.5 py-2 whitespace-nowrap tabular-nums ${cellClass}`}
                    >
                      <span>{formatBalance(total, settings)}</span>
                    </td>
                    <td className="swipe-action-cell savings-action-cell px-2.5 py-2" />
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="bg-surface-3 p-0">
                    <button
                      type="button"
                      onClick={onCreateSaving}
                      className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-3 py-2 text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    >
                      <Plus size={16} aria-hidden focusable={false} />
                      {t("savingsSheet.addAccount")}
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <SavingsValueChartModal
          open={chartOpen}
          savings={savings}
          settings={settings}
          onClose={() => setChartOpen(false)}
        />
      </section>
    </ActiveRowProvider>
  );
}
