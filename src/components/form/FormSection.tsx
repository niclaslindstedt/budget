import type { ReactNode } from "react";

type Props = {
  label: ReactNode;
  // Render as <label> when the inner control is a single form input so
  // tapping the label text focuses the input. Default to <div> for
  // sections that wrap pickers, palettes, or button groups.
  as?: "div" | "label";
  className?: string;
  children: ReactNode;
};

export function FormSection({ label, as = "div", className, children }: Props) {
  const cls = className
    ? `flex flex-col gap-1.5 ${className}`
    : "flex flex-col gap-1.5";
  if (as === "label") {
    return (
      <label className={cls}>
        <span className="text-xs text-muted">{label}</span>
        {children}
      </label>
    );
  }
  return (
    <div className={cls}>
      <span className="text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}
