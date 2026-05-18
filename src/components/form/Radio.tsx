import { createContext, useContext } from "react";

type RadioGroupContext = {
  name: string;
  value: string;
  onChange: (next: string) => void;
};

const Ctx = createContext<RadioGroupContext | null>(null);

type GroupProps = {
  // Group name — becomes the `name` attribute on every radio input
  // inside so the browser treats them as one mutually-exclusive set.
  name: string;
  value: string;
  onChange: (next: string) => void;
  // Optional aria-label for the group when no <legend> wraps it.
  ariaLabel?: string;
  // Stack direction. Defaults to "column" (each radio on its own row).
  direction?: "column" | "row";
  className?: string;
  children: React.ReactNode;
};

export function RadioGroup({
  name,
  value,
  onChange,
  ariaLabel,
  direction = "column",
  className = "",
  children,
}: GroupProps) {
  const layout =
    direction === "row" ? "flex-row flex-wrap gap-3" : "flex-col gap-2";
  return (
    <Ctx.Provider value={{ name, value, onChange }}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className={`flex ${layout} ${className}`.trim()}
      >
        {children}
      </div>
    </Ctx.Provider>
  );
}

type RadioProps = {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
};

// Custom radio sharing the Checkbox accessibility pattern: real input
// hidden via `sr-only`, sibling span renders the visual circle and
// inner dot keyed off the input's `:checked` state. Must be rendered
// inside a <RadioGroup>.
export function Radio({
  value,
  label,
  description,
  disabled,
  id,
  className = "",
}: RadioProps) {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("<Radio> must be rendered inside a <RadioGroup>");
  }
  const checked = ctx.value === value;
  return (
    <label
      className={`inline-flex cursor-pointer items-start gap-2 ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      } ${className}`.trim()}
    >
      <input
        id={id}
        type="radio"
        name={ctx.name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => ctx.onChange(value)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 transition-colors peer-checked:border-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      >
        <span
          className={`h-2 w-2 rounded-full bg-accent transition-opacity ${checked ? "opacity-100" : "opacity-0"}`}
        />
      </span>
      <span className="flex flex-col gap-0.5 text-left">
        <span className="text-sm text-fg-bright select-none">{label}</span>
        {description && (
          <span className="text-xs text-muted select-none">{description}</span>
        )}
      </span>
    </label>
  );
}
