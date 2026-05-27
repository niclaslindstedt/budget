import { useState } from "react";

import type { CellValue, Settings } from "../../../data/types";
import { DatePickerModal } from "../../DatePickerModal";
import { useClaimActiveRow } from "../../useClaimActiveRow";
import { DateCellDisplay } from "./DateCellDisplay";

export function DateCell({
  rowId,
  value,
  settings,
  fiscalMonthShift,
  onChange,
}: {
  rowId: string;
  value: CellValue;
  settings: Settings;
  fiscalMonthShift?: -1 | 1;
  onChange: (value: CellValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const iso = typeof value === "string" ? value : "";
  // Wire the date modal into the active-row coordinator. While the
  // calendar is open the BudgetAddEntryButton greys itself out and a tap on it
  // (or anywhere else outside the modal) only dismisses, mirroring how
  // amount focus and the description popover behave.
  useClaimActiveRow(rowId, open, () => setOpen(false));

  return (
    <>
      <DateCellDisplay
        iso={iso}
        settings={settings}
        mode="trigger"
        fiscalMonthShift={fiscalMonthShift}
        onClick={() => setOpen(true)}
      />
      <DatePickerModal
        open={open}
        value={iso}
        onClose={() => setOpen(false)}
        onSelect={(next) => onChange(next)}
      />
    </>
  );
}

// Read-only date cell for synthesized transfer rows. Uses the same
// long / short / day-only formatters as the editable variant so widths
// line up across the table.
export function ReadonlyDateCell({
  value,
  settings,
}: {
  value: string;
  settings: Settings;
}) {
  return <DateCellDisplay iso={value} settings={settings} mode="static" />;
}
