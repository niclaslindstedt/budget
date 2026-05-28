import { useCallback, useEffect, useRef } from "react";

import type { CellValue, Column, Row } from "../../data/types";

// Brief double-heartbeat highlight on a row after an inline edit
// commits — or after a brand-new row is added via the inline "+"
// button. On mobile the soft keyboard collapsing after a commit can
// leave the user momentarily unsure which row they were just editing;
// a pulse on the affected row anchors the change visually. Driven by
// a DOM attribute toggled directly (rather than a React state on each
// row) so a single keystroke commit doesn't ripple a re-render
// through every memoised BudgetRow in the sheet. The reflow + re-set
// restarts the animation on rapid successive commits.
//
// The hook bundles five callbacks the budget page wraps around its
// row-level mutations so each one flashes the affected row when it
// fires: `handleUpdateCell` (with the history-row routing branch
// that diverts description / type edits to `onUpdateHistoryEntry`),
// `handleCommitCell`, `handleSetRowCompany`, and `handleSetRowNoCompany`.
// It also owns the `prevRowIdsRef` diff effect that fires on
// single-row additions (the inline "+" button and non-series complex
// entries). Multi-row additions intentionally skip the heartbeat;
// flashing N rows at once reads as chaos rather than confirmation.

type HistoryEntryPatch = {
  userDescription?: string;
  userTypeId?: string | null;
  userCompanyId?: string | null;
  isTransfer?: boolean;
  noCompany?: boolean;
};

type Params = {
  // Active account id for the budget. `null` when the budget hasn't
  // been linked to an account yet — history-row writes degrade to a
  // no-op in that case.
  accountId: string | null;
  // Column definitions on the budget. Used by the update-cell wrapper
  // to look up the column type so it can route history-row writes to
  // the right `HistoryEntry` field and decide whether to flash on
  // commit (only date / completed cells flash via `onUpdate`; text
  // inputs and the type picker flash via `onCommit`).
  columns: readonly Column[];
  // Persisted user rows on the budget. Diffed across renders so the
  // hook can fire the heartbeat when exactly one new id appears.
  rows: readonly Row[];
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onUpdateHistoryEntry: (
    accountId: string,
    entryId: string,
    patch: HistoryEntryPatch,
  ) => void;
  onCommitCell: (rowId: string, columnId: string, value: CellValue) => void;
  onSetRowCompany: (row: Row, companyId: string | null) => void;
  onSetRowNoCompany: (row: Row, next: boolean) => void;
};

export type RowFlashing = {
  handleUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  handleCommitCell: (rowId: string, columnId: string, value: CellValue) => void;
  handleSetRowCompany: (row: Row, companyId: string | null) => void;
  handleSetRowNoCompany: (row: Row, next: boolean) => void;
};

export function useRowFlashing({
  accountId,
  columns,
  rows,
  onUpdateCell,
  onUpdateHistoryEntry,
  onCommitCell,
  onSetRowCompany,
  onSetRowNoCompany,
}: Params): RowFlashing {
  const flashRow = useCallback((rowId: string) => {
    if (typeof document === "undefined") return;
    const fire = () => {
      const selector = `[data-row-id="${CSS.escape(rowId)}"]`;
      const row = document.querySelector<HTMLElement>(selector);
      if (!row) return;
      row.removeAttribute("data-row-flash");
      // Force reflow so the keyframes restart from 0 when the same row
      // commits twice in quick succession.
      void row.offsetWidth;
      row.setAttribute("data-row-flash", "true");
      window.setTimeout(() => {
        if (row.getAttribute("data-row-flash") === "true") {
          row.removeAttribute("data-row-flash");
        }
      }, 1150);
    };
    // Small delay so a freshly-added row has time to mount before we
    // query for it. Same rationale as the scroll-to-row pulse below.
    window.setTimeout(fire, 50);
  }, []);

  // History rows are synthesized — their cells don't exist in
  // `item.rows[]`, so the generic `onUpdateCell` reducer would no-op.
  // Intercept writes to history rows here and route description /
  // type edits to `onUpdateHistoryEntry` instead so the override
  // lands on the underlying `HistoryEntry`. Other columns are
  // bank-authoritative and ignored. `onCommitCell` already
  // short-circuits for synthesized rows (no `seriesId`), so it
  // doesn't need a parallel intercept.
  const handleUpdateCell = useCallback(
    (rowId: string, columnId: string, value: CellValue) => {
      if (!rowId.startsWith("hist:") || !accountId) {
        onUpdateCell(rowId, columnId, value);
      } else {
        const entryId = rowId.slice("hist:".length);
        const col = columns.find((c) => c.id === columnId);
        if (col?.type === "description") {
          onUpdateHistoryEntry(accountId, entryId, {
            userDescription: typeof value === "string" ? value : "",
          });
        } else if (col?.type === "type") {
          onUpdateHistoryEntry(accountId, entryId, {
            userTypeId:
              typeof value === "string" && value !== "" ? value : null,
          });
        } else {
          return;
        }
      }
      // Date and completed cells have no `onCommit` path (the date
      // picker fires discrete onChange events; the completed toggle is
      // a single click), so the heartbeat hooks into `onUpdate` for
      // those two column types. Text inputs (description, amount) and
      // the type picker route their heartbeat through `handleCommitCell`
      // below instead — flashing on every keystroke would be noise.
      const col = columns.find((c) => c.id === columnId);
      if (col?.type === "date" || col?.type === "completed") {
        flashRow(rowId);
      }
    },
    [accountId, columns, onUpdateCell, onUpdateHistoryEntry, flashRow],
  );

  const handleCommitCell = useCallback(
    (rowId: string, columnId: string, value: CellValue) => {
      onCommitCell(rowId, columnId, value);
      flashRow(rowId);
    },
    [onCommitCell, flashRow],
  );

  // Company picker in the description popover lives outside the
  // generic onUpdateCell / onCommitCell path — it has its own dispatch
  // surface so it can route budget rows through `bulkUpdate` and
  // history rows through `updateHistoryEntry`. Wrap it here so picking
  // a company (or clearing the existing one) gets the same heartbeat
  // confirmation as the cell-level edits.
  const handleSetRowCompany = useCallback(
    (row: Row, companyId: string | null) => {
      onSetRowCompany(row, companyId);
      flashRow(row.id);
    },
    [onSetRowCompany, flashRow],
  );
  const handleSetRowNoCompany = useCallback(
    (row: Row, next: boolean) => {
      onSetRowNoCompany(row, next);
      flashRow(row.id);
    },
    [onSetRowNoCompany, flashRow],
  );

  // Flash newly-added rows. Diffs `rows` ids across renders and fires
  // the heartbeat on a single new id — the shape produced by the
  // inline "+" button (and a non-series complex entry). Multi-row
  // additions (series, paste, bulk copy) intentionally skip the
  // heartbeat; flashing N rows at once reads as chaos rather than
  // confirmation, and the user already saw the form they submitted.
  // The ref is null on first mount so the initial load doesn't pulse
  // every existing row; the sheet-key on BudgetPage means switching
  // sheets resets this state.
  const prevRowIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const current = new Set(rows.map((r) => r.id));
    const prev = prevRowIdsRef.current;
    prevRowIdsRef.current = current;
    if (prev === null) return;
    let newId: string | null = null;
    for (const id of current) {
      if (!prev.has(id)) {
        if (newId !== null) return; // more than one new id — skip
        newId = id;
      }
    }
    if (newId !== null) flashRow(newId);
  }, [rows, flashRow]);

  return {
    handleUpdateCell,
    handleCommitCell,
    handleSetRowCompany,
    handleSetRowNoCompany,
  };
}
