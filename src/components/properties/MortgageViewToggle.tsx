import { LayoutList, Rows3 } from "lucide-react";

import { useT } from "../../i18n";

type MortgageView = "unified" | "split";

type Props = {
  view: MortgageView;
  onChange: (view: MortgageView) => void;
};

// A two-glyph segmented toggle that swaps a property's mortgage section between
// the unified (summed) view and the split (per-loan) view — sitting to the left
// of the mortgage section's "…" menu. The two halves are molded into one track;
// a single "active" pill slides between them when the view changes, so the mode
// reads at a glance instead of hiding behind a menu label. Only rendered when
// the property has two or more mortgages to combine (see `PropertyCard`).
export function MortgageViewToggle({ view, onChange }: Props) {
  const t = useT();
  const modes: { mode: MortgageView; icon: React.ReactNode; label: string }[] =
    [
      {
        mode: "unified",
        icon: <LayoutList size={16} aria-hidden focusable={false} />,
        label: t("properties.viewUnified"),
      },
      {
        mode: "split",
        icon: <Rows3 size={16} aria-hidden focusable={false} />,
        label: t("properties.viewSplit"),
      },
    ];

  return (
    <div
      role="group"
      aria-label={t("properties.viewToggle")}
      className="relative inline-flex rounded border border-line bg-surface-3"
    >
      {/* The sliding "active" pill — translates to the right half when the
          split view is active. The global reduce-motion rule zeroes the
          transition for users who opt out. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded bg-surface transition-transform"
        style={{
          transform: view === "split" ? "translateX(100%)" : "translateX(0)",
        }}
      />
      {modes.map(({ mode, icon, label }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={view === mode}
          aria-label={label}
          title={label}
          className={`relative z-10 cursor-pointer border-0 bg-transparent p-1.5 transition-colors ${
            view === mode ? "text-accent" : "text-muted hover:text-fg"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
