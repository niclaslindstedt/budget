import { Check } from "lucide-react";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  // Label rendered next to the box. Wrapping the box and label in the
  // same <label> means tapping anywhere in the row toggles the state.
  label?: React.ReactNode;
  // Optional second line under the label.
  description?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  // Tailwind classes appended to the outer <label> — most callers
  // don't need this, but a few want to flatten the label to inline.
  className?: string;
  // Accessible label when no visible `label` is rendered (e.g. the
  // checkbox sits in a row that already labels itself).
  ariaLabel?: string;
};

// Accessible custom checkbox. The native input is visually hidden
// (`sr-only`) but still receives focus, fires change events, and is
// announced by screen readers. A sibling <span> renders the visual,
// keyed off the input's `:checked` state via Tailwind's `peer:`.
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
  className = "",
  ariaLabel,
}: Props) {
  return (
    <label
      className={`inline-flex cursor-pointer items-start gap-2 ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      } ${className}`.trim()}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-line bg-surface-2 text-surface transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      >
        <Check
          size={12}
          strokeWidth={3}
          aria-hidden
          focusable={false}
          className={checked ? "opacity-100" : "opacity-0"}
        />
      </span>
      {(label || description) && (
        <span className="flex flex-col gap-0.5 text-left">
          {label && (
            <span className="text-sm text-fg-bright select-none">{label}</span>
          )}
          {description && (
            <span className="text-xs text-muted select-none">
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}
