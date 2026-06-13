import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

import {
  buildPoints,
  previewRows,
  readTabularFile,
  resolveDayFirst,
  suggestColumns,
  type ImportedPoint,
  type TabularGrid,
} from "../data/import/value-import";
import type { Settings } from "../data/types";
import { useLang, useT } from "../i18n";
import { formatBalance, formatDate } from "../utils/format";
import { Button } from "./form";
import { Modal } from "./Modal";

// Universal CSV / Excel importer for every "update value over time" modal
// (items, property, savings, loans, holdings, stock prices). The user
// drops a file; it renders as a spreadsheet-style grid where clicking a
// column header marks it as the date or the value column. The chosen
// columns are previewed normalised — the date column shows the parsed ISO
// date in the user's format, the value column shows the parsed number —
// and rows that can't be read are flagged so the user sees exactly what
// will (and won't) import before committing. Column detection seeds a
// sensible default; the two roles are always re-assignable on the grid.
//
// Page-agnostic: the modal only knows "date + value". The owning page's
// host maps the resulting points onto its own history via a bulk reducer
// action. Not `centered` — the grid wants the full height, and the file
// input doesn't open the soft keyboard.

// Cap rendered rows so a huge file doesn't blow up the DOM; the import
// itself still uses every row.
const MAX_PREVIEW_ROWS = 200;

type Role = "date" | "value";

type Props = {
  open: boolean;
  onClose: () => void;
  // The thing being updated (item / property / loan name), shown as a
  // subheading so the user knows which history they're importing into.
  subject: string;
  // Column-role label for the value side ("Value", "Balance", "Price").
  valueLabel: string;
  settings: Settings;
  // Savings can go negative (overdraft); every other history stores a
  // magnitude, so the importer takes the absolute value by default.
  allowNegative?: boolean;
  onImport: (points: ImportedPoint[]) => void;
};

export function BatchValueImportModal({
  open,
  onClose,
  subject,
  valueLabel,
  settings,
  allowNegative = false,
  onImport,
}: Props) {
  const t = useT();
  const lang = useLang();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [grid, setGrid] = useState<TabularGrid | null>(null);
  const [fileName, setFileName] = useState("");
  const [dateCol, setDateCol] = useState<number | null>(null);
  const [valueCol, setValueCol] = useState<number | null>(null);
  const [mode, setMode] = useState<Role>("date");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function reset() {
    setGrid(null);
    setFileName("");
    setDateCol(null);
    setValueCol(null);
    setMode("date");
    setError(null);
    setDragging(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function loadFile(file: File) {
    setError(null);
    try {
      const bytes = await file.arrayBuffer();
      const parsed = await readTabularFile(file.name, bytes);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError(t("valueImport.emptyFile"));
        return;
      }
      const suggestion = suggestColumns(parsed);
      setGrid(parsed);
      setFileName(file.name);
      setDateCol(suggestion.dateColumn);
      setValueCol(suggestion.valueColumn);
      // Start the user on whichever role detection left unfilled.
      setMode(suggestion.dateColumn === null ? "date" : "value");
    } catch {
      setError(t("valueImport.unreadable"));
    }
  }

  function assignColumn(col: number) {
    if (mode === "date") {
      if (valueCol === col) setValueCol(null);
      setDateCol(col);
      setMode("value");
    } else {
      if (dateCol === col) setDateCol(null);
      setValueCol(col);
      setMode("date");
    }
  }

  const dayFirst = useMemo(() => {
    if (!grid || dateCol === null) return true;
    return resolveDayFirst(grid, dateCol, settings.dateFormat);
  }, [grid, dateCol, settings.dateFormat]);

  const rowPreview = useMemo(() => {
    if (!grid || dateCol === null || valueCol === null) return null;
    return previewRows(grid, {
      dateColumn: dateCol,
      valueColumn: valueCol,
      dayFirst,
    });
  }, [grid, dateCol, valueCol, dayFirst]);

  const points = useMemo<ImportedPoint[]>(() => {
    if (!grid || dateCol === null || valueCol === null) return [];
    return buildPoints(
      grid,
      { dateColumn: dateCol, valueColumn: valueCol, dayFirst },
      allowNegative ? (v) => v : Math.abs,
    );
  }, [grid, dateCol, valueCol, dayFirst, allowNegative]);

  if (!open) return null;

  const totalRows = grid?.rows.length ?? 0;
  const skipped = rowPreview
    ? rowPreview.filter((r) => r.date === null || r.value === null).length
    : 0;
  const canImport = points.length > 0;

  function roleOf(col: number): Role | null {
    if (col === dateCol) return "date";
    if (col === valueCol) return "value";
    return null;
  }

  return (
    <Modal
      open
      onClose={handleClose}
      labelledBy="batch-value-import-title"
      size="max-w-3xl"
    >
      <Modal.Header
        icon={<FileSpreadsheet size={14} aria-hidden focusable={false} />}
        title={t("valueImport.title")}
        onClose={handleClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm font-bold text-fg-bright">{subject}</p>

          {grid === null ? (
            <DropZone
              dragging={dragging}
              setDragging={setDragging}
              onPick={() => fileInputRef.current?.click()}
              onFile={loadFile}
              error={error}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-xs text-muted">
                {t("valueImport.instruction")}
              </p>

              {/* Role selector — the active role is what a header click
                  assigns. */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <RoleButton
                  active={mode === "date"}
                  tone="accent"
                  label={t("valueImport.dateColumn")}
                  onClick={() => setMode("date")}
                />
                <RoleButton
                  active={mode === "value"}
                  tone="positive"
                  label={valueLabel}
                  onClick={() => setMode("value")}
                />
              </div>

              <div className="overflow-x-auto rounded border border-line">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      {grid.headers.map((header, col) => {
                        const role = roleOf(col);
                        const tone =
                          role === "date"
                            ? "border-accent bg-accent/10 text-accent"
                            : role === "value"
                              ? "border-positive bg-positive/10 text-positive"
                              : "border-line text-muted";
                        return (
                          <th
                            key={col}
                            scope="col"
                            className="border-b border-line p-0 text-left align-bottom"
                          >
                            <button
                              type="button"
                              onClick={() => assignColumn(col)}
                              aria-pressed={role !== null}
                              className={`flex w-full cursor-pointer flex-col gap-0.5 border-b-2 bg-transparent px-2 py-1.5 text-left hover:bg-surface-2 ${tone}`}
                            >
                              <span className="truncate font-bold">
                                {header}
                              </span>
                              {role !== null && (
                                <span className="text-[0.6rem] font-bold tracking-wider uppercase">
                                  {role === "date"
                                    ? t("valueImport.dateColumn")
                                    : valueLabel}
                                </span>
                              )}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.rows.slice(0, MAX_PREVIEW_ROWS).map((row, r) => {
                      const pv = rowPreview?.[r];
                      const isSkipped =
                        pv != null && (pv.date === null || pv.value === null);
                      return (
                        <tr
                          key={r}
                          className={
                            isSkipped ? "opacity-45" : "even:bg-surface-2/40"
                          }
                        >
                          {row.map((cell, col) => {
                            const role = roleOf(col);
                            return (
                              <td
                                key={col}
                                className={`border-b border-line px-2 py-1 whitespace-nowrap tabular-nums ${
                                  role === "date"
                                    ? "bg-accent/5 text-fg-bright"
                                    : role === "value"
                                      ? "bg-positive/5 text-right text-fg-bright"
                                      : "text-muted"
                                }`}
                              >
                                <CellText
                                  cell={cell}
                                  role={role}
                                  preview={pv}
                                  settings={settings}
                                  lang={lang}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalRows > MAX_PREVIEW_ROWS && (
                <p className="m-0 text-xs text-muted">
                  {t("valueImport.rowsShown", {
                    shown: String(MAX_PREVIEW_ROWS),
                    total: String(totalRows),
                  })}
                </p>
              )}

              {dateCol === null || valueCol === null ? (
                <p className="m-0 text-xs text-meta">
                  {t("valueImport.pickBoth")}
                </p>
              ) : (
                <p className="m-0 text-xs text-muted">
                  {points.length === 1
                    ? t("valueImport.readyOne")
                    : t("valueImport.readyOther", {
                        count: String(points.length),
                      })}
                  {skipped > 0 && (
                    <span className="text-meta">
                      {" · "}
                      {t("valueImport.skipped", { count: String(skipped) })}
                    </span>
                  )}
                </p>
              )}

              <button
                type="button"
                onClick={reset}
                className="cursor-pointer self-start border-0 bg-transparent p-0 text-xs text-link underline hover:text-accent"
              >
                {t("valueImport.chooseDifferent")} ({fileName})
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadFile(file);
            e.target.value = "";
          }}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          {t("common.cancel")}
        </Button>
        {grid !== null && (
          <Button
            variant="primary"
            disabled={!canImport}
            onClick={() => {
              onImport(points);
              handleClose();
            }}
          >
            {points.length === 1
              ? t("valueImport.importOne")
              : t("valueImport.importOther", { count: String(points.length) })}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

function CellText({
  cell,
  role,
  preview,
  settings,
  lang,
}: {
  cell: string | number | null;
  role: Role | null;
  preview: { date: string | null; value: number | null } | undefined;
  settings: Settings;
  lang: ReturnType<typeof useLang>;
}) {
  if (role === "date" && preview) {
    if (preview.date === null)
      return <span className="text-danger">{String(cell ?? "")}</span>;
    return <>{formatDate(preview.date, settings.dateFormat, lang)}</>;
  }
  if (role === "value" && preview) {
    if (preview.value === null)
      return <span className="text-danger">{String(cell ?? "")}</span>;
    return (
      <>{formatBalance(preview.value, settings, { neverAbbreviate: true })}</>
    );
  }
  return <>{cell === null ? "" : String(cell)}</>;
}

function RoleButton({
  active,
  tone,
  label,
  onClick,
}: {
  active: boolean;
  tone: "accent" | "positive";
  label: string;
  onClick: () => void;
}) {
  const activeClass =
    tone === "accent"
      ? "border-accent bg-accent/10 text-accent"
      : "border-positive bg-positive/10 text-positive";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded border px-2 py-1 font-bold ${
        active ? activeClass : "border-line text-muted hover:border-accent"
      }`}
    >
      {label}
    </button>
  );
}

function DropZone({
  dragging,
  setDragging,
  onPick,
  onFile,
  error,
}: {
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onPick: () => void;
  onFile: (file: File) => void;
  error: string | null;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={`flex flex-col items-center gap-3 rounded border border-dashed px-4 py-8 text-center ${
          dragging ? "border-accent bg-accent/5" : "border-line"
        }`}
      >
        <Upload
          size={24}
          className="text-muted"
          aria-hidden
          focusable={false}
        />
        <p className="m-0 text-sm text-muted">{t("valueImport.dropHint")}</p>
        <Button variant="secondary" onClick={onPick}>
          {t("valueImport.browse")}
        </Button>
        <p className="m-0 text-xs text-muted">{t("valueImport.supported")}</p>
      </div>
      {error !== null && <p className="m-0 text-xs text-danger">{error}</p>}
    </div>
  );
}
