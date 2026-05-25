import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

import {
  type FloatingPlacement,
  useEscapeKey,
  useFloatingPosition,
} from "../hooks";
import { useBodyScrollLock } from "../utils/scroll-lock";
import { DismissBackdrop } from "./DismissBackdrop";
import { useClaimActiveRow } from "./useClaimActiveRow";

type Props = {
  open: boolean;
  // Closes the panel. Pickers that maintain "creating" sub-state pass
  // a function that resets both the open and creating flags.
  onClose: () => void;
  // Ref to the element the panel anchors against — usually the wrapper
  // around the trigger button. Also counts as the "inside" region for
  // click-outside detection.
  triggerRef: RefObject<HTMLElement | null>;
  placement: FloatingPlacement;
  // When set, registers with the active-row coordinator so a click
  // elsewhere in the same row dismisses the panel without also firing
  // the underlying control. Modals leave this undefined.
  rowId?: string;
  // Extra Tailwind classes appended to the panel root.
  className?: string;
  // When `"up"`, render a small upward-pointing arrow whose tip aligns
  // with the trigger's horizontal centre. Used by popovers that open
  // below their trigger and would otherwise read as detached from the
  // row above (e.g. description reveal on phones).
  arrow?: "up";
  children: React.ReactNode;
};

// Portalled dropdown / popover shell shared by the three custom
// pickers (Type, Category, Backend). Owns the float position, the
// escape + outside-click dismissal, the portal mount, and the optional
// active-row coordinator wiring. Each picker still renders its own
// trigger and dropdown contents — the heterogeneity of those is the
// whole point of letting each one own its visuals.
export function FloatingPanel({
  open,
  onClose,
  triggerRef,
  placement,
  rowId,
  className = "",
  arrow,
  children,
}: Props) {
  const position = useFloatingPosition(triggerRef, open, placement);

  useEscapeKey(open, onClose);
  useClaimActiveRow(rowId, open, onClose);
  // Lock body scroll while the panel is open. Without this, a touch
  // drag inside the panel chains to the page on iOS — most visibly on
  // the burger menu, whose short list never reaches its own scroll
  // boundary so `overflow-y-auto` alone doesn't suppress the chain.
  // The hook is ref-counted, so pickers opened inside an already-
  // modal context (Modal also locks) compose as no-ops.
  useBodyScrollLock(open);

  // When the panel closes after having held keyboard focus (the
  // listbox cursor lives inside the portal), return focus to the
  // trigger button so the keyboard journey continues from where it
  // started. Without this, Esc / outside-click leaves focus orphaned
  // on `<body>` and the next Tab restarts from the page's first
  // focusable. We only restore when the active element is inside the
  // panel — a mouse user who never moved focus shouldn't have their
  // keyboard cursor yanked back to the trigger.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const focusable = trigger.querySelector<HTMLElement>(
      "button, [href], [tabindex]:not([tabindex='-1'])",
    );
    if (focusable && document.activeElement === document.body) {
      focusable.focus();
    }
  }, [open, triggerRef]);

  if (!open || !position) return null;

  // `fixed` rides the layout viewport (pickers in cells / page chrome);
  // `absolute` rides the document so the panel scrolls with the page.
  const positionClass =
    placement.coordinateSpace === "viewport" ? "fixed" : "absolute";

  // When the hook flips the panel to "above" (not enough room below to
  // render a useful list), `position.top` is the y-coordinate the
  // panel's BOTTOM edge should sit at. `translateY(-100%)` anchors the
  // bottom there without us needing to know the actual rendered panel
  // height — the panel still grows downward from `top` in the
  // pre-transform sense, but the transform shifts it up by its own
  // height so the bottom lands where we wanted.
  const flipUp = position.placement === "above";

  // The arrow is a rotated square whose centre sits on the panel's top
  // edge ("below" placement) or bottom edge ("above" placement): two
  // of its edges stick out (the visible arrow point) and two sit just
  // inside the panel border. Rendered after the panel in DOM order at
  // the same z-index so the arrow's opaque background paints over the
  // segment of the panel's border that would otherwise cut across the
  // arrow base, while the arrow's two bordered edges meet the panel
  // border flush on either side. `overflow-y-auto` on the panel would
  // otherwise clip the tip, which is why the arrow lives outside the
  // panel rather than inside.
  //
  // The `peer` class on the panel + `peer-focus-within:` on the arrow
  // continues the panel's focus-within accent ring across the arrow's
  // two visible edges, so an editable popover (description reveal) draws
  // a single uninterrupted accent shape around the textarea and its tip.
  // Without it the arrow stayed `border-line` even with the textarea
  // focused, cutting the highlight off at the panel's border.
  const ARROW_SIZE = 12;
  // Arrow border edges: for an upward-pointing arrow at the panel's
  // top edge, the visible tip is the top-left + top-right of the
  // rotated square — so we border the bottom-left + bottom-right and
  // let the panel's background hide the rest. For a downward arrow at
  // the panel's bottom edge, mirror that: border the top-left +
  // top-right of the rotated square.
  const arrowBorderClass = flipUp ? "border-b border-r" : "border-t border-l";
  return createPortal(
    <>
      <DismissBackdrop onDismiss={onClose} />
      <div
        data-active-portal
        className={`peer ${positionClass} z-50 flex flex-col overflow-y-auto rounded border border-line bg-surface-2 shadow-lg focus-within:border-accent ${className}`.trim()}
        style={{
          top: position.top,
          left: position.left,
          minWidth: position.width,
          maxHeight: position.maxHeight,
          transform: flipUp ? "translateY(-100%)" : undefined,
        }}
      >
        {children}
      </div>
      {arrow === "up" && (
        <div
          aria-hidden
          className={`${positionClass} z-50 rotate-45 ${arrowBorderClass} border-line bg-surface-2 peer-focus-within:border-accent`}
          style={{
            top: position.top - ARROW_SIZE / 2,
            left: position.left + position.arrowLeft - ARROW_SIZE / 2,
            width: ARROW_SIZE,
            height: ARROW_SIZE,
          }}
        />
      )}
    </>,
    document.body,
  );
}
