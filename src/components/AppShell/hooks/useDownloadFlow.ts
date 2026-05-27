import { useCallback, useState } from "react";

import type { DownloadConfig } from "../../DownloadModal";
import {
  buildBudgetExportRows,
  CSV_MIME_TYPE,
  exportRowsToTable,
  rowsToCsv,
} from "../../../data/budget/export";
import {
  buildAccountsExport,
  JSON_MIME_TYPE,
  serializeAccountsExport,
} from "../../../data/accounts/export";
import type { Action } from "../../../data/reducer";
import type {
  AccountBudget,
  AccountsDownloadPrefs,
  BudgetDownloadPrefs,
  Category,
  EntryType,
  Settings,
  UserData,
} from "../../../data/types";
import { type Lang, useT } from "../../../i18n";
import { todayIso } from "../../../utils/date";
import {
  slugifyFilename,
  todayStamp,
  triggerDownload,
} from "../../../utils/download";
import { buildXlsx, XLSX_MIME_TYPE } from "../../../utils/xlsx";
import { budgetExportFormats } from "../../../utils/xlsx-format";

type DownloadPrompt = {
  sheetId: string;
  budgetPrefs: BudgetDownloadPrefs;
  accountsPrefs: AccountsDownloadPrefs;
};

type Params = {
  data: UserData;
  effectiveSettings: Settings;
  dispatch: (action: Action) => void;
  isMobile: boolean;
  language: Lang;
  allTypesMerged: readonly EntryType[];
  allCategoriesMerged: readonly Category[];
};

type Result = {
  // null = closed; otherwise the sheet the user is downloading. The
  // shape carries the resolved prefs so the modal can seed itself
  // from per-device defaults without re-reading localStorage.
  downloadPrompt: DownloadPrompt | null;
  onOpenDownloadSheet: (id: string) => void;
  onCloseDownload: () => void;
  onConfirmDownload: (config: DownloadConfig) => void;
};

// Opens the DownloadModal pre-seeded with the device's last-used
// download prefs, dispatches the CSV / XLSX / JSON export when the
// modal confirms, and persists the user's choices back to per-device
// settings so the next open lands on the same shape.
export function useDownloadFlow({
  data,
  effectiveSettings,
  dispatch,
  isMobile,
  language,
  allTypesMerged,
  allCategoriesMerged,
}: Params): Result {
  const t = useT();
  const [downloadPrompt, setDownloadPrompt] = useState<DownloadPrompt | null>(
    null,
  );

  const onOpenDownloadSheet = useCallback(
    (id: string) => {
      const target = data.sheets.find((s) => s.id === id);
      if (!target) return;
      setDownloadPrompt({
        sheetId: id,
        budgetPrefs: effectiveSettings.downloadBudget,
        accountsPrefs: effectiveSettings.downloadAccounts,
      });
    },
    [
      data.sheets,
      effectiveSettings.downloadBudget,
      effectiveSettings.downloadAccounts,
    ],
  );
  const onCloseDownload = useCallback(() => setDownloadPrompt(null), []);

  const onConfirmDownload = useCallback(
    (config: DownloadConfig) => {
      if (!downloadPrompt) return;
      const target = data.sheets.find((s) => s.id === downloadPrompt.sheetId);
      if (!target) {
        setDownloadPrompt(null);
        return;
      }
      const stamp = todayStamp();
      const baseSlug = slugifyFilename(target.name);
      if (config.kind === "budget") {
        const budgetItem = target.items.find(
          (it): it is AccountBudget => it.type === "accountBudget",
        );
        if (budgetItem) {
          const accountsById = new Map<string, string>();
          for (const a of data.accounts) accountsById.set(a.id, a.name);
          const opening = budgetItem.accountId
            ? (data.accounts.find((a) => a.id === budgetItem.accountId)
                ?.openingBalance ?? 0)
            : 0;
          const history = budgetItem.accountId
            ? (data.history[budgetItem.accountId] ?? [])
            : [];
          const rows = buildBudgetExportRows({
            item: budgetItem,
            openingBalance: opening,
            history,
            transfers: data.transfers,
            accountsById,
            types: allTypesMerged,
            categories: allCategoriesMerged,
            merchantHints: data.merchantHints,
            matchRules: data.matchRules,
            includeHistory: config.includeHistory,
            includeFuture: config.includeFuture,
          });
          const currencySuffix = data.settings.currency.trim();
          const amountHeader = t("budget.amount");
          const balanceHeader = t("budget.balance");
          // CSV headers carry the currency in parentheses so the
          // column is self-describing once it leaves the app; XLSX
          // encodes the symbol inside each cell's number format
          // instead, so its headers stay plain.
          const csvAmountHeader =
            currencySuffix !== ""
              ? `${amountHeader} (${currencySuffix})`
              : amountHeader;
          const csvBalanceHeader =
            currencySuffix !== ""
              ? `${balanceHeader} (${currencySuffix})`
              : balanceHeader;
          const baseHeaders = {
            date: t("budget.date"),
            type: t("budget.type"),
            category: t("budget.category"),
            description: t("budget.description"),
          };
          if (config.format === "csv") {
            const table = exportRowsToTable(rows, {
              ...baseHeaders,
              amount: csvAmountHeader,
              balance: csvBalanceHeader,
            });
            const csv = rowsToCsv(table);
            triggerDownload(csv, `${baseSlug}-${stamp}.csv`, CSV_MIME_TYPE);
          } else {
            const table = exportRowsToTable(rows, {
              ...baseHeaders,
              amount: amountHeader,
              balance: balanceHeader,
            });
            const bytes = buildXlsx([
              {
                name: target.name,
                rows: table,
                // Column order matches `exportRowsToTable`:
                // date, description, type, category, amount, balance.
                columnFormats: [
                  { kind: "date" },
                  { kind: "general" },
                  { kind: "general" },
                  { kind: "general" },
                  { kind: "currency" },
                  { kind: "currency", alwaysTwoDecimals: true },
                ],
                // Long descriptions wrap inside the cell; the other
                // columns hold short tokens that auto-fit on one line.
                columnWraps: [false, true, false, false, false, false],
                formats: budgetExportFormats(effectiveSettings),
                asTable: true,
              },
            ]);
            triggerDownload(bytes, `${baseSlug}-${stamp}.xlsx`, XLSX_MIME_TYPE);
          }
          dispatch({
            type: "updateDeviceSettings",
            scope: isMobile ? "mobile" : "desktop",
            patch: {
              downloadBudget: {
                format: config.format,
                includeHistory: config.includeHistory,
              },
            },
          });
        }
      } else {
        const payload = buildAccountsExport({
          accounts: data.accounts,
          transfers: data.transfers,
          transactions: data.history,
          sheets: data.sheets,
          selectedAccountIds: config.selectedAccountIds,
          accountInfo: config.accountInfo,
          accountTransactions: config.accountTransactions,
          includeTransactions: config.includeTransactions,
          today: todayIso(),
          includeUnconfirmed: config.includeUnconfirmed,
          includeFuture: config.includeFutureEntries,
          dateFormat: data.settings.dateFormat,
          lang: language,
        });
        // The selected list only carries the accounts the user kept
        // ticked, but we still want to remember every account's per-
        // row decision so a re-open with a new account doesn't
        // forget the older toggles.
        const accountSelected: Record<string, boolean> = {};
        for (const a of data.accounts) {
          accountSelected[a.id] = config.selectedAccountIds.includes(a.id);
        }
        const text = serializeAccountsExport(payload);
        triggerDownload(text, `accounts-${stamp}.json`, JSON_MIME_TYPE);
        dispatch({
          type: "updateDeviceSettings",
          scope: isMobile ? "mobile" : "desktop",
          patch: {
            downloadAccounts: {
              accountInfo: config.accountInfo,
              accountTransactions: config.accountTransactions,
              accountSelected,
              includeTransactions: config.includeTransactions,
              includeUnconfirmed: config.includeUnconfirmed,
              includeFutureEntries: config.includeFutureEntries,
            },
          },
        });
      }
      setDownloadPrompt(null);
    },
    [
      downloadPrompt,
      data.sheets,
      data.accounts,
      data.transfers,
      data.history,
      data.merchantHints,
      data.matchRules,
      data.settings,
      effectiveSettings,
      dispatch,
      isMobile,
      language,
      allTypesMerged,
      allCategoriesMerged,
      t,
    ],
  );

  return {
    downloadPrompt,
    onOpenDownloadSheet,
    onCloseDownload,
    onConfirmDownload,
  };
}
