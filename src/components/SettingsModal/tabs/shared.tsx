import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { Settings } from "../../../data/types";
import { unlock } from "../../../data/achievements";
import { useIsMobile } from "../../../hooks";
import { useT } from "../../../i18n";
import { Checkbox } from "../../form";

export type Update = <K extends keyof Settings>(
  key: K,
  value: Settings[K],
) => void;

// A section taller than this fraction of the viewport becomes
// collapsible — the threshold the user asked for ("more than 50% of
// the screen height"). Measured live against the section's own
// rendered height, so it tracks content changes (adding a category)
// and viewport resizes without a hardcoded list of "big" sections.
const COLLAPSE_VIEWPORT_RATIO = 0.5;

// A labelled settings group. Auto-detects when its content is tall
// enough to be worth folding away and, when so, turns the legend into
// a disclosure toggle. Short sections render exactly as a plain
// fieldset with no extra chrome, so the common case is untouched.
//
// Children stay mounted while collapsed (hidden, not unmounted) so a
// half-typed draft in an admin list survives a fold, and so the
// height measurement that drives the collapsible flag keeps working
// once the user expands again.
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const [collapsible, setCollapsible] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    // A hidden (collapsed) body reports 0 — skip so we never clear the
    // collapsible flag based on the folded measurement.
    const height = el.offsetHeight;
    if (height === 0) return;
    setCollapsible(height > window.innerHeight * COLLAPSE_VIEWPORT_RATIO);
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  return (
    <fieldset
      className={
        collapsed
          ? "mt-3 rounded border border-dashed border-line bg-surface-3 px-3 py-1.5 first:mt-0"
          : "mt-3 rounded border border-line bg-surface-3 p-3 first:mt-0"
      }
    >
      <legend className="px-1">
        {collapsible ? (
          <button
            type="button"
            onClick={() =>
              setCollapsed((c) => {
                if (!c) unlock("tidyMind");
                return !c;
              })
            }
            aria-expanded={!collapsed}
            aria-controls={contentId}
            aria-label={t(
              collapsed
                ? "settings.section.expand"
                : "settings.section.collapse",
              { title },
            )}
            className="group -mx-1 flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs font-bold tracking-wide text-muted uppercase transition-colors hover:text-fg-bright"
          >
            {collapsed ? (
              <ChevronRight
                size={13}
                aria-hidden
                focusable={false}
                className="shrink-0 text-muted transition-colors group-hover:text-accent"
              />
            ) : (
              <ChevronDown
                size={13}
                aria-hidden
                focusable={false}
                className="shrink-0 text-accent"
              />
            )}
            <span>{title}</span>
            {collapsed && (
              <span className="ml-1 text-[10px] font-normal tracking-normal text-muted normal-case opacity-70 transition-opacity group-hover:opacity-100">
                {t("settings.section.collapsedHint")}
              </span>
            )}
          </button>
        ) : (
          <span className="text-xs font-bold tracking-wide text-muted uppercase">
            {title}
          </span>
        )}
      </legend>
      <div
        id={contentId}
        ref={contentRef}
        hidden={collapsed}
        // No display utility while collapsed: a `flex` class would
        // override the `hidden` attribute's `display:none`.
        className={collapsed ? undefined : "flex flex-col gap-3"}
      >
        {children}
      </div>
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
