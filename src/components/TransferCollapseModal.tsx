import { useEffect, useMemo, useState } from "react";
import { ArrowRight, X } from "lucide-react";

import type { TransferCandidate } from "../data/transfer-collapse";
import { detectTransferCandidates } from "../data/transfer-collapse";
import type { Account, HistoryEntry, Settings } from "../data/types";
import { formatNumber, withCurrency } from "../utils/format";
import { formatShortDate } from "../utils/format";
import { useBodyScrollLock } from "../utils/scroll-lock";

type Props = {
  open: boolean;
  // Full per-account history, as carried on `UserData.history`. The
  // modal runs detection on every open so a re-import that introduced
  // a new pair shows up without any background pass.
  history: Readonly<Record<string, readonly HistoryEntry[]>>;
  accounts: readonly Account[];
  // Pair keys the user has dismissed with "Never". Passed straight
  // through to the detector.
  dismissedPairKeys: readonly string[];
  settings: Settings;
  onClose: () => void;
  onCollapse: (candidate: TransferCandidate) => void;
  onDismiss: (pairKey: string) => void;
};

// Modal that lists every detected cross-account pair so the user can
// bulk-collapse them into real Transactions. Three controls per pair:
// Collapse (mint a Transaction, hide both entries), Skip (do nothing
// this session), Never (persist a dismissal). A bulk "Collapse all"
// at the bottom runs Collapse on every pair the user hasn't skipped.
//
// The modal is also rendered when the Accounts page asks for it (an
// on-demand "Find transfers" button), and after a multi-account
// import auto-opens it if any new pairs were detected — driven by the
// host App component.
export function TransferCollapseModal({
  open,
  history,
  accounts,
  dismissedPairKeys,
  settings,
  onClose,
  onCollapse,
  onDismiss,
}: Props) {
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const dismissed = useMemo(
    () => new Set(dismissedPairKeys),
    [dismissedPairKeys],
  );
  const candidates = useMemo(
    () =>
      detectTransferCandidates({
        history,
        dismissedPairKeys: dismissed,
      }),
    [history, dismissed],
  );
  const accountNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) m.set(a.id, a.name);
    return m;
  }, [accounts]);

  // Track per-session "Skip" decisions so the user can hide a pair
  // for this dialog without persisting a dismissal. The set is keyed
  // by pairKey and resets on every open.
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (open) setSkipped(new Set());
  }, [open]);

  if (!open) return null;

  const remaining = candidates.filter((c) => !skipped.has(c.pairKey));
  const hasAny = remaining.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-collapse-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="transfer-collapse-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            Cross-account transfers
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden focusable={false} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!hasAny ? (
            <p className="text-sm text-muted">
              {candidates.length === 0
                ? "No matching pairs found in your imported history. A pair must have the same magnitude, opposite signs, and dates within three days."
                : "Every detected pair has been skipped in this session. Close the dialog to dismiss it."}
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted">
                Mirror pairs found in your imported history. Collapse merges
                them into a single transfer transaction and hides both source
                entries; Skip leaves the pair untouched for this session; Never
                hides the pair from future scans.
              </p>
              <ul className="flex flex-col gap-2">
                {remaining.map((c) => (
                  <PairRow
                    key={c.pairKey}
                    candidate={c}
                    fromName={
                      accountNameById.get(c.fromAccountId) ?? "Unknown account"
                    }
                    toName={
                      accountNameById.get(c.toAccountId) ?? "Unknown account"
                    }
                    settings={settings}
                    onCollapse={() => onCollapse(c)}
                    onSkip={() =>
                      setSkipped((prev) => {
                        const next = new Set(prev);
                        next.add(c.pairKey);
                        return next;
                      })
                    }
                    onNever={() => onDismiss(c.pairKey)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <span className="text-xs text-muted">
            {hasAny
              ? `${remaining.length} pair${remaining.length === 1 ? "" : "s"} pending`
              : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
            >
              Close
            </button>
            {hasAny && (
              <button
                type="button"
                onClick={() => {
                  for (const c of remaining) onCollapse(c);
                }}
                className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
              >
                Collapse all
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function PairRow({
  candidate,
  fromName,
  toName,
  settings,
  onCollapse,
  onSkip,
  onNever,
}: {
  candidate: TransferCandidate;
  fromName: string;
  toName: string;
  settings: Settings;
  onCollapse: () => void;
  onSkip: () => void;
  onNever: () => void;
}) {
  const formattedAmount = withCurrency(
    formatNumber(candidate.amount, settings),
    settings,
  );
  return (
    <li className="flex flex-col gap-2 rounded border border-line bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-mono text-path">
          {formatShortDate(candidate.date, settings.shortDateFormat)}
        </span>
        <span className="text-fg-bright">{fromName}</span>
        <ArrowRight
          size={12}
          aria-hidden
          focusable={false}
          className="text-muted"
        />
        <span className="text-fg-bright">{toName}</span>
        <span className="ml-auto font-mono tabular-nums text-positive">
          {formattedAmount}
        </span>
      </div>
      <div className="grid gap-1 text-[11px] text-muted sm:grid-cols-2">
        <div className="truncate">
          <span className="text-muted">{fromName}:</span>{" "}
          <span className="text-fg">{candidate.fromEntry.description}</span>
        </div>
        <div className="truncate">
          <span className="text-muted">{toName}:</span>{" "}
          <span className="text-fg">{candidate.toEntry.description}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">
          {Math.round(candidate.confidence * 100)}% confident
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onNever}
            className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:border-danger hover:text-danger"
          >
            Never
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onCollapse}
            className="cursor-pointer rounded border border-accent bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent/20"
          >
            Collapse
          </button>
        </div>
      </div>
    </li>
  );
}
