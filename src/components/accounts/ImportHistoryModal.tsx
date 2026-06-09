import { useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";

import {
  makeBankFile,
  type ParsedBankFile,
  parseBankFile,
} from "../../storage/banks";
import type { Account, HistoryEntry, Settings } from "../../data/types";
import { useLang, useT } from "../../i18n";
import { historyEntryId } from "../../storage/banks";
import { formatDate } from "../../utils/format";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  account: Account | null;
  // Existing history for the account, so the preview can count
  // duplicates before the user commits. Defaults to an empty array.
  existing: readonly HistoryEntry[];
  settings: Settings;
  onCancel: () => void;
  onConfirm: (parsed: ParsedBankFile, filename: string) => void;
};

type PreviewState =
  | { kind: "idle" }
  | { kind: "parsing"; filename: string }
  | { kind: "ready"; filename: string; parsed: ParsedBankFile }
  | { kind: "error"; filename: string; message: string };

// Bank-statement import flow scoped to a single account. The account
// is implicit (the click came from that account's row on the
// Accounts page), so the modal only needs a file drop / pick and a
// summary of what's about to happen. The actual merge lives in the
// reducer — `onConfirm` hands the parsed result and filename back up
// and the parent dispatches `importBankHistory`.
export function ImportHistoryModal({
  open,
  account,
  existing,
  settings,
  onCancel,
  onConfirm,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [state, setState] = useState<PreviewState>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset state when the modal closes so the next open is fresh.
  useEffect(() => {
    if (!open) {
      setState({ kind: "idle" });
      setDragOver(false);
    }
  }, [open]);

  const handleFile = useCallback(
    async (file: File) => {
      setState({ kind: "parsing", filename: file.name });
      try {
        const bytes = await file.arrayBuffer();
        const parsed = await parseBankFile(makeBankFile(file.name, bytes));
        if (parsed.entries.length === 0)
          throw new Error(t("importHistory.fileContainedNoEntries"));
        setState({ kind: "ready", filename: file.name, parsed });
      } catch (err) {
        setState({
          kind: "error",
          filename: file.name,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [t],
  );

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const ready = state.kind === "ready" ? state : null;
  const preview = ready ? buildPreview(ready.parsed, existing) : null;

  return (
    <Modal
      open={open && account !== null}
      onClose={onCancel}
      labelledBy="import-history-title"
      scrollableBody={false}
      centered
    >
      <Modal.Header
        icon={<Upload size={14} aria-hidden focusable={false} />}
        title={t("importHistory.titleInto", { name: account?.name ?? "" })}
        onClose={onCancel}
      />
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="text-xs text-muted">{t("importHistory.intro")}</p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed px-4 py-6 text-sm transition-colors ${
            dragOver
              ? "border-accent bg-accent/10 text-fg-bright"
              : "border-line bg-surface-2 text-muted hover:border-accent hover:text-fg"
          }`}
        >
          <Upload size={18} aria-hidden focusable={false} />
          <span>
            {t("importHistory.dropFileOr")}{" "}
            <span className="text-accent">
              {t("importHistory.clickToPick")}
            </span>
          </span>
          <span className="text-xs text-muted">
            {t("importHistory.fileTypes")}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv"
          className="hidden"
          onChange={onFileChosen}
        />

        {state.kind === "parsing" && (
          <p className="text-xs text-muted">
            {t("importHistory.parsing")}{" "}
            <span className="font-mono text-fg">{state.filename}</span>…
          </p>
        )}
        {state.kind === "error" && (
          <div className="rounded border border-danger/60 bg-danger/10 px-3 py-2 text-xs text-danger">
            <span className="font-mono">{state.filename}</span>: {state.message}
          </div>
        )}
        {ready && preview && (
          <div className="flex flex-col gap-1.5 rounded border border-line bg-surface-2 px-3 py-2 text-xs">
            <div className="flex justify-between text-muted">
              <span>{t("importHistory.file")}</span>
              <span className="font-mono text-fg">{ready.filename}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>{t("importHistory.bank")}</span>
              <span className="text-fg">{ready.parsed.bankParserId}</span>
            </div>
            {(ready.parsed.bankClearing || ready.parsed.bankAccountNumber) && (
              <div className="flex justify-between text-muted">
                <span>{t("importHistory.accountColumn")}</span>
                <span className="font-mono text-flag">
                  {[ready.parsed.bankClearing, ready.parsed.bankAccountNumber]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            )}
            <div className="flex justify-between text-muted">
              <span>{t("importHistory.range")}</span>
              <span className="font-mono text-fg">
                {formatRange(
                  preview.rangeStart,
                  preview.rangeEnd,
                  settings,
                  lang,
                )}
              </span>
            </div>
            <div className="flex justify-between text-muted">
              <span>{t("importHistory.newEntries")}</span>
              <span className="text-positive">{preview.added}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>{t("importHistory.duplicatesSkipped")}</span>
              <span className="text-fg">{preview.duplicates}</span>
            </div>
            {preview.openingBalance !== null && (
              <div className="flex justify-between text-muted">
                <span>{t("importHistory.openingBalance")}</span>
                <span className="font-mono text-fg">
                  {preview.openingBalance.toLocaleString(
                    lang === "sv" ? "sv-SE" : "en-GB",
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    },
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      <Modal.Footer>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded border border-line px-3 py-2 text-sm text-muted hover:text-fg"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            if (!ready) return;
            onConfirm(ready.parsed, ready.filename);
          }}
          className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("importHistory.confirm")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

// Always render both bounds with the year — bank statements routinely
// span multiple years (e.g. "18/7 → 18/5" hides four years of drift),
// so a year-less short format would silently misrepresent the range.
function formatRange(
  startIso: string,
  endIso: string,
  settings: Settings,
  lang: Parameters<typeof formatDate>[2],
): string {
  return `${formatDate(startIso, settings.dateFormat, lang)} → ${formatDate(
    endIso,
    settings.dateFormat,
    lang,
  )}`;
}

function buildPreview(
  parsed: ParsedBankFile,
  existing: readonly HistoryEntry[],
): {
  added: number;
  duplicates: number;
  rangeStart: string;
  rangeEnd: string;
  // `null` when the globally-earliest entry carries no balance — i.e.
  // a credit-card import where the parser delivers amounts without a
  // running total. The opening-balance row is suppressed in that case.
  openingBalance: number | null;
} {
  const existingIds = new Set(existing.map((e) => e.id));
  let added = 0;
  let duplicates = 0;
  let rangeStart = "";
  let rangeEnd = "";
  let earliest = parsed.entries[0];
  for (const e of parsed.entries) {
    const id = historyEntryId(e);
    if (existingIds.has(id)) duplicates++;
    else added++;
    if (rangeStart === "" || e.date < rangeStart) rangeStart = e.date;
    if (e.date > rangeEnd) rangeEnd = e.date;
    if (e.date < earliest.date) earliest = e;
  }
  // Combined-set opening balance: walk parsed + existing and pick the
  // globally earliest entry to mirror what the reducer will do.
  let globalEarliest: {
    date: string;
    description: string;
    amount: number;
    balance?: number;
  } = earliest;
  for (const e of existing) {
    if (e.date < globalEarliest.date)
      globalEarliest = {
        date: e.date,
        description: e.description,
        amount: e.amount,
        balance: e.balance,
      };
  }
  const openingBalance =
    globalEarliest.balance === undefined
      ? null
      : globalEarliest.balance - globalEarliest.amount;
  return { added, duplicates, rangeStart, rangeEnd, openingBalance };
}
