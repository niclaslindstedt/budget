import { useState } from "react";

import { useT } from "../../i18n";
import { DatePickerModal } from "../DatePickerModal";

// Standard field surface, mirroring the look the native date inputs
// carried. A call site overrides it wholesale via `className`.
const DEFAULT_LOOK =
  "field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

type Props = {
  // Current ISO value (YYYY-MM-DD), or "" when unset.
  value: string;
  // Fires with the new ISO string, or "" when the user clears the date.
  onChange: (value: string) => void;
  // Surface look (border / background / text colour / padding) for the
  // trigger. Replaces the default field styling rather than appending to
  // it — Tailwind v4's source-ordering makes overriding an appended
  // colour unreliable, so a call site that wants the date-accent palette
  // passes its whole look here. Omit for the standard field look.
  className?: string;
  // Accessible name for the trigger when no wrapping label supplies one.
  ariaLabel?: string;
  // Dimmed text shown when `value` is empty. Defaults to "Select date".
  placeholder?: string;
  disabled?: boolean;
  // Optional inclusive ISO bounds forwarded to the calendar — days
  // outside the range can't be picked.
  min?: string;
  max?: string;
};

// Date-entry field: a trigger button that opens the custom
// `DatePickerModal`, replacing the native `<input type="date">`. WebKit's
// attached date popover dismisses when you navigate months while the
// input sits inside a `fixed` / `transform`ed container — which every
// fullscreen modal shell is on iOS — forcing a re-tap for each month
// change. The calendar modal has no dependency on the anchor's
// positioning, so month navigation stays put. Manages its own open state
// so a call site only wires `value` + `onChange`, exactly like the input
// it replaces.
export function DateField({
  value,
  onChange,
  className,
  ariaLabel,
  placeholder,
  disabled = false,
  min,
  max,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        className={`cursor-pointer text-left font-mono tabular-nums hover:border-accent ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        } ${className ?? DEFAULT_LOOK}`
          .replace(/\s+/g, " ")
          .trim()}
      >
        {value ? (
          value
        ) : (
          <span className="opacity-60">
            {placeholder ?? t("datePicker.placeholder")}
          </span>
        )}
      </button>
      <DatePickerModal
        open={open && !disabled}
        value={value}
        min={min}
        max={max}
        onClose={() => setOpen(false)}
        onSelect={(next) => onChange(next ?? "")}
      />
    </>
  );
}
