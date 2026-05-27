import { useMemo, useState } from "react";
import {
  Calendar,
  CalendarDays,
  Check,
  HelpCircle,
  Scale,
  Trash2,
} from "lucide-react";

import { findColumnByType } from "../../data/sheet";
import {
  expandToSeries,
  inferSeriesRule,
  nextFiscalMonthStartDate,
  nextMonthSameDate,
  seriesHasOccurrenceInNextMonth,
} from "../../data/reconciliation";
import { newId } from "../../data/sheet";
import { allTypes } from "../../data/presets/merge";
import type {
  Column,
  EntryType,
  HistoryEntry,
  Row,
  SeriesMatchRule,
  Settings,
  UserData,
} from "../../data/types";
import type { MatchCandidate, OrphanRow } from "../../data/reconciliation";
import { useLang, useT } from "../../i18n";
import {
  formatAmount,
  formatMonthLabel,
  formatShortDate,
} from "../../utils/format";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";

type OrphanDecision =
  | { action: "keep" }
  | { action: "delete" }
  | { action: "move"; toDate: string };

export type ReconciliationApply = {
  mergedRowIds: string[];
  // Stamps to apply to the matching history entries so the user's
  // curated description / typeId survive the merged row's deletion.
  // Conflict policy lives in the reducer — only blank fields on the
  // entry get filled.
  entryOverrides: Array<{
    historyEntryId: string;
    userDescription?: string;
    userTypeId?: string;
  }>;
  seriesRules: SeriesMatchRule[];
  orphans: Array<
    | { rowId: string; action: "delete" }
    | { rowId: string; action: "move"; toDate: string }
  >;
};

type Props = {
  open: boolean;
  // Called when the user dismisses the modal without committing: the
  // X button, Escape, or click-outside. The parent treats this as
  // "cancel the import" and discards the parsed file unread.
  onCancel: () => void;
  onApply: (decisions: ReconciliationApply) => void;
  accountId: string;
  preImportData: UserData;
  newEntries: readonly HistoryEntry[];
  candidates: readonly MatchCandidate[];
  orphans: readonly OrphanRow[];
  settings: Settings;
};

// Surface for post-import reconciliation. The matcher runs against
// the pre-import state and we project results into checklists the
// user can scan in one pass:
//
// - Probable matches: a single user row + history entry pair the
//   matcher flagged. Toggle to merge (delete the user row, keep the
//   history entry) or leave alone. High-confidence pairs are
//   pre-checked; low-confidence sits unchecked. Series rows can
//   "Apply to whole series", which expands the rule's window across
//   the whole import and records a `SeriesMatchRule` for future
//   imports.
//
// - Predictions that didn't post: rows the user authored in months
//   that just became covered by history. Grouped by fiscal month
//   with an explanatory header. Each row offers two quick-pick
//   moves — "Next month start" (always available) and "Next month,
//   same date" (hidden when the row is part of a recurring series
//   whose next-month occurrence already exists) — plus delete /
//   keep. Bulk header buttons set every row's decision at once.
export function AccountReconciliationModal({
  open,
  onCancel,
  onApply,
  accountId,
  preImportData,
  newEntries,
  candidates,
  orphans,
  settings,
}: Props) {
  const t = useT();
  const lang = useLang();
  const startOfMonth = settings.startOfMonth;
  // Toggle for the info popover. Replaces the always-visible intro
  // paragraph — same copy, but now hidden behind a `?` button so the
  // modal isn't dominated by explanatory prose.
  const [showInfo, setShowInfo] = useState(false);
  // Indexed lookup so each row can render the entry type's coloured
  // glyph next to its description. Resolves preset + user-added types
  // through `allTypes` so chips match the rest of the app.
  const typesById = useMemo(() => {
    const m = new Map<string, EntryType>();
    for (const type of allTypes(preImportData)) m.set(type.id, type);
    return m;
  }, [preImportData]);
  // Lookup tables for rendering. Built from the pre-import snapshot
  // so the modal doesn't have to chase reducer state to find rows.
  const rowsById = useMemo(() => {
    const out = new Map<
      string,
      {
        row: Row;
        columns: (typeof preImportData.sheets)[number]["items"][number] extends {
          columns: infer C;
        }
          ? C
          : never;
      }
    >();
    for (const sheet of preImportData.sheets) {
      for (const item of sheet.items) {
        if (item.type !== "accountBudget") continue;
        if (item.accountId !== accountId) continue;
        for (const row of item.rows) {
          // TypeScript widening — the lookup table only cares about
          // shape, not about which item the row belonged to.
          (out as Map<string, { row: Row; columns: typeof item.columns }>).set(
            row.id,
            { row, columns: item.columns },
          );
        }
      }
    }
    return out;
  }, [preImportData, accountId]);

  const entriesById = useMemo(() => {
    const out = new Map<string, HistoryEntry>();
    for (const entry of newEntries) out.set(entry.id, entry);
    return out;
  }, [newEntries]);

  // Toggle state for each candidate. Map<candidateKey, checked>.
  const initialChecked = useMemo(() => {
    const set = new Set<string>();
    for (const c of candidates) {
      if (c.confidence === "high") set.add(candidateKey(c));
    }
    return set;
  }, [candidates]);
  const [checked, setChecked] = useState<ReadonlySet<string>>(initialChecked);

  // Series rules learned by clicking "Apply to whole series" on a
  // candidate row. Keyed by the originating row's seriesId so
  // re-clicking the same row no-ops.
  const [seriesRulesById, setSeriesRulesById] = useState<
    ReadonlyMap<string, SeriesMatchRule>
  >(new Map());
  // Extra match candidates pulled in by the series expansions.
  // Stored separately so the original `candidates` prop stays
  // immutable and easy to re-render when the parent updates.
  const [seriesExpansions, setSeriesExpansions] = useState<MatchCandidate[]>(
    [],
  );

  // Orphan decisions. Default `keep` so the modal never wipes a
  // user's data without an explicit confirmation.
  const [orphanDecisions, setOrphanDecisions] = useState<
    ReadonlyMap<string, OrphanDecision>
  >(() => {
    const out = new Map<string, OrphanDecision>();
    for (const o of orphans) out.set(o.rowId, { action: "keep" });
    return out;
  });

  // All rows for this account, grouped by their owning columns set.
  // Needed for the "Move to next month, same date" suppression check
  // — we must walk the series' siblings to see if the destination
  // month already has an occurrence.
  const accountRowGroups = useMemo<
    Array<{ rows: readonly Row[]; columns: readonly Column[] }>
  >(() => {
    const out: Array<{ rows: readonly Row[]; columns: readonly Column[] }> = [];
    for (const sheet of preImportData.sheets) {
      for (const item of sheet.items) {
        if (item.type !== "accountBudget") continue;
        if (item.accountId !== accountId) continue;
        out.push({ rows: item.rows, columns: item.columns });
      }
    }
    return out;
  }, [preImportData, accountId]);

  function seriesHasNextMonthOccurrence(
    seriesId: string,
    monthKey: string,
  ): boolean {
    for (const group of accountRowGroups) {
      if (
        seriesHasOccurrenceInNextMonth(
          group.rows,
          group.columns,
          seriesId,
          monthKey,
          startOfMonth,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function setAllOrphans(builder: (o: OrphanRow) => OrphanDecision) {
    setOrphanDecisions(() => {
      const next = new Map<string, OrphanDecision>();
      for (const o of orphans) next.set(o.rowId, builder(o));
      return next;
    });
  }

  const allCandidates = useMemo<MatchCandidate[]>(
    () => [...candidates, ...seriesExpansions],
    [candidates, seriesExpansions],
  );

  function toggleCandidate(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyToSeries(candidate: MatchCandidate) {
    if (!candidate.seriesId) return;
    if (seriesRulesById.has(candidate.seriesId)) return;
    const lookup = rowsById.get(candidate.rowId);
    const entry = entriesById.get(candidate.historyEntryId);
    if (!lookup || !entry) return;
    const rule = inferSeriesRule(candidate, entry, lookup.row, newId);
    if (!rule) return;
    setSeriesRulesById((prev) => {
      const next = new Map(prev);
      next.set(candidate.seriesId!, rule);
      return next;
    });

    // Compute siblings across every account-budget that tracks this
    // account. The matcher operates on (rows, columns) tuples so we
    // walk each independently and concat.
    const alreadyClaimed = new Set<string>();
    for (const c of allCandidates) {
      alreadyClaimed.add(c.rowId);
      alreadyClaimed.add(`hist:${c.historyEntryId}`);
    }
    const moreCandidates: MatchCandidate[] = [];
    for (const sheet of preImportData.sheets) {
      for (const item of sheet.items) {
        if (item.type !== "accountBudget") continue;
        if (item.accountId !== accountId) continue;
        const extra = expandToSeries(
          rule,
          newEntries,
          item.rows,
          item.columns,
          alreadyClaimed,
        );
        for (const e of extra) moreCandidates.push(e);
      }
    }
    setSeriesExpansions((prev) => [...prev, ...moreCandidates]);
    setChecked((prev) => {
      const next = new Set(prev);
      for (const e of moreCandidates) next.add(candidateKey(e));
      return next;
    });
  }

  function setOrphan(rowId: string, decision: OrphanDecision) {
    setOrphanDecisions((prev) => {
      const next = new Map(prev);
      next.set(rowId, decision);
      return next;
    });
  }

  function handleSkipAll() {
    onApply({
      mergedRowIds: [],
      entryOverrides: [],
      seriesRules: [],
      orphans: [],
    });
  }

  function handleApply() {
    const mergedRowIds: string[] = [];
    const entryOverrides: ReconciliationApply["entryOverrides"] = [];
    for (const c of allCandidates) {
      if (!checked.has(candidateKey(c))) continue;
      mergedRowIds.push(c.rowId);
      // Carry the row's curated description + typeId onto the bank
      // entry as per-entry overrides so the user's fine-tuning isn't
      // lost when the row is deleted. The reducer enforces the
      // conflict policy — only blanks on the entry get filled.
      const lookup = rowsById.get(c.rowId);
      if (!lookup) continue;
      const descCol = findColumnByType(lookup.columns, "description");
      const rowDesc = descCol
        ? String(lookup.row.cells[descCol.id] ?? "").trim()
        : "";
      const override: ReconciliationApply["entryOverrides"][number] = {
        historyEntryId: c.historyEntryId,
      };
      if (rowDesc) override.userDescription = rowDesc;
      if (lookup.row.typeId) override.userTypeId = lookup.row.typeId;
      if (override.userDescription || override.userTypeId) {
        entryOverrides.push(override);
      }
    }
    // Only persist rules whose paired candidate was actually checked.
    // Clicking "Apply to whole series" but then unchecking the
    // originating row shouldn't ship the rule.
    const checkedSeriesIds = new Set<string>();
    for (const c of allCandidates) {
      if (c.seriesId && checked.has(candidateKey(c))) {
        checkedSeriesIds.add(c.seriesId);
      }
    }
    const seriesRules: SeriesMatchRule[] = [];
    for (const [seriesId, rule] of seriesRulesById.entries()) {
      if (checkedSeriesIds.has(seriesId)) seriesRules.push(rule);
    }
    const orphanOut: ReconciliationApply["orphans"] = [];
    for (const o of orphans) {
      const decision = orphanDecisions.get(o.rowId) ?? { action: "keep" };
      if (decision.action === "delete")
        orphanOut.push({ rowId: o.rowId, action: "delete" });
      if (decision.action === "move")
        orphanOut.push({
          rowId: o.rowId,
          action: "move",
          toDate: decision.toDate,
        });
    }
    onApply({ mergedRowIds, entryOverrides, seriesRules, orphans: orphanOut });
  }

  const candidateRows = allCandidates.map((c) => {
    const lookup = rowsById.get(c.rowId);
    const entry = entriesById.get(c.historyEntryId);
    if (!lookup || !entry) return null;
    const dateCol = findColumnByType(lookup.columns, "date");
    const descCol = findColumnByType(lookup.columns, "description");
    const amtCol = findColumnByType(lookup.columns, "amount");
    if (!dateCol || !amtCol) return null;
    const rowDate = String(lookup.row.cells[dateCol.id] ?? "");
    const rowDesc = descCol ? String(lookup.row.cells[descCol.id] ?? "") : "";
    const rowAmount = Number(lookup.row.cells[amtCol.id] ?? 0);
    const key = candidateKey(c);
    const isChecked = checked.has(key);
    const seriesId = c.seriesId;
    const seriesRuleAttached = seriesId ? seriesRulesById.has(seriesId) : false;
    return (
      <li
        key={key}
        className="flex flex-col gap-1 border-b border-line px-3 py-2 text-sm last:border-b-0"
      >
        {/* Native checkbox nested inside the <label> — clicking the
            row toggles it. The label's accessible name is the row's
            date + description + amount (the <span> below); the linter
            can't statically resolve the runtime text, so the warning
            is disabled with this rationale. */}
        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => toggleCandidate(key)}
            className="mt-1 cursor-pointer"
          />
          <span className="flex-1 grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-0.5">
            <span className="font-mono text-xs text-muted">{rowDate}</span>
            <span className="truncate text-fg">
              {rowDesc || t("reconciliation.noLabel")}
            </span>
            <span className="font-mono text-fg">
              {formatAmount(rowAmount, settings)}
            </span>
            <span className="font-mono text-xs text-muted">{entry.date}</span>
            <span className="truncate text-muted">{entry.description}</span>
            <span className="font-mono text-fg">
              {formatAmount(entry.amount, settings)}
            </span>
          </span>
        </label>
        {seriesId && !seriesRuleAttached && (
          <button
            type="button"
            className="ml-6 self-start text-xs text-accent hover:underline"
            onClick={() => applyToSeries(c)}
          >
            {t("reconciliation.applyToSeries")}
          </button>
        )}
        {seriesId && seriesRuleAttached && (
          <span className="ml-6 self-start text-xs text-muted">
            {t("reconciliation.seriesRuleQueued")}
          </span>
        )}
      </li>
    );
  });

  // Group orphans by fiscal month, preserving the input order within
  // each group so the table reads top-to-bottom in account order.
  const orphanGroups = useMemo(() => {
    const groups = new Map<string, OrphanRow[]>();
    const order: string[] = [];
    for (const o of orphans) {
      const list = groups.get(o.monthKey);
      if (list) {
        list.push(o);
      } else {
        groups.set(o.monthKey, [o]);
        order.push(o.monthKey);
      }
    }
    return order.map((monthKey) => ({
      monthKey,
      rows: groups.get(monthKey) ?? [],
    }));
  }, [orphans]);

  const orphanGroupSections = orphanGroups.map((group) => {
    const items = group.rows.map((o) => {
      const lookup = rowsById.get(o.rowId);
      if (!lookup) return null;
      const dateCol = findColumnByType(lookup.columns, "date");
      const descCol = findColumnByType(lookup.columns, "description");
      const amtCol = findColumnByType(lookup.columns, "amount");
      if (!dateCol || !amtCol) return null;
      const rowDate = String(lookup.row.cells[dateCol.id] ?? "");
      const rowDesc = descCol ? String(lookup.row.cells[descCol.id] ?? "") : "";
      const rowAmount = Number(lookup.row.cells[amtCol.id] ?? 0);
      const decision = orphanDecisions.get(o.rowId) ?? { action: "keep" };
      const nextStartDate = nextFiscalMonthStartDate(o.monthKey, startOfMonth);
      const nextSameDate = nextMonthSameDate(rowDate);
      const seriesId = lookup.row.seriesId;
      const showSameDateOption =
        nextSameDate !== rowDate &&
        !(seriesId && seriesHasNextMonthOccurrence(seriesId, o.monthKey));
      const isKeep = decision.action === "keep";
      const isDelete = decision.action === "delete";
      const isMoveToStart =
        decision.action === "move" && decision.toDate === nextStartDate;
      const isMoveToSameDate =
        decision.action === "move" && decision.toDate === nextSameDate;
      const entryType = lookup.row.typeId
        ? typesById.get(lookup.row.typeId)
        : undefined;
      return (
        <li
          key={o.rowId}
          className="flex flex-col gap-1.5 border-b border-line px-3 py-2 text-sm last:border-b-0"
        >
          <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-2">
            <span className="font-mono text-xs text-muted tabular-nums">
              {formatShortDate(rowDate, settings.shortDateFormat, lang)}
            </span>
            {entryType ? (
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded"
                style={{
                  backgroundColor: `color-mix(in srgb, ${entryType.color} 18%, transparent)`,
                  color: entryType.color,
                }}
                aria-hidden
              >
                <CategoryIconGlyph name={entryType.glyph} size={12} />
              </span>
            ) : (
              <span className="h-5 w-5 shrink-0" aria-hidden />
            )}
            <span className="truncate text-fg-bright">
              {rowDesc || t("reconciliation.noLabel")}
            </span>
            <span className="font-mono text-fg tabular-nums">
              {formatAmount(rowAmount, settings)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <IconButton
              active={isKeep}
              tone="success"
              label={t("reconciliation.keep")}
              onClick={() => setOrphan(o.rowId, { action: "keep" })}
            >
              <Check size={14} aria-hidden focusable={false} />
            </IconButton>
            <IconButton
              active={isDelete}
              tone="danger"
              label={t("reconciliation.deleteRow")}
              onClick={() => setOrphan(o.rowId, { action: "delete" })}
            >
              <Trash2 size={14} aria-hidden focusable={false} />
            </IconButton>
            <IconButton
              active={isMoveToStart}
              tone="accent"
              label={t("reconciliation.moveToNextMonthStart")}
              onClick={() =>
                setOrphan(o.rowId, { action: "move", toDate: nextStartDate })
              }
            >
              <Calendar size={14} aria-hidden focusable={false} />
            </IconButton>
            {showSameDateOption && (
              <IconButton
                active={isMoveToSameDate}
                tone="accent"
                label={t("reconciliation.moveToNextMonthSameDate")}
                onClick={() =>
                  setOrphan(o.rowId, { action: "move", toDate: nextSameDate })
                }
              >
                <CalendarDays size={14} aria-hidden focusable={false} />
              </IconButton>
            )}
          </div>
        </li>
      );
    });
    return (
      <section key={group.monthKey}>
        <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line bg-surface px-3 py-2">
          <h4 className="text-base font-semibold text-fg-bright">
            {t("reconciliation.monthCoveredHeader", {
              month: formatMonthLabel(group.monthKey, lang),
            })}
          </h4>
          <span className="text-xs text-muted">
            {t("reconciliation.monthCoveredSubtitle")}
          </span>
        </header>
        <ul>{items}</ul>
      </section>
    );
  });

  const hasOrphans = orphans.length > 0;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      labelledBy="reconciliation-modal-title"
      size="max-w-2xl"
      centered
    >
      <Modal.Header
        icon={<Scale size={14} aria-hidden focusable={false} />}
        title={t("reconciliation.title")}
        onClose={onCancel}
      />
      <Modal.Body>
        {candidateRows.length === 0 && !hasOrphans && (
          <p className="px-4 py-3 text-sm text-muted">
            {t("reconciliation.nothingToTriage")}
          </p>
        )}
        {candidateRows.length > 0 && (
          <section>
            <h3 className="border-b border-line bg-surface-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
              {t("reconciliation.probableMatches")}
            </h3>
            <ul>{candidateRows}</ul>
          </section>
        )}
        {hasOrphans && (
          <section>
            <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
              <h3 className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted">
                {t("reconciliation.predictionsThatDidntPost")}
              </h3>
              <button
                type="button"
                onClick={() => setShowInfo((v) => !v)}
                aria-expanded={showInfo}
                aria-label={t("reconciliation.infoAria")}
                title={t("reconciliation.infoAria")}
                className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded ${
                  showInfo
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:bg-surface-3 hover:text-fg"
                }`}
              >
                <HelpCircle size={14} aria-hidden focusable={false} />
              </button>
              <IconButton
                tone="success"
                label={t("reconciliation.bulkKeepAll")}
                onClick={() => setAllOrphans(() => ({ action: "keep" }))}
              >
                <Check size={14} aria-hidden focusable={false} />
              </IconButton>
              <IconButton
                tone="danger"
                label={t("reconciliation.bulkDeleteAll")}
                onClick={() => setAllOrphans(() => ({ action: "delete" }))}
              >
                <Trash2 size={14} aria-hidden focusable={false} />
              </IconButton>
              <IconButton
                tone="accent"
                label={t("reconciliation.bulkMoveAllToNextMonthStart")}
                onClick={() =>
                  setAllOrphans((o) => ({
                    action: "move",
                    toDate: nextFiscalMonthStartDate(o.monthKey, startOfMonth),
                  }))
                }
              >
                <Calendar size={14} aria-hidden focusable={false} />
              </IconButton>
            </div>
            {showInfo && (
              <p
                role="note"
                className="border-b border-line bg-surface-3 px-3 py-2 text-xs text-muted"
              >
                {t("reconciliation.orphanHint")}
              </p>
            )}
            {orphanGroupSections}
          </section>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          onClick={handleSkipAll}
          className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
        >
          {t("reconciliation.skipAll")}
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/20"
        >
          {t("common.apply")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

function candidateKey(c: MatchCandidate): string {
  return `${c.rowId}|${c.historyEntryId}`;
}

// Compact square icon-button used for the orphan-row decision chips
// (keep / delete / move) and the bulk-action header. `tone` picks the
// active-state colour band; the `title` + `aria-label` carry the
// human-readable copy so the icon-only chrome stays accessible.
type IconButtonTone = "accent" | "success" | "danger";

function IconButton({
  active = false,
  tone,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  tone: IconButtonTone;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeClass =
    tone === "success"
      ? "border-success bg-success/15 text-success"
      : tone === "danger"
        ? "border-danger bg-danger/15 text-danger"
        : "border-accent bg-accent/15 text-accent";
  const hoverClass =
    tone === "success"
      ? "hover:border-success/60 hover:text-success"
      : tone === "danger"
        ? "hover:border-danger/60 hover:text-danger"
        : "hover:border-accent/60 hover:text-accent";
  const className = `inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border ${
    active ? activeClass : `border-line text-muted ${hoverClass}`
  }`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={className}
    >
      {children}
    </button>
  );
}
