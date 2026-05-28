import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  History,
  Info,
  Wallet,
} from "lucide-react";

import { unlock } from "../data/achievements";
import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { FloatingPanel } from "./FloatingPanel";
import type {
  Account,
  AccountsDownloadPrefs,
  BudgetDownloadFormat,
  BudgetDownloadPrefs,
} from "../data/types";
import { Button, FormSection } from "./form";
import { Modal } from "./Modal";
import { CategoryIconGlyph } from "./icons";

// Configuration the modal yields back to the caller when the user
// confirms. The two flavours mirror the two sheet types — budget
// vs. accounts dashboard.
export type DownloadConfig =
  | {
      kind: "budget";
      format: BudgetDownloadFormat;
      includeHistory: boolean;
      includeFuture: boolean;
    }
  | {
      kind: "accounts";
      // Resolved selections from the per-account checkbox grid.
      selectedAccountIds: string[];
      accountInfo: Record<string, boolean>;
      accountTransactions: Record<string, boolean>;
      includeTransactions: boolean;
      includeUnconfirmed: boolean;
      includeFutureEntries: boolean;
    };

type BudgetProps = {
  open: boolean;
  kind: "budget";
  initial: BudgetDownloadPrefs;
  // Whether the budget has any imported history rows to bother
  // toggling. When false the modal greys out the toggle and the
  // result always carries `includeHistory: false`.
  hasHistory: boolean;
  sheetName: string;
  onClose: () => void;
  onSubmit: (config: DownloadConfig) => void;
};

type AccountsProps = {
  open: boolean;
  kind: "accounts";
  accounts: readonly Account[];
  initial: AccountsDownloadPrefs;
  onClose: () => void;
  onSubmit: (config: DownloadConfig) => void;
};

type Props = BudgetProps | AccountsProps;

export function DownloadModal(props: Props) {
  if (props.kind === "budget") return <BudgetDownloadModal {...props} />;
  return <AccountsDownloadModal {...props} />;
}

function BudgetDownloadModal({
  open,
  initial,
  hasHistory,
  sheetName,
  onClose,
  onSubmit,
}: BudgetProps) {
  const t = useT();
  const [format, setFormat] = useState<BudgetDownloadFormat>(initial.format);
  const [includeHistory, setIncludeHistory] = useState<boolean>(
    initial.includeHistory,
  );
  const [includeFuture, setIncludeFuture] = useState<boolean>(true);
  const [formatOpen, setFormatOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormat(initial.format);
    setIncludeHistory(initial.includeHistory && hasHistory);
    setIncludeFuture(true);
    setFormatOpen(false);
  }, [open, initial, hasHistory]);

  function handleSubmit() {
    unlock("spreadsheetSensei");
    onSubmit({
      kind: "budget",
      format,
      includeHistory: includeHistory && hasHistory,
      includeFuture,
    });
  }

  const canSubmit = includeHistory || includeFuture;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="download-modal-title"
      size="max-w-md"
    >
      <Modal.Header
        icon={<Download size={14} aria-hidden focusable={false} />}
        title={t("download.budgetTitle", { name: sheetName })}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <FormSection label={t("download.formatLabel")}>
            <FormatPicker
              value={format}
              open={formatOpen}
              onToggle={() => setFormatOpen((v) => !v)}
              onClose={() => setFormatOpen(false)}
              onPick={(next) => {
                setFormat(next);
                setFormatOpen(false);
              }}
            />
          </FormSection>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted">
              {t("download.contentsLabel")}
            </span>
            <label className="inline-flex items-center gap-2 text-sm text-fg-bright">
              <input
                type="checkbox"
                checked={includeFuture}
                onChange={(e) => setIncludeFuture(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              {t("download.includeFuture")}
            </label>
            <label
              className={`inline-flex items-center gap-2 text-sm ${
                hasHistory
                  ? "text-fg-bright"
                  : "cursor-not-allowed text-muted opacity-60"
              }`}
              title={hasHistory ? undefined : t("download.noHistoryHint")}
            >
              <input
                type="checkbox"
                disabled={!hasHistory}
                checked={includeHistory && hasHistory}
                onChange={(e) => setIncludeHistory(e.target.checked)}
                className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
              />
              {t("download.includeHistory")}
            </label>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          withIcon
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          <Download size={14} aria-hidden focusable={false} />
          {t("download.submit")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function AccountsDownloadModal({
  open,
  accounts,
  initial,
  onClose,
  onSubmit,
}: AccountsProps) {
  const t = useT();

  // Build a local-state copy of the per-account toggle grid. Missing
  // keys default to `true` so a newly added account starts opted in.
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [info, setInfo] = useState<Record<string, boolean>>({});
  const [transactions, setTransactions] = useState<Record<string, boolean>>({});
  const [includeTransactions, setIncludeTransactions] = useState(true);
  const [includeUnconfirmed, setIncludeUnconfirmed] = useState(false);
  const [includeFutureEntries, setIncludeFutureEntries] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initSelected: Record<string, boolean> = {};
    const initInfo: Record<string, boolean> = {};
    const initTx: Record<string, boolean> = {};
    for (const a of accounts) {
      initSelected[a.id] = initial.accountSelected[a.id] ?? true;
      initInfo[a.id] = initial.accountInfo[a.id] ?? true;
      initTx[a.id] = initial.accountTransactions[a.id] ?? true;
    }
    setSelected(initSelected);
    setInfo(initInfo);
    setTransactions(initTx);
    setIncludeTransactions(initial.includeTransactions);
    setIncludeUnconfirmed(initial.includeUnconfirmed);
    setIncludeFutureEntries(initial.includeFutureEntries);
  }, [open, accounts, initial]);

  const allSelected = useMemo(
    () => accounts.length > 0 && accounts.every((a) => selected[a.id]),
    [accounts, selected],
  );
  const allInfo = useMemo(
    () => accounts.length > 0 && accounts.every((a) => info[a.id]),
    [accounts, info],
  );
  const allTx = useMemo(
    () => accounts.length > 0 && accounts.every((a) => transactions[a.id]),
    [accounts, transactions],
  );

  function toggleAllSelected() {
    const next: Record<string, boolean> = {};
    const v = !allSelected;
    for (const a of accounts) next[a.id] = v;
    setSelected(next);
  }
  function toggleAllInfo() {
    const next: Record<string, boolean> = {};
    const v = !allInfo;
    for (const a of accounts) next[a.id] = v;
    setInfo(next);
  }
  function toggleAllTx() {
    const next: Record<string, boolean> = {};
    const v = !allTx;
    for (const a of accounts) next[a.id] = v;
    setTransactions(next);
  }

  function handleSubmit() {
    const selectedIds = accounts.filter((a) => selected[a.id]).map((a) => a.id);
    onSubmit({
      kind: "accounts",
      selectedAccountIds: selectedIds,
      accountInfo: info,
      accountTransactions: transactions,
      includeTransactions,
      includeUnconfirmed,
      includeFutureEntries,
    });
  }

  const canSubmit = accounts.some((a) => selected[a.id]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="download-modal-title"
      size="max-w-xl"
    >
      <Modal.Header
        icon={<Download size={14} aria-hidden focusable={false} />}
        title={t("download.accountsTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted">
              {t("download.noAccountsToExport")}
            </p>
          ) : (
            <div className="overflow-clip rounded border border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-3 text-muted">
                    <th className="px-2 py-2 text-left">
                      <button
                        type="button"
                        onClick={toggleAllSelected}
                        aria-label={t("download.column.account")}
                        title={t("download.column.account")}
                        className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-muted hover:text-fg-bright"
                      >
                        <input
                          type="checkbox"
                          checked={allSelected}
                          readOnly
                          tabIndex={-1}
                          className="h-4 w-4 cursor-pointer"
                        />
                        <Wallet size={14} aria-hidden focusable={false} />
                      </button>
                    </th>
                    <th className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={toggleAllInfo}
                        aria-label={t("download.column.accountInfo")}
                        title={t("download.column.accountInfo")}
                        className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-muted hover:text-fg-bright"
                      >
                        <input
                          type="checkbox"
                          checked={allInfo}
                          readOnly
                          tabIndex={-1}
                          className="h-4 w-4 cursor-pointer"
                        />
                        <Info size={14} aria-hidden focusable={false} />
                      </button>
                    </th>
                    <th className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={toggleAllTx}
                        aria-label={t("download.column.transactions")}
                        title={t("download.column.transactions")}
                        className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-muted hover:text-fg-bright"
                      >
                        <input
                          type="checkbox"
                          checked={allTx}
                          readOnly
                          tabIndex={-1}
                          className="h-4 w-4 cursor-pointer"
                        />
                        <History size={14} aria-hidden focusable={false} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr
                      key={account.id}
                      className="border-b border-line last:border-b-0 hover:bg-surface-2"
                    >
                      <td className="px-2 py-2 align-middle">
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg-bright">
                          <input
                            type="checkbox"
                            checked={selected[account.id] ?? true}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [account.id]: e.target.checked,
                              }))
                            }
                            className="h-4 w-4 cursor-pointer"
                          />
                          <span
                            aria-hidden
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
                            style={{
                              color: account.color,
                              backgroundColor: account.color
                                ? `color-mix(in srgb, ${account.color} 18%, transparent)`
                                : undefined,
                              borderColor: account.color
                                ? `color-mix(in srgb, ${account.color} 55%, transparent)`
                                : undefined,
                            }}
                          >
                            {account.glyph ? (
                              <CategoryIconGlyph
                                name={account.glyph}
                                size={12}
                              />
                            ) : (
                              <Wallet size={12} aria-hidden focusable={false} />
                            )}
                          </span>
                          <span className="truncate">{account.name}</span>
                        </label>
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={info[account.id] ?? true}
                          onChange={(e) =>
                            setInfo((prev) => ({
                              ...prev,
                              [account.id]: e.target.checked,
                            }))
                          }
                          aria-label={t("download.accountInfoFor", {
                            name: account.name,
                          })}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={transactions[account.id] ?? true}
                          onChange={(e) =>
                            setTransactions((prev) => ({
                              ...prev,
                              [account.id]: e.target.checked,
                            }))
                          }
                          aria-label={t("download.accountTransactionsFor", {
                            name: account.name,
                          })}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {accounts.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted">
              <span className="uppercase tracking-wider">
                {t("download.legend")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Wallet size={12} aria-hidden focusable={false} />
                {t("download.column.account")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Info size={12} aria-hidden focusable={false} />
                {t("download.column.accountInfo")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <History size={12} aria-hidden focusable={false} />
                {t("download.column.transactions")}
              </span>
            </div>
          )}

          <label className="inline-flex items-center gap-2 text-sm text-fg-bright">
            <input
              type="checkbox"
              checked={includeTransactions}
              onChange={(e) => setIncludeTransactions(e.target.checked)}
              className="h-4 w-4 cursor-pointer"
            />
            {t("download.includeTransactionsAll")}
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-fg-bright">
            <input
              type="checkbox"
              checked={includeUnconfirmed}
              onChange={(e) => setIncludeUnconfirmed(e.target.checked)}
              className="h-4 w-4 cursor-pointer"
            />
            {t("download.includeUnconfirmed")}
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-fg-bright">
            <input
              type="checkbox"
              checked={includeFutureEntries}
              onChange={(e) => setIncludeFutureEntries(e.target.checked)}
              className="h-4 w-4 cursor-pointer"
            />
            {t("download.includeFutureEntries")}
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          withIcon
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          <Download size={14} aria-hidden focusable={false} />
          {t("download.submit")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// Routed through `FloatingPanel` so the list lifts out of the
// DownloadModal's z-50 stacking context — otherwise its options would
// render underneath the dismiss backdrop.
const FORMAT_PICKER_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 180 },
  anchor: "left",
  coordinateSpace: "viewport",
};

function FormatPicker({
  value,
  open,
  onToggle,
  onClose,
  onPick,
}: {
  value: BudgetDownloadFormat;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (next: BudgetDownloadFormat) => void;
}) {
  const t = useT();
  const triggerRef = useRef<HTMLDivElement>(null);
  const options: { id: BudgetDownloadFormat; label: string }[] = [
    { id: "csv", label: t("download.format.csv") },
    { id: "xlsx", label: t("download.format.xlsx") },
  ];
  const selected = options.find((o) => o.id === value) ?? options[0];

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      >
        <span className="flex-1 truncate">{selected.label}</span>
        <ChevronDown
          size={14}
          className="shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>
      <FloatingPanel
        open={open}
        onClose={onClose}
        triggerRef={triggerRef}
        placement={FORMAT_PICKER_PLACEMENT}
      >
        <ul role="listbox" className="overflow-hidden py-1">
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                role="option"
                aria-selected={opt.id === value}
                onClick={() => onPick(opt.id)}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.id === value && (
                  <Check
                    size={14}
                    className="text-accent"
                    aria-hidden
                    focusable={false}
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </FloatingPanel>
    </div>
  );
}
