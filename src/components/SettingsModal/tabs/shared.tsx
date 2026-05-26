import { useId } from "react";

import type { Settings } from "../../../data/types";
import { useIsMobile } from "../../../hooks";
import { useT } from "../../../i18n";
import { Checkbox } from "../../form";

export type Update = <K extends keyof Settings>(
  key: K,
  value: Settings[K],
) => void;

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mt-3 rounded border border-line bg-surface-3 p-3 first:mt-0">
      <legend className="px-1 text-xs font-bold tracking-wide text-muted uppercase">
        {title}
      </legend>
      <div className="flex flex-col gap-3">{children}</div>
    </fieldset>
  );
}

// Grouping wrapper for a labelled row of custom controls. Renders as a
// `<div role="group">` rather than a `<label>` because the children are
// custom pickers (button + portalled listbox), not native form
// controls. A real `<label>` forwards clicks on any of its descendants
// to the first labelable element inside — for these rows, that meant
// clicking the hint text, the preview chip, or the empty space beside
// the picker would silently open the dropdown.
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-col gap-1.5"
    >
      <span id={labelId} className="text-xs text-muted">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Preview({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-line bg-surface px-2 py-1 font-mono text-xs text-path">
      {children}
    </span>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Checkbox
      checked={checked}
      onChange={onChange}
      label={label}
      description={hint}
    />
  );
}

// Small muted line above a section that holds device-scoped settings.
// Reads the viewport breakpoint and tells the user which scope they're
// editing. The label updates live if the user resizes a desktop
// browser narrow — matching the runtime `useEffectiveSettings` flip.
export function DeviceScopeHint() {
  const t = useT();
  const isMobile = useIsMobile();
  return (
    <p className="text-[11px] tracking-wide text-muted uppercase">
      {isMobile
        ? t("settings.appliesToMobile")
        : t("settings.appliesToDesktop")}
    </p>
  );
}
