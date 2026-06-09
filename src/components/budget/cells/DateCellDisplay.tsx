import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import type { Settings } from "../../../data/types";
import { useT } from "../../../i18n";
import {
  formatDate,
  formatDayOnly,
  formatShortDate,
} from "../../../utils/format";
import { monthColorVar, monthNumberFromKey } from "../../../utils/monthColor";
import { CELL_BASE } from "./constants";

type Props = {
  iso: string;
  settings: Settings;
  // `"static"` renders a non-interactive `<td>` (read-only rows).
  // `"trigger"` renders a `<button>` inside a `<td>` that opens a
  // date picker on click (editable rows).
  mode: "static" | "trigger";
  onClick?: () => void;
  // Manual fiscal-month override on the row this cell belongs to.
  // When set, a small arrow glyph renders next to the date so the user
  // can tell which rows have been pushed out of their natural fiscal
  // month — and into which direction.
  fiscalMonthShift?: -1 | 1;
};

// Renders one date cell. Colour follows the date's *calendar* month
// (so a row whose date is in April but whose fiscal-month bucket is
// May still reads as April), with a mobile/desktop split:
// — mobile: `formatDayOnly` ("16")
// — desktop: `formatShortDate` ("16/5")
//
// The editable variant adds a button shell + click handler; the static
// variant is non-interactive. Both share every other styling decision
// (font, colour, alignment, em-dash placeholder).
export function DateCellDisplay({
  iso,
  settings,
  mode,
  onClick,
  fiscalMonthShift,
}: Props) {
  const t = useT();
  const short = iso ? formatShortDate(iso, settings.shortDateFormat) : "";
  const dayOnly = iso ? formatDayOnly(iso) : "";
  const monthNum = iso ? monthNumberFromKey(iso) : null;
  const monthColor = monthNum !== null ? monthColorVar(monthNum) : undefined;
  const style = iso && monthColor ? { color: monthColor } : undefined;
  const mutedClass = iso ? "" : "text-muted";
  const shiftLabel =
    fiscalMonthShift === 1
      ? t("cell.shiftIndicatorNext")
      : fiscalMonthShift === -1
        ? t("cell.shiftIndicatorPrev")
        : null;
  const shiftIcon =
    fiscalMonthShift === 1 ? (
      <ArrowUpRight
        size={11}
        aria-hidden
        focusable={false}
        className="ml-0.5 inline-block align-baseline text-meta"
      />
    ) : fiscalMonthShift === -1 ? (
      <ArrowDownLeft
        size={11}
        aria-hidden
        focusable={false}
        className="ml-0.5 inline-block align-baseline text-meta"
      />
    ) : null;
  const spans = (
    <>
      <span className="md:hidden">{dayOnly || "—"}</span>
      <span className="hidden md:inline">{short || "—"}</span>
      {shiftIcon}
    </>
  );

  if (mode === "trigger") {
    const formatted = iso ? formatDate(iso, settings.dateFormat) : "";
    return (
      <td className={`${CELL_BASE} relative p-0`}>
        <button
          type="button"
          className={`block w-full cursor-pointer border-0 bg-transparent px-1 py-[var(--table-cell-py)] text-center font-mono font-bold tabular-nums whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:px-[var(--table-cell-px)] md:font-normal md:text-right ${mutedClass}`}
          style={style}
          aria-label={iso ? `Change date (${formatted})` : "Pick a date"}
          title={shiftLabel ?? undefined}
          onClick={onClick}
        >
          {spans}
        </button>
      </td>
    );
  }

  return (
    <td
      className={`${CELL_BASE} relative px-1 py-[var(--table-cell-py)] text-center font-mono font-bold tabular-nums whitespace-nowrap md:px-[var(--table-cell-px)] md:font-normal md:text-right ${mutedClass}`}
      style={style}
      title={shiftLabel ?? undefined}
      aria-readonly="true"
    >
      {spans}
    </td>
  );
}
