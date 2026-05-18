import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";

import {
  makeBankFile,
  type ParsedBankFile,
  parseBankFile,
} from "../storage/bank-parsers";
import type { Account, HistoryEntry, Settings } from "../data/types";
import { historyEntryId } from "../storage/bank-parsers";
import { formatShortDate } from "../utils/format";
import { useBodyScrollLock } from "../utils/scroll-lock";

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
  useBodyScrollLock(open);
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

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  const handleFile = useCallback(async (file: File) => {
    setState({ kind: "parsing", filename: file.name });
    try {
      const bytes = await file.arrayBuffer();
      const parsed = await parseBankFile(makeBankFile(file.name, bytes));
      if (parsed.entries.length === 0)
        throw new Error("File contained no entries.");
      setState({ kind: "ready", filename: file.name, parsed });
    } catch (err) {
      setState({
        kind: "error",
        filename: file.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

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

  if (!open || !account) return null;

  const ready = state.kind === "ready" ? state : null;
  const preview = ready ? buildPreview(ready.parsed, existing) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-history-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="import-history-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            Import history into {account.name}
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

        <div className="flex flex-col gap-3 px-4 py-3">
          <p className="text-xs text-muted">
            Drop a bank statement file below, or click to pick one. Currently
            supported: Skandiabanken (.xlsx).
          </p>

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
              Drop file here, or{" "}
              <span className="text-accent">click to pick</span>
            </span>
            <span className="text-xs text-muted">.xlsx</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={onFileChosen}
          />

          {state.kind === "parsing" && (
            <p className="text-xs text-muted">
              Parsing{" "}
              <span className="font-mono text-fg">{state.filename}</span>…
            </p>
          )}
          {state.kind === "error" && (
            <div className="rounded border border-danger/60 bg-danger/10 px-3 py-2 text-xs text-danger">
              <span className="font-mono">{state.filename}</span>:{" "}
              {state.message}
            </div>
          )}
          {ready && preview && (
            <div className="flex flex-col gap-1.5 rounded border border-line bg-surface-2 px-3 py-2 text-xs">
              <div className="flex justify-between text-muted">
                <span>File</span>
                <span className="font-mono text-fg">{ready.filename}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Bank</span>
                <span className="text-fg">{ready.parsed.bankParserId}</span>
              </div>
              {(ready.parsed.bankClearing ||
                ready.parsed.bankAccountNumber) && (
                <div className="flex justify-between text-muted">
                  <span>Account</span>
                  <span className="font-mono text-flag">
                    {[ready.parsed.bankClearing, ready.parsed.bankAccountNumber]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-muted">
                <span>Range</span>
                <span className="font-mono text-fg">
                  {formatShortDate(
                    preview.rangeStart,
                    settings.shortDateFormat,
                  )}{" "}
                  →{" "}
                  {formatShortDate(preview.rangeEnd, settings.shortDateFormat)}
                </span>
              </div>
              <div className="flex justify-between text-muted">
                <span>New entries</span>
                <span className="text-positive">{preview.added}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Duplicates skipped</span>
                <span className="text-fg">{preview.duplicates}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Opening balance</span>
                <span className="font-mono text-fg">
                  {preview.openingBalance.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded border border-line px-3 py-2 text-sm text-muted hover:text-fg"
          >
            Cancel
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
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

function buildPreview(
  parsed: ParsedBankFile,
  existing: readonly HistoryEntry[],
): {
  added: number;
  duplicates: number;
  rangeStart: string;
  rangeEnd: string;
  openingBalance: number;
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
  let globalEarliest = earliest;
  for (const e of existing) {
    if (e.date < globalEarliest.date)
      globalEarliest = {
        date: e.date,
        description: e.description,
        amount: e.amount,
        balance: e.balance,
      };
  }
  const openingBalance = globalEarliest.balance - globalEarliest.amount;
  return { added, duplicates, rangeStart, rangeEnd, openingBalance };
}
