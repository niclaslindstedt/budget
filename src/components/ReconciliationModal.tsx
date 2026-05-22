import { useMemo, useState } from "react";
import { Scale } from "lucide-react";

import { findColumnByType } from "../data/sheet";
import { expandToSeries, inferSeriesRule } from "../data/reconciliation";
import { newId } from "../data/sheet";
import { nextPaydayDate } from "../data/payday";
import type {
  HistoryEntry,
  Row,
  SeriesMatchRule,
  Settings,
  UserData,
} from "../data/types";
import type { MatchCandidate, OrphanRow } from "../data/reconciliation";
import { useT } from "../i18n";
import { formatAmount } from "../utils/format";
import { Modal } from "./Modal";

type OrphanDecision =
  | { action: "keep" }
  | { action: "delete" }
  | { action: "move"; toDate: string };

export type ReconciliationApply = {
  mergedRowIds: string[];
  seriesRules: SeriesMatchRule[];
  orphans: Array<
    | { rowId: string; action: "delete" }
    | { rowId: string; action: "move"; toDate: string }
  >;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (decisions: ReconciliationApply) => void;
  accountId: string;
  preImportData: UserData;
  newEntries: readonly HistoryEntry[];
  candidates: readonly MatchCandidate[];
  orphans: readonly OrphanRow[];
  paydayDay: number;
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
//   that just became covered by history. The default move-to date
//   is the next payday (auto-detected, see `payday.ts`); the user
//   can also delete the row outright or keep it as-is.
export function ReconciliationModal({
  open,
  onClose,
  onApply,
  accountId,
  preImportData,
  newEntries,
  candidates,
  orphans,
  paydayDay,
  settings,
}: Props) {
  const t = useT();
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
  const today = useMemo(() => isoToday(), []);
  const defaultMoveDate = useMemo(
    () => nextPaydayDate(paydayDay, today),
    [paydayDay, today],
  );
  const [orphanDecisions, setOrphanDecisions] = useState<
    ReadonlyMap<string, OrphanDecision>
  >(() => {
    const out = new Map<string, OrphanDecision>();
    for (const o of orphans) out.set(o.rowId, { action: "keep" });
    return out;
  });

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
    onApply({ mergedRowIds: [], seriesRules: [], orphans: [] });
  }

  function handleApply() {
    const mergedRowIds: string[] = [];
    for (const c of allCandidates) {
      if (checked.has(candidateKey(c))) mergedRowIds.push(c.rowId);
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
    onApply({ mergedRowIds, seriesRules, orphans: orphanOut });
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

  const orphanRowItems = orphans.map((o) => {
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
    const moveDate =
      decision.action === "move" ? decision.toDate : defaultMoveDate;
    return (
      <li
        key={o.rowId}
        className="flex flex-col gap-1 border-b border-line px-3 py-2 text-sm last:border-b-0"
      >
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2">
          <span className="font-mono text-xs text-muted">{rowDate}</span>
          <span className="truncate text-fg">
            {rowDesc || t("reconciliation.noLabel")}
          </span>
          <span className="font-mono text-fg">
            {formatAmount(rowAmount, settings)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            className={`rounded border px-2 py-1 ${
              decision.action === "keep"
                ? "border-accent text-accent"
                : "border-line text-muted hover:text-fg"
            }`}
            onClick={() => setOrphan(o.rowId, { action: "keep" })}
          >
            {t("reconciliation.keep")}
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-1 ${
              decision.action === "delete"
                ? "border-danger text-danger"
                : "border-line text-muted hover:text-fg"
            }`}
            onClick={() => setOrphan(o.rowId, { action: "delete" })}
          >
            {t("reconciliation.deleteRow")}
          </button>
          <label
            className={`flex cursor-pointer items-center gap-1 rounded border px-2 py-1 ${
              decision.action === "move"
                ? "border-accent text-accent"
                : "border-line text-muted hover:text-fg"
            }`}
          >
            <input
              type="radio"
              name={`orphan-${o.rowId}`}
              checked={decision.action === "move"}
              onChange={() =>
                setOrphan(o.rowId, { action: "move", toDate: moveDate })
              }
              className="cursor-pointer"
            />
            <span>{t("reconciliation.moveTo")}</span>
            <input
              type="date"
              value={moveDate}
              onChange={(e) =>
                setOrphan(o.rowId, {
                  action: "move",
                  toDate: e.target.value,
                })
              }
              className="bg-transparent font-mono"
            />
          </label>
        </div>
      </li>
    );
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="reconciliation-modal-title"
      size="max-w-2xl"
      centered
    >
      <Modal.Header
        icon={<Scale size={14} aria-hidden focusable={false} />}
        title={t("reconciliation.title")}
        onClose={onClose}
      />
      <Modal.Body>
        {candidateRows.length === 0 && orphanRowItems.length === 0 && (
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
        {orphanRowItems.length > 0 && (
          <section>
            <h3 className="border-b border-line bg-surface-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
              {t("reconciliation.predictionsThatDidntPost")}
            </h3>
            <ul>{orphanRowItems}</ul>
          </section>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          onClick={handleSkipAll}
          className="rounded border border-line px-3 py-2 text-sm text-muted hover:text-fg"
        >
          {t("reconciliation.skipAll")}
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="rounded border border-accent bg-accent/10 px-3 py-2 text-sm font-semibold text-accent hover:bg-accent/20"
        >
          {t("reconciliation.apply")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

function candidateKey(c: MatchCandidate): string {
  return `${c.rowId}|${c.historyEntryId}`;
}

function isoToday(): string {
  const d = new Date();
  return (
    String(d.getFullYear()).padStart(4, "0") +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
