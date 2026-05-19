import { useMemo, useState } from "react";
import { Repeat, X } from "lucide-react";

import type { RecurringCandidate } from "../data/recurring-detection";
import { detectRecurringCandidates } from "../data/recurring-detection";
import { expandRecurrence, type RecurrenceRule } from "../data/recurrence";
import { suggestTypeForDescription } from "../data/merchant-hints";
import type {
  EntryType,
  HistoryEntry,
  MerchantHint,
  Settings,
} from "../data/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { TypeChip } from "./TypePicker";
import { formatNumber, withCurrency } from "../utils/format";

type Props = {
  // History entries for the budget's account. The panel runs detection
  // on the fly so a fresh import surfaces candidates without any
  // background pass — the detector is O(N log N) so a few thousand
  // entries take a couple of milliseconds.
  history: readonly HistoryEntry[];
  // Normalised keys the user has dismissed with "Not recurring".
  // Passed straight through to the detector.
  dismissedKeys: readonly string[];
  // Snapshot of the merchant-hint store so each candidate can render
  // a suggested type before the user clicks Promote.
  merchantHints: Readonly<Record<string, MerchantHint>>;
  types: readonly EntryType[];
  settings: Settings;
  onPromote: (
    candidate: RecurringCandidate,
    rule: RecurrenceRule,
    dates: string[],
    typeId: string | null,
  ) => void;
  onDismiss: (key: string) => void;
  onDismissAll: (keys: readonly string[]) => void;
};

// One row on the budget view that nudges the user toward promoting
// a detected pattern into a real recurring series. Empty when the
// detector finds nothing, so the budget view can mount it
// unconditionally and the panel quietly takes itself out of layout.
export function RecurringCandidatesPanel({
  history,
  dismissedKeys,
  merchantHints,
  types,
  settings,
  onPromote,
  onDismiss,
  onDismissAll,
}: Props) {
  const dismissedSet = useMemo(() => new Set(dismissedKeys), [dismissedKeys]);
  const candidates = useMemo(
    () =>
      detectRecurringCandidates({
        entries: history,
        dismissedKeys: dismissedSet,
      }),
    [history, dismissedSet],
  );
  const [expanded, setExpanded] = useState(false);
  const [confirmDismissAllOpen, setConfirmDismissAllOpen] = useState(false);

  if (candidates.length === 0) return null;

  const visible = expanded ? candidates : candidates.slice(0, 3);
  const hasMore = candidates.length > visible.length;

  return (
    <section
      aria-labelledby="recurring-candidates-title"
      className="mb-4 rounded border border-line bg-surface-3 p-3"
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Repeat
            size={14}
            aria-hidden
            focusable={false}
            className="text-muted"
          />
          <h3
            id="recurring-candidates-title"
            className="text-xs font-bold tracking-wide text-fg-bright uppercase"
          >
            Recurring candidates
          </h3>
          <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] tabular-nums text-muted">
            {candidates.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <p className="hidden text-[11px] text-muted sm:block">
            Detected in imported history. Click Promote to turn one into a
            recurring series.
          </p>
          <button
            type="button"
            onClick={() => setConfirmDismissAllOpen(true)}
            aria-label="Dismiss all"
            title="Dismiss all"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line text-muted hover:border-danger hover:text-danger"
          >
            <X size={12} aria-hidden focusable={false} />
          </button>
        </div>
      </header>
      <ul className="flex flex-col gap-2">
        {visible.map((c) => {
          const suggestedTypeId =
            suggestTypeForDescription(merchantHints, c.description) ?? null;
          const suggestedType =
            suggestedTypeId === null
              ? null
              : (types.find((t) => t.id === suggestedTypeId) ?? null);
          return (
            <CandidateRow
              key={c.key}
              candidate={c}
              suggestedType={suggestedType}
              settings={settings}
              onPromote={(rule, dates) =>
                onPromote(c, rule, dates, suggestedType?.id ?? null)
              }
              onDismiss={() => onDismiss(c.key)}
            />
          );
        })}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 cursor-pointer text-xs text-link hover:underline"
        >
          Show {candidates.length - visible.length} more
        </button>
      )}
      <ConfirmDialog
        open={confirmDismissAllOpen}
        title="Dismiss all candidates?"
        description={
          <>
            {candidates.length} recurring{" "}
            {candidates.length === 1 ? "candidate" : "candidates"} will be
            marked as not recurring and hidden from this panel. You can restore
            them later from Settings.
          </>
        }
        actions={[
          {
            label: `Dismiss all (${candidates.length})`,
            tone: "danger",
            onSelect: () => {
              onDismissAll(candidates.map((c) => c.key));
              setConfirmDismissAllOpen(false);
            },
          },
        ]}
        onCancel={() => setConfirmDismissAllOpen(false)}
      />
    </section>
  );
}

function CandidateRow({
  candidate,
  suggestedType,
  settings,
  onPromote,
  onDismiss,
}: {
  candidate: RecurringCandidate;
  suggestedType: EntryType | null;
  settings: Settings;
  onPromote: (rule: RecurrenceRule, dates: string[]) => void;
  onDismiss: () => void;
}) {
  const rule = useMemo<RecurrenceRule | null>(
    () => ruleFromCandidate(candidate),
    [candidate],
  );
  const dates = useMemo(() => (rule ? expandRecurrence(rule) : []), [rule]);
  const futureDates = useMemo(() => {
    const today = todayIso();
    return dates.filter((d) => d > today);
  }, [dates]);

  const amountText = formatNumber(
    Math.abs(candidate.suggestedAmount),
    settings,
  );
  const sign = candidate.suggestedAmount >= 0 ? "+" : "−";
  const formattedAmount = withCurrency(amountText, settings);

  return (
    <li className="flex flex-col gap-2 rounded border border-line bg-surface px-3 py-2 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="truncate text-sm text-fg-bright">
            {candidate.description}
          </span>
          <span
            className={`font-mono text-xs tabular-nums ${
              candidate.suggestedAmount >= 0 ? "text-positive" : "text-negative"
            }`}
          >
            {sign}
            {formattedAmount}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
          <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-fg">
            {cadenceLabel(candidate)}
          </span>
          <span>·</span>
          <span>
            {candidate.occurrenceCount} occurrences since{" "}
            <span className="font-mono text-path">{candidate.firstDate}</span>
          </span>
          <span>·</span>
          <span>{Math.round(candidate.confidence * 100)}% confident</span>
          {suggestedType && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                Suggested:
                <TypeChip type={suggestedType} />
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (!rule || futureDates.length === 0) return;
            onPromote(rule, futureDates);
          }}
          disabled={!rule || futureDates.length === 0}
          className="cursor-pointer rounded border border-accent bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Promote{futureDates.length > 0 ? ` (${futureDates.length})` : ""}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Not recurring"
          title="Not recurring"
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line text-muted hover:border-danger hover:text-danger"
        >
          <X size={12} aria-hidden focusable={false} />
        </button>
      </div>
    </li>
  );
}

// Translate a detected cadence into a `RecurrenceRule` the reducer
// can feed to `expandRecurrence`. Weekly / biweekly map to
// everyNDays; monthly / quarterly / yearly map to everyNMonths.
// Returns null when the cadence's metadata is malformed (the
// detector should never emit such candidates, but we guard the call
// site anyway).
function ruleFromCandidate(c: RecurringCandidate): RecurrenceRule | null {
  const start = c.lastDate;
  const end = addMonthsIso(start, 12);
  switch (c.cadence.kind) {
    case "weekly":
      return {
        kind: "everyNDays",
        start,
        end,
        intervalDays: 7,
      };
    case "biweekly":
      return {
        kind: "everyNDays",
        start,
        end,
        intervalDays: 14,
      };
    case "monthly":
      return {
        kind: "everyNMonths",
        intervalMonths: 1,
        dayOfMonth: c.cadence.dayOfMonth ?? dayFromIso(start),
        offsetDays: 0,
        start,
        end,
      };
    case "quarterly":
      return {
        kind: "everyNMonths",
        intervalMonths: 3,
        dayOfMonth: c.cadence.dayOfMonth ?? dayFromIso(start),
        offsetDays: 0,
        start,
        end,
      };
    case "yearly":
      return {
        kind: "everyNMonths",
        intervalMonths: 12,
        dayOfMonth: c.cadence.dayOfMonth ?? dayFromIso(start),
        offsetDays: 0,
        start,
        end: addMonthsIso(start, 24),
      };
  }
}

function cadenceLabel(c: RecurringCandidate): string {
  switch (c.cadence.kind) {
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Biweekly";
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "yearly":
      return "Yearly";
  }
}

function dayFromIso(iso: string): number {
  const n = Number(iso.slice(8, 10));
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : 1;
}

function addMonthsIso(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return iso;
  }
  const target = new Date(Date.UTC(y, m - 1 + months, d));
  const ty = target.getUTCFullYear();
  const tm = String(target.getUTCMonth() + 1).padStart(2, "0");
  const td = String(target.getUTCDate()).padStart(2, "0");
  return `${ty}-${tm}-${td}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
