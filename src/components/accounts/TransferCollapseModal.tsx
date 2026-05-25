import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Merge } from "lucide-react";

import type { TransferCandidate } from "../../data/transfer-collapse";
import { detectTransferCandidates } from "../../data/transfer-collapse";
import type { Account, HistoryEntry, Settings } from "../../data/types";
import { useLang, useT } from "../../i18n";
import { formatNumber, withCurrency } from "../../utils/format";
import { formatShortDate } from "../../utils/format";
import { Button } from "../form";
import { Modal } from "../Modal";

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
// bulk-collapse them into real Transfers. Three controls per pair:
// Collapse (mint a Transfer, hide both entries), Skip (do nothing
// this session), Never (persist a dismissal). A bulk "Collapse all"
// at the bottom runs Collapse on every pair the user hasn't skipped.
//
// Auto-opened after a multi-account import if any new pairs were
// detected — driven by the host App component.
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
  const t = useT();
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

  const remaining = candidates.filter((c) => !skipped.has(c.pairKey));
  const hasAny = remaining.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="transfer-collapse-title"
      size="max-w-2xl"
      centered
    >
      <Modal.Header
        icon={<Merge size={14} aria-hidden focusable={false} />}
        title={t("transferCollapse.title")}
        onClose={onClose}
      />
      <Modal.Body>
        {!hasAny ? (
          <p className="text-sm text-muted">
            {candidates.length === 0
              ? t("transferCollapse.noMatches")
              : t("transferCollapse.allSkipped")}
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted">
              {t("transferCollapse.hint")}
            </p>
            <ul className="flex flex-col gap-2">
              {remaining.map((c) => (
                <PairRow
                  key={c.pairKey}
                  candidate={c}
                  fromName={
                    accountNameById.get(c.fromAccountId) ??
                    t("transferCollapse.unknownAccount")
                  }
                  toName={
                    accountNameById.get(c.toAccountId) ??
                    t("transferCollapse.unknownAccount")
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
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <span className="text-xs text-muted">
          {hasAny
            ? remaining.length === 1
              ? t("transferCollapse.pairsPending", { n: remaining.length })
              : t("transferCollapse.pairsPendingPlural", {
                  n: remaining.length,
                })
            : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
          {hasAny && (
            <Button
              variant="primary"
              onClick={() => {
                for (const c of remaining) onCollapse(c);
              }}
            >
              {t("transferCollapse.collapseAll")}
            </Button>
          )}
        </div>
      </Modal.Footer>
    </Modal>
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
  const t = useT();
  const lang = useLang();
  const formattedAmount = withCurrency(
    formatNumber(candidate.amount, settings),
    settings,
  );
  return (
    <li className="flex flex-col gap-2 rounded border border-line bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-mono text-path">
          {formatShortDate(candidate.date, settings.shortDateFormat, lang)}
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
          {t("transferCollapse.confident", {
            n: Math.round(candidate.confidence * 100),
          })}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onNever}
            className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:border-danger hover:text-danger"
          >
            {t("transferCollapse.never")}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
          >
            {t("transferCollapse.skip")}
          </button>
          <button
            type="button"
            onClick={onCollapse}
            className="cursor-pointer rounded border border-accent bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent/20"
          >
            {t("transferCollapse.collapse")}
          </button>
        </div>
      </div>
    </li>
  );
}
