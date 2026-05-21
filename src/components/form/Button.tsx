import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

// Standard chrome for the project's modal footers (Cancel / Save /
// Delete) and most "action" buttons elsewhere — the three colour
// variants are the only ones reused at the px-3 py-1.5 text-sm size,
// so the variant is a closed union rather than a free-form prop.
export type ButtonVariant = "primary" | "secondary" | "danger";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // Used for the affirmative action in a modal footer (Save, Create,
  // Confirm). Disabled styling lives in the base class so callers can
  // pass `disabled` without re-stating opacity / cursor classes.
  primary:
    "border-accent bg-accent/10 font-bold text-accent hover:bg-accent/20",
  // Used for Cancel and other neutral / dismiss actions. Visually
  // recedes so the primary button is the obvious target.
  secondary: "border-line text-muted hover:text-fg",
  // Used for destructive actions (Delete). Restricted to one button
  // per modal footer per the project's visual conventions.
  danger: "border-danger/60 bg-danger/10 text-danger hover:bg-danger/20",
};

const BASE_CLASS =
  "cursor-pointer rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: ButtonVariant;
  // Set when the button's children include a leading icon (e.g.
  // `<Trash2 /> Delete`). Adds `inline-flex items-center gap-1.5` so
  // the icon aligns with the label vertically and the two stay
  // 6px apart horizontally.
  withIcon?: boolean;
  children: ReactNode;
};

// Shared button chrome for modal footers and other actions sharing
// the same px-3 / py-1.5 / text-sm sizing. Forwards every standard
// `<button>` attribute (onClick, disabled, title, aria-*, ref, …) and
// defaults `type="button"` so call sites inside a form never submit
// the form by accident — callers wiring a real form submission can
// pass `type="submit"` explicitly. Callers needing a different size
// or look (e.g. inline picker actions at text-xs) stay on a raw
// `<button>`.
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant, withIcon, children, className = "", type = "button", ...rest },
  ref,
) {
  const iconClass = withIcon ? "inline-flex items-center gap-1.5" : "";
  const merged =
    `${BASE_CLASS} ${VARIANT_CLASS[variant]} ${iconClass} ${className}`
      .replace(/\s+/g, " ")
      .trim();
  return (
    <button ref={ref} type={type} {...rest} className={merged}>
      {children}
    </button>
  );
});
