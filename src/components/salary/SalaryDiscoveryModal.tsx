import { useEffect, useMemo, useReducer, useState } from "react";
import { Search } from "lucide-react";

import {
  discoverSalaries,
  type DiscoveredSalary,
} from "../../data/salary/discovery";
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
import { Button, SelectPicker, SignedAmountInput } from "../form";
import { Modal } from "../Modal";
import { EmployerPicker } from "./EmployerPicker";
import {
  EMPTY_DISCOVERY_FORM,
  salaryDiscoveryReducer,
} from "./salary-discovery-reducer";

type Props = {
  open: boolean;
  accounts: readonly Account[];
  history: Record<string, HistoryEntry[]>;
  employers: readonly Employer[];
  settings: Settings;
  // History entry ids already backing a top-level Salary object — their
  // months are skipped so the same paycheck isn't offered twice.
  excludeHistoryIds: ReadonlySet<string>;
  onClose: () => void;
  onAdd: (salaries: Salary[]) => void;
};

// One stop in the guided walk: a per-year baseline checkpoint or a
// single month to accept / edit / skip. Years are walked oldest-first so
// the baseline is established from the start of history forward.
type Step =
  | {
      kind: "year";
      year: string;
      baseline: number;
      monthCount: number;
      flaggedCount: number;
      nextYearStep: number; // index of the next year step (or steps.length)
    }
  | { kind: "month"; candidate: DiscoveredSalary; ordinal: number };

function within1Pct(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  return Math.abs(a - b) / Math.max(a, b) <= 0.01;
}

function confidenceLabel(t: ReturnType<typeof useT>, confidence: number) {
  if (confidence >= 0.75) return t("salary.confidenceHigh");
  if (confidence >= 0.5) return t("salary.confidenceMedium");
  return t("salary.confidenceLow");
}

export function SalaryDiscoveryModal({
  open,
  accounts,
  history,
  employers,
  settings,
  excludeHistoryIds,
  onClose,
  onAdd,
}: Props) {
  const t = useT();
  const lang = useLang();

  const [phase, setPhase] = useState<"account" | "walk" | "done">("account");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [accepted, setAccepted] = useState<ReadonlyMap<string, Salary>>(
    new Map(),
  );
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [yearBaselineOverrides, setYearBaselineOverrides] = useState<
    ReadonlyMap<string, number>
  >(new Map());
  const [form, dispatchForm] = useReducer(
    salaryDiscoveryReducer,
    EMPTY_DISCOVERY_FORM,
  );

  // Reset the whole session when the modal closes.
  useEffect(() => {
    if (open) return;
    setPhase("account");
    setAccountId(null);
    setStepIndex(0);
    setAccepted(new Map());
    setSkipped(new Set());
    setYearBaselineOverrides(new Map());
  }, [open]);

  // Only accounts with imported history can be scanned.
  const scannableAccounts = useMemo(
    () => accounts.filter((a) => (history[a.id] ?? []).length > 0),
    [accounts, history],
  );

  const discovery = useMemo(() => {
    if (!accountId) return null;
    return discoverSalaries({
      entries: history[accountId] ?? [],
      excludeHistoryIds,
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
      const baseline =
        yearBaselineOverrides.get(year) ??
        discovery.baselineByYear.get(year) ??
        0;
      const flaggedCount = months.filter(
        (c) => !within1Pct(c.net, baseline),
      ).length;
      const yearStepIndex = out.length;
      out.push({
        kind: "year",
        year,
        baseline,
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
  }, [discovery, yearBaselineOverrides]);

  const current = phase === "walk" ? steps[stepIndex] : undefined;

  // New-employer separators: the month that starts each non-first group.
  const boundaryMonths = useMemo(() => {
    const set = new Set<string>();
    if (!discovery) return set;
    for (const bi of discovery.boundaries.slice(1)) {
      set.add(discovery.candidates[bi].monthKey);
    }
    return set;
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
        setPhase("account");
      }
      return;
    }
    if (stepIndex === 0) {
      setPhase("account");
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

  function setYearBaseline(year: string, value: string) {
    const parsed = parseAmount(value);
    setYearBaselineOverrides((prev) => {
      const next = new Map(prev);
      if (parsed === null || parsed <= 0) next.delete(year);
      else next.set(year, parsed);
      return next;
    });
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
        {phase === "account" && (
          <AccountStep
            scannableAccounts={scannableAccounts}
            accountId={accountId}
            discovery={discovery}
            settings={settings}
            lang={lang}
            t={t}
            onPick={setAccountId}
          />
        )}

        {phase === "walk" && current?.kind === "year" && (
          <YearStep
            step={current}
            settings={settings}
            t={t}
            onBaselineChange={(v) => setYearBaseline(current.year, v)}
            baselineText={
              yearBaselineOverrides.has(current.year)
                ? String(yearBaselineOverrides.get(current.year))
                : String(current.baseline)
            }
          />
        )}

        {phase === "walk" && current?.kind === "month" && (
          <MonthStep
            candidate={current.candidate}
            ordinal={current.ordinal}
            total={totalMonths}
            isNewEmployer={boundaryMonths.has(current.candidate.monthKey)}
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
        {phase === "account" && (
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

type AccountStepProps = {
  scannableAccounts: readonly Account[];
  accountId: string | null;
  discovery: ReturnType<typeof discoverSalaries> | null;
  settings: Settings;
  lang: ReturnType<typeof useLang>;
  t: ReturnType<typeof useT>;
  onPick: (id: string) => void;
};

function AccountStep({
  scannableAccounts,
  accountId,
  discovery,
  settings,
  lang,
  t,
  onPick,
}: AccountStepProps) {
  if (scannableAccounts.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted">
        {t("salary.noAccountsWithHistory")}
      </p>
    );
  }
  const options = scannableAccounts.map((a) => ({
    value: a.id,
    label: a.name,
  }));
  const candidates = discovery?.candidates ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1 text-sm font-bold text-fg-bright">
          {t("salary.pickAccountTitle")}
        </p>
        <p className="text-xs text-muted">{t("salary.pickAccountHint")}</p>
      </div>
      <SelectPicker
        value={accountId ?? ""}
        options={[
          { value: "", label: t("salary.pickAccountPlaceholder") },
          ...options,
        ]}
        onChange={(next) => {
          if (next !== "") onPick(next);
        }}
        ariaLabel={t("salary.pickAccountTitle")}
        panelClassName="max-h-64 overflow-y-auto"
      />
      {accountId &&
        (candidates.length === 0 ? (
          <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            {t("salary.discoveryNone")}
          </p>
        ) : (
          <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            {t("salary.discoverySummary", {
              count: String(candidates.length),
              start: formatMonthLabel(candidates[0].monthKey, lang),
              end: formatMonthLabel(
                candidates[candidates.length - 1].monthKey,
                lang,
              ),
              amount: formatBalance(
                discovery!.baselineByYear.get(candidates[0].year) ??
                  candidates[0].net,
                settings,
              ),
            })}
          </p>
        ))}
    </div>
  );
}

type YearStepProps = {
  step: Extract<Step, { kind: "year" }>;
  settings: Settings;
  t: ReturnType<typeof useT>;
  baselineText: string;
  onBaselineChange: (value: string) => void;
};

function YearStep({
  step,
  settings,
  t,
  baselineText,
  onBaselineChange,
}: YearStepProps) {
  return (
    <div className="flex flex-col gap-4">
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
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">
          {t("salary.yearBaselineLabel")}
        </span>
        <SignedAmountInput
          value={baselineText}
          negative={false}
          onValueChange={onBaselineChange}
          onToggleSign={() => {}}
          settings={settings}
          ariaLabel={t("salary.yearBaselineLabel")}
        />
      </label>
      <p className="text-xs text-muted">{t("salary.yearBaselineHint")}</p>
    </div>
  );
}

type MonthStepProps = {
  candidate: DiscoveredSalary;
  ordinal: number;
  total: number;
  isNewEmployer: boolean;
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
};

function MonthStep({
  candidate,
  ordinal,
  total,
  isNewEmployer,
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
}: MonthStepProps) {
  const offAverage = !within1Pct(candidate.net, candidate.baselineNet);
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
          {t("salary.likelyNewEmployer")}
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
