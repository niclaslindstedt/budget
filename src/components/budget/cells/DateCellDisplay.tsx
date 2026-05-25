import type { Settings } from "../../../data/types";
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
export function DateCellDisplay({ iso, settings, mode, onClick }: Props) {
  const short = iso ? formatShortDate(iso, settings.shortDateFormat) : "";
  const dayOnly = iso ? formatDayOnly(iso) : "";
  const monthNum = iso ? monthNumberFromKey(iso) : null;
  const monthColor = monthNum !== null ? monthColorVar(monthNum) : undefined;
  const style = iso && monthColor ? { color: monthColor } : undefined;
  const mutedClass = iso ? "" : "text-muted";
  const spans = (
    <>
      <span className="md:hidden">{dayOnly || "—"}</span>
      <span className="hidden md:inline">{short || "—"}</span>
    </>
  );

  if (mode === "trigger") {
    const formatted = iso ? formatDate(iso, settings.dateFormat) : "";
    return (
      <td className={`${CELL_BASE} relative p-0`}>
        <button
          type="button"
          className={`block w-full cursor-pointer border-0 bg-transparent px-1 py-2 text-center font-mono font-bold tabular-nums whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:px-2.5 md:font-normal md:text-right ${mutedClass}`}
          style={style}
          aria-label={iso ? `Change date (${formatted})` : "Pick a date"}
          onClick={onClick}
        >
          {spans}
        </button>
      </td>
    );
  }

  return (
    <td
      className={`${CELL_BASE} relative px-1 py-2 text-center font-mono font-bold tabular-nums whitespace-nowrap md:px-2.5 md:font-normal md:text-right ${mutedClass}`}
      style={style}
      aria-readonly="true"
    >
      {spans}
    </td>
  );
}
