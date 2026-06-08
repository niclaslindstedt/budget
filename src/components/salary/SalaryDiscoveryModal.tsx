import { Fragment, useEffect, useMemo, useReducer, useState } from "react";
import { Search } from "lucide-react";

import {
  confirmedSalarySignal,
  discoverSalaries,
  summariseSalaryClusters,
  type DiscoveredSalary,
  type SalaryCluster,
} from "../../data/salary/discovery";
import { withinSalaryTolerance } from "../../data/salary/detection";
import { newId } from "../../data/sheet";
import type {
  Account,
  Employer,
  HistoryEntry,
  Salary,
  Settings,
} from "../../data/types";
import { useLang, useT } from "../../i18n";
import {
  formatBalance,
  formatMonthLabel,
  parseAmount,
} from "../../utils/format";
import { Button, SignedAmountInput } from "../form";
import { Modal } from "../Modal";
import { EmployerPicker } from "./EmployerPicker";
import {
  EMPTY_DISCOVERY_FORM,
  salaryDiscoveryReducer,
} from "./salary-discovery-reducer";

type Props = {
  open: boolean;
  // The account this salary sheet is bound to (its pay account), or
  // null when the user hasn't picked one yet. The walk scans this
  // account's history directly instead of asking which to scan.
  accountId: string | null;
  accounts: readonly Account[];
  history: Record<string, HistoryEntry[]>;
  employers: readonly Employer[];
  settings: Settings;
  // History entry ids already backing a top-level Salary object — their
  // months are skipped so the same paycheck isn't offered twice.
  excludeHistoryIds: ReadonlySet<string>;
  onClose: () => void;
  onAdd: (salaries: Salary[]) => void;
  onCreateEmployer: (employer: Employer) => void;
};

// One stop in the guided walk: a per-year baseline checkpoint or a
// single month to accept / edit / skip. Years are walked oldest-first so
// the baseline is established from the start of history forward.
type Step =
  | {
      kind: "year";
      year: string;
      months: DiscoveredSalary[];
      monthCount: number;
      flaggedCount: number;
      nextYearStep: number; // index of the next year step (or steps.length)
    }
  | { kind: "month"; candidate: DiscoveredSalary; ordinal: number };

// A month looks off when its net strays more than the salary tolerance
// from its own segment's baseline. Comparing against the segment (not
// the whole-year median) keeps the months on either side of a mid-year
// raise from flagging each other — each is normal for its own level.
function isOffBaseline(c: DiscoveredSalary): boolean {
  return !withinSalaryTolerance(c.net, c.baselineNet);
}

function confidenceLabel(t: ReturnType<typeof useT>, confidence: number) {
  if (confidence >= 0.75) return t("salary.confidenceHigh");
  if (confidence >= 0.5) return t("salary.confidenceMedium");
  return t("salary.confidenceLow");
}

export function SalaryDiscoveryModal({
  open,
  accountId,
  accounts,
  history,
  employers,
  settings,
  excludeHistoryIds,
  onClose,
  onAdd,
  onCreateEmployer,
}: Props) {
  const t = useT();
  const lang = useLang();

  const [phase, setPhase] = useState<"intro" | "walk" | "done">("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [accepted, setAccepted] = useState<ReadonlyMap<string, Salary>>(
    new Map(),
  );
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [form, dispatchForm] = useReducer(
    salaryDiscoveryReducer,
    EMPTY_DISCOVERY_FORM,
  );

  // Reset the whole session when the modal closes.
  useEffect(() => {
    if (open) return;
    setPhase("intro");
    setStepIndex(0);
    setAccepted(new Map());
    setSkipped(new Set());
  }, [open]);

  // The bound account's display name and whether it has any imported
  // history to scan.
  const boundAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );
  const hasHistory = accountId ? (history[accountId] ?? []).length > 0 : false;

  const discovery = useMemo(() => {
    if (!accountId) return null;
    const entries = history[accountId] ?? [];
    return discoverSalaries({
      entries,
      excludeHistoryIds,
      // When the already-added paychecks all share one bank description,
      // surface every other deposit under it within the payout window.
      confirmedSalary: confirmedSalarySignal(entries, excludeHistoryIds),
    });
  }, [accountId, history, excludeHistoryIds]);

  // Build the ordered walk: a year checkpoint then each of that year's
  // months. `nextYearStep` lets "Accept all" jump a whole year at once.
  const { steps, totalMonths } = useMemo(() => {
    if (!discovery) return { steps: [] as Step[], totalMonths: 0 };
    const byYear = new Map<string, DiscoveredSalary[]>();
    for (const c of discovery.candidates) {
      const list = byYear.get(c.year);
      if (list) list.push(c);
      else byYear.set(c.year, [c]);
    }
    const years = [...byYear.keys()].sort();
    const out: Step[] = [];
    let ordinal = 0;
    for (const year of years) {
      const months = byYear.get(year)!;
      const flaggedCount = months.filter(isOffBaseline).length;
      const yearStepIndex = out.length;
      out.push({
        kind: "year",
        year,
        months,
        monthCount: months.length,
        flaggedCount,
        nextYearStep: 0, // patched below once the year's months are in
      });
      for (const candidate of months) {
        ordinal += 1;
        out.push({ kind: "month", candidate, ordinal });
      }
      (out[yearStepIndex] as Extract<Step, { kind: "year" }>).nextYearStep =
        out.length;
    }
    return { steps: out, totalMonths: ordinal };
  }, [discovery]);

  const current = phase === "walk" ? steps[stepIndex] : undefined;

  // Segment separators: the month that starts each non-first group, and
  // the subset of those that are a sustained raise (so the walk can label
  // a pay rise "Raise" instead of "Likely new employer").
  const { boundaryMonths, raiseMonths } = useMemo(() => {
    const boundary = new Set<string>();
    const raise = new Set<string>();
    if (!discovery) return { boundaryMonths: boundary, raiseMonths: raise };
    for (const bi of discovery.boundaries.slice(1)) {
      boundary.add(discovery.candidates[bi].monthKey);
    }
    for (const ri of discovery.raises) {
      raise.add(discovery.candidates[ri].monthKey);
    }
    return { boundaryMonths: boundary, raiseMonths: raise };
  }, [discovery]);

  // Seed the per-month form whenever the active month step changes.
  useEffect(() => {
    if (!current || current.kind !== "month") return;
    const c = current.candidate;
    const prior = accepted.get(c.monthKey);
    dispatchForm({
      kind: "reset",
      fields: {
        netText: String(prior ? prior.net : c.net),
        negative: false,
        employerId: prior?.employerId,
      },
    });
    // Only re-seed when the step changes, not on every accepted edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, phase]);

  function goToWalk() {
    setPhase("walk");
    setStepIndex(0);
  }

  function advanceTo(index: number) {
    if (index >= steps.length) setPhase("done");
    else setStepIndex(index);
  }

  function back() {
    if (phase === "done") {
      if (steps.length > 0) {
        setPhase("walk");
        setStepIndex(steps.length - 1);
      } else {
        setPhase("intro");
      }
      return;
    }
    if (stepIndex === 0) {
      setPhase("intro");
      return;
    }
    setStepIndex(stepIndex - 1);
  }

  function salaryFromForm(c: DiscoveredSalary): Salary {
    const parsed = parseAmount(form.netText);
    const net = parsed === null ? c.net : Math.abs(parsed);
    const salary: Salary = {
      id: newId(),
      date: c.date,
      net,
      sourceHistoryId: c.sourceHistoryId,
    };
    if (form.employerId) salary.employerId = form.employerId;
    return salary;
  }

  function acceptMonth(c: DiscoveredSalary) {
    const salary = salaryFromForm(c);
    setAccepted((prev) => new Map(prev).set(c.monthKey, salary));
    setSkipped((prev) => {
      if (!prev.has(c.monthKey)) return prev;
      const next = new Set(prev);
      next.delete(c.monthKey);
      return next;
    });
    advanceTo(stepIndex + 1);
  }

  function skipMonth(c: DiscoveredSalary) {
    setAccepted((prev) => {
      if (!prev.has(c.monthKey)) return prev;
      const next = new Map(prev);
      next.delete(c.monthKey);
      return next;
    });
    setSkipped((prev) => new Set(prev).add(c.monthKey));
    advanceTo(stepIndex + 1);
  }

  // "Accept all" on a year checkpoint: stamp every month in the year at
  // its detected net (an employer carried over from the form isn't
  // applied here — the per-month walk is where employers get tagged).
  function acceptYear(step: Extract<Step, { kind: "year" }>) {
    const months = steps
      .slice(stepIndex + 1, step.nextYearStep)
      .filter((s): s is Extract<Step, { kind: "month" }> => s.kind === "month")
      .map((s) => s.candidate);
    setAccepted((prev) => {
      const next = new Map(prev);
      for (const c of months) {
        next.set(c.monthKey, {
          id: newId(),
          date: c.date,
          net: c.net,
          sourceHistoryId: c.sourceHistoryId,
        });
      }
      return next;
    });
    advanceTo(step.nextYearStep);
  }

  function handleAdd() {
    const salaries = [...accepted.values()];
    if (salaries.length > 0) onAdd(salaries);
    onClose();
  }

  const acceptedCount = accepted.size;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="salary-discovery-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<Search size={14} aria-hidden focusable={false} />}
        title={t("salary.findTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        {phase === "intro" && (
          <IntroStep
            accountName={boundAccount?.name ?? null}
            hasBoundAccount={accountId !== null}
            hasHistory={hasHistory}
            discovery={discovery}
            settings={settings}
            lang={lang}
            t={t}
          />
        )}

        {phase === "walk" && current?.kind === "year" && (
          <YearStep
            step={current}
            boundaryMonths={boundaryMonths}
            raiseMonths={raiseMonths}
            settings={settings}
            lang={lang}
            t={t}
          />
        )}

        {phase === "walk" && current?.kind === "month" && (
          <MonthStep
            candidate={current.candidate}
            ordinal={current.ordinal}
            total={totalMonths}
            isNewEmployer={boundaryMonths.has(current.candidate.monthKey)}
            isRaise={raiseMonths.has(current.candidate.monthKey)}
            accepted={accepted.has(current.candidate.monthKey)}
            skipped={skipped.has(current.candidate.monthKey)}
            form={form}
            employers={employers}
            settings={settings}
            lang={lang}
            t={t}
            onNetChange={(v) => dispatchForm({ kind: "setNet", value: v })}
            onToggleSign={() => dispatchForm({ kind: "toggleSign" })}
            onEmployerChange={(v) =>
              dispatchForm({ kind: "setEmployer", value: v })
            }
            onCreateEmployer={onCreateEmployer}
          />
        )}

        {phase === "done" && (
          <div className="px-1 py-6 text-center text-sm text-muted">
            {acceptedCount === 1
              ? t("salary.readyToAddOne", { count: String(acceptedCount) })
              : t("salary.readyToAddOther", { count: String(acceptedCount) })}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        {phase === "intro" && (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={goToWalk}
              disabled={!discovery || discovery.candidates.length === 0}
            >
              {t("common.next")}
            </Button>
          </>
        )}

        {phase === "walk" && current?.kind === "year" && (
          <>
            <Button variant="secondary" onClick={back}>
              {t("common.back")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => advanceTo(stepIndex + 1)}
            >
              {t("salary.reviewMonths")}
            </Button>
            <Button variant="primary" onClick={() => acceptYear(current)}>
              {current.monthCount === 1
                ? t("salary.acceptYearOne", {
                    count: String(current.monthCount),
                  })
                : t("salary.acceptYearOther", {
                    count: String(current.monthCount),
                  })}
            </Button>
          </>
        )}

        {phase === "walk" && current?.kind === "month" && (
          <>
            <Button variant="secondary" onClick={back}>
              {t("common.back")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => skipMonth(current.candidate)}
            >
              {t("salary.skip")}
            </Button>
            <Button
              variant="primary"
              onClick={() => acceptMonth(current.candidate)}
            >
              {t("salary.accept")}
            </Button>
          </>
        )}

        {phase === "done" && (
          <>
            <Button variant="secondary" onClick={back}>
              {t("common.back")}
            </Button>
            <Button
              variant="primary"
              onClick={handleAdd}
              disabled={acceptedCount === 0}
            >
              {`${t("salary.add")} · ${acceptedCount}`}
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}

type IntroStepProps = {
  accountName: string | null;
  hasBoundAccount: boolean;
  hasHistory: boolean;
  discovery: ReturnType<typeof discoverSalaries> | null;
  settings: Settings;
  lang: ReturnType<typeof useLang>;
  t: ReturnType<typeof useT>;
};

// Opening step of the walk. The salary account is now a sheet setting,
// so instead of a picker this confirms which bound account is being
// scanned and previews the pay clusters found in its history. It steers
// the user to the sheet's edit modal when no account is bound yet, and
// flags an account that has no imported history to scan.
function IntroStep({
  accountName,
  hasBoundAccount,
  hasHistory,
  discovery,
  settings,
  lang,
  t,
}: IntroStepProps) {
  if (!hasBoundAccount) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted">
        {t("salary.noBoundAccount")}
      </p>
    );
  }
  if (!hasHistory) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted">
        {t("salary.noAccountsWithHistory")}
      </p>
    );
  }
  const candidates = discovery?.candidates ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1 text-sm font-bold text-fg-bright">
          {t("salary.scanAccountTitle", { name: accountName ?? "" })}
        </p>
        <p className="text-xs text-muted">{t("salary.pickAccountHint")}</p>
      </div>
      {candidates.length === 0 ? (
        <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          {t("salary.discoveryNone")}
        </p>
      ) : (
        <ClusterSummary
          discovery={discovery!}
          settings={settings}
          lang={lang}
          t={t}
        />
      )}
    </div>
  );
}

type ClusterSummaryProps = {
  discovery: ReturnType<typeof discoverSalaries>;
  settings: Settings;
  lang: ReturnType<typeof useLang>;
  t: ReturnType<typeof useT>;
};

// Compose a cluster's calendar span as a plain month count ("14 mo") —
// total months rather than a years-and-months breakdown, so every span
// reads on one scale.
function formatSpan(t: ReturnType<typeof useT>, spanMonths: number): string {
  return t("salary.clusterSpanMonths", { count: String(spanMonths) });
}

// Replaces the single "around 41K each" average with the actual pay
// clusters — the stretches between raises / title changes / employer
// changes. The cluster's baseline net is the same level that flags an
// individual month as off (vacation / sick / bonus), so it doubles as a
// legend for the per-month walk that follows.
function ClusterSummary({ discovery, settings, lang, t }: ClusterSummaryProps) {
  const candidates = discovery.candidates;
  const clusters = useMemo(
    () => summariseSalaryClusters(discovery),
    [discovery],
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        {t("salary.discoverySummary", {
          count: String(candidates.length),
          start: formatMonthLabel(candidates[0].monthKey, lang),
          end: formatMonthLabel(
            candidates[candidates.length - 1].monthKey,
            lang,
          ),
        })}
      </p>

      <p className="text-sm font-bold text-fg-bright">
        {t("salary.clustersTitle")}
      </p>

      <ul className="flex flex-col gap-1.5">
        {clusters.map((cl) => (
          <Fragment key={cl.startMonthKey}>
            {cl.transition !== "start" && (
              <li className="flex items-center gap-2 pt-1 text-[10px] font-bold tracking-wider uppercase text-meta">
                <span className="h-px flex-1 bg-line" />
                {cl.transition === "raise"
                  ? t("salary.raise")
                  : t("salary.likelyNewEmployer")}
                <span className="h-px flex-1 bg-line" />
              </li>
            )}
            <li className="flex items-center justify-between gap-3 rounded border border-line bg-surface-2 px-3 py-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-sm text-fg-bright">
                  {clusterRangeLabel(cl, lang)}
                </span>
                <span className="font-mono text-xs text-muted">
                  {formatSpan(t, cl.spanMonths)} ·{" "}
                  {cl.paycheckCount === 1
                    ? t("salary.clusterPaychecksOne", {
                        count: String(cl.paycheckCount),
                      })
                    : t("salary.clusterPaychecksOther", {
                        count: String(cl.paycheckCount),
                      })}
                </span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-sm text-fg">
                ~{formatBalance(cl.baselineNet, settings)}
              </span>
            </li>
          </Fragment>
        ))}
      </ul>

      <p className="text-xs text-muted">{t("salary.clustersHint")}</p>
    </div>
  );
}

// "Jan 2021 – Aug 2022", or a single label when the cluster is one month.
function clusterRangeLabel(
  cl: SalaryCluster,
  lang: ReturnType<typeof useLang>,
): string {
  const start = formatMonthLabel(cl.startMonthKey, lang);
  if (cl.startMonthKey === cl.endMonthKey) return start;
  return `${start} – ${formatMonthLabel(cl.endMonthKey, lang)}`;
}

type YearStepProps = {
  step: Extract<Step, { kind: "year" }>;
  boundaryMonths: ReadonlySet<string>;
  raiseMonths: ReadonlySet<string>;
  settings: Settings;
  lang: ReturnType<typeof useLang>;
  t: ReturnType<typeof useT>;
};

// The per-year checkpoint. Instead of an editable "baseline" field
// (which read as if it would overwrite every salary), this lists every
// paycheck detected for the year so the user can see exactly what
// "Accept all" will add. The baseline stays internal — it only decides
// which rows get the "off baseline" tag.
function YearStep({
  step,
  boundaryMonths,
  raiseMonths,
  settings,
  lang,
  t,
}: YearStepProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1 text-sm font-bold text-fg-bright">
          {t("salary.yearStepTitle", { year: step.year })}
        </p>
        <p className="text-xs text-muted">
          {step.monthCount === 1
            ? t("salary.yearMonthsOne", { count: String(step.monthCount) })
            : t("salary.yearMonthsOther", { count: String(step.monthCount) })}
          {step.flaggedCount > 0
            ? ` · ${t("salary.yearFlagged", { count: String(step.flaggedCount) })}`
            : ""}
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {step.months.map((c) => {
          const flagged = isOffBaseline(c);
          return (
            <Fragment key={c.monthKey}>
              {boundaryMonths.has(c.monthKey) && (
                <li className="flex items-center gap-2 pt-1 text-[10px] font-bold tracking-wider uppercase text-meta">
                  <span className="h-px flex-1 bg-line" />
                  {raiseMonths.has(c.monthKey)
                    ? t("salary.raise")
                    : t("salary.likelyNewEmployer")}
                  <span className="h-px flex-1 bg-line" />
                </li>
              )}
              <li className="flex items-center justify-between gap-3 rounded border border-line bg-surface-2 px-3 py-2">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-sm text-fg-bright">
                      {formatMonthLabel(c.monthKey, lang)}
                    </span>
                    {flagged && (
                      <span className="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[10px] text-meta">
                        {t("salary.offBaselineTag")}
                      </span>
                    )}
                  </span>
                  <span className="truncate font-mono text-xs text-muted">
                    <span className="text-meta">{c.date}</span>
                    {c.description ? ` ${c.description}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-sm text-fg">
                  {formatBalance(c.net, settings)}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ul>

      <p className="text-xs text-muted">{t("salary.yearReviewHint")}</p>
    </div>
  );
}

type MonthStepProps = {
  candidate: DiscoveredSalary;
  ordinal: number;
  total: number;
  isNewEmployer: boolean;
  isRaise: boolean;
  accepted: boolean;
  skipped: boolean;
  form: { netText: string; negative: boolean; employerId: string | undefined };
  employers: readonly Employer[];
  settings: Settings;
  lang: ReturnType<typeof useLang>;
  t: ReturnType<typeof useT>;
  onNetChange: (value: string) => void;
  onToggleSign: () => void;
  onEmployerChange: (value: string | undefined) => void;
  onCreateEmployer: (employer: Employer) => void;
};

function MonthStep({
  candidate,
  ordinal,
  total,
  isNewEmployer,
  isRaise,
  accepted,
  skipped,
  form,
  employers,
  settings,
  lang,
  t,
  onNetChange,
  onToggleSign,
  onEmployerChange,
  onCreateEmployer,
}: MonthStepProps) {
  const offAverage = isOffBaseline(candidate);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {t("salary.monthProgress", {
            index: String(ordinal),
            total: String(total),
          })}
        </span>
        <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px]">
          {confidenceLabel(t, candidate.confidence)}
        </span>
      </div>

      {isNewEmployer && (
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider uppercase text-meta">
          <span className="h-px flex-1 bg-line" />
          {isRaise ? t("salary.raise") : t("salary.likelyNewEmployer")}
          <span className="h-px flex-1 bg-line" />
        </div>
      )}

      <div className="rounded border border-line bg-surface-2 p-3">
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>{t("salary.fromBank")}</span>
          <span className="font-mono">{candidate.date}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg">
            {candidate.description}
          </span>
          <span className="shrink-0 font-mono tabular-nums text-sm text-fg-bright">
            {formatBalance(candidate.net, settings)}
          </span>
        </div>
      </div>

      <p className="text-center font-mono text-sm text-fg-bright">
        {formatMonthLabel(candidate.monthKey, lang)}
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">{t("salary.netLabel")}</span>
        <SignedAmountInput
          value={form.netText}
          negative={form.negative}
          onValueChange={onNetChange}
          onToggleSign={onToggleSign}
          settings={settings}
          ariaLabel={t("salary.netLabel")}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">{t("salary.employer")}</span>
        <EmployerPicker
          value={form.employerId}
          employers={employers}
          onChange={onEmployerChange}
          onCreate={onCreateEmployer}
        />
      </label>

      {offAverage && (
        <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-meta">
          {t("salary.offAverageHint")}
        </p>
      )}

      {(accepted || skipped) && (
        <p className="text-center text-[10px] text-muted">
          {accepted ? t("salary.alreadyAccepted") : t("salary.alreadySkipped")}
        </p>
      )}
    </div>
  );
}
