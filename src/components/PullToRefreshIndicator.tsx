import { ArrowDown, Loader } from "lucide-react";

import { useT } from "../i18n";
import type { PullToRefreshState } from "../hooks/usePullToRefresh";

// Slide-down pill that surfaces the pull-to-refresh gesture. Pinned to
// the top edge of the visible viewport (below the iOS safe-area inset
// / Dynamic Island) and translated by `pullDistance` so it appears to
// emerge from behind the sticky header as the user pulls. Visually
// shares the same border / surface tokens as `UpdateToast` so the two
// "system update" affordances feel like one chrome family.
//
// Three-state arrow + label:
//   pulling   → ↓ "Pull to refresh"
//   release   → ↑ (rotated) "Release to refresh"
//   refreshing → spinner "Refreshing…"
//
// Rendered above the sticky header (`z-[55]` beats the header's `z-30`
// in BudgetView) so the pill is visible during the pull instead of
// being clipped by the header band.

type Props = {
  state: PullToRefreshState;
  pullDistance: number;
};

export function PullToRefreshIndicator({ state, pullDistance }: Props) {
  const t = useT();
  if (state === "idle" && pullDistance === 0) return null;

  const label =
    state === "refreshing"
      ? t("pwa.refreshing")
      : state === "release"
        ? t("pwa.releaseToRefresh")
        : t("pwa.pullToRefresh");

  // Indicator slides from above the viewport (translateY(-100%)) into
  // place. The -44px floor matches the pill's approximate rendered
  // height so it sits flush above the page until pulled.
  const offset = Math.min(pullDistance, 70);
  const opacity = Math.min(1, pullDistance / 50);
  const rotated = state === "release" || state === "refreshing";
  // While refreshing, lock to the trigger position and ease the slide;
  // during the live drag, tracking must be 1:1 so the pull feels
  // attached to the finger.
  const smooth = state === "refreshing" || state === "idle";

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[55] flex justify-center"
      style={{
        top: "env(safe-area-inset-top, 0px)",
        transform: `translateY(${offset - 44}px)`,
        opacity,
        transition: smooth
          ? "transform 200ms ease-out, opacity 200ms ease-out"
          : "none",
      }}
    >
      <div className="inline-flex items-center gap-2 rounded border border-line bg-surface px-3 py-2 text-sm text-fg shadow-md">
        {state === "refreshing" ? (
          <Loader
            size={14}
            aria-hidden
            focusable={false}
            className="animate-spin"
          />
        ) : (
          <ArrowDown
            size={14}
            aria-hidden
            focusable={false}
            className="transition-transform duration-150"
            style={{ transform: rotated ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        )}
        <span>{label}</span>
      </div>
    </div>
  );
}
