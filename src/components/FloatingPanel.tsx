import { useRef } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";

import {
  type FloatingPlacement,
  useEscapeKey,
  useFloatingPosition,
  usePointerOutside,
} from "../hooks";
import { useBlocksSheet } from "./useBlocksSheet";

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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const position = useFloatingPosition(triggerRef, open, placement);

  useEscapeKey(open, onClose);
  usePointerOutside(open, [triggerRef, dropdownRef], onClose);
  useBlocksSheet(rowId, open, onClose);

  if (!open || !position) return null;

  // `fixed` rides the layout viewport (pickers in cells / page chrome);
  // `absolute` rides the document so the panel scrolls with the page.
  const positionClass =
    placement.coordinateSpace === "viewport" ? "fixed" : "absolute";

  // The arrow is a rotated square whose centre sits on the panel's top
  // edge: the top-left and top-right edges of the diamond stick up out
  // of the panel (the visible arrow), the bottom-left and bottom-right
  // edges sit just inside the panel's top border. Rendered after the
  // panel in DOM order at the same z-index so the arrow's opaque
  // background paints over the segment of the panel's top border that
  // would otherwise cut across the arrow base, while the arrow's two
  // bordered edges meet the panel border flush on either side.
  // `overflow-y-auto` on the panel would otherwise clip the tip, which
  // is why the arrow lives outside the panel rather than inside.
  //
  // The `peer` class on the panel + `peer-focus-within:` on the arrow
  // continues the panel's focus-within accent ring across the arrow's
  // two visible edges, so an editable popover (description reveal) draws
  // a single uninterrupted accent shape around the textarea and its tip.
  // Without it the arrow stayed `border-line` even with the textarea
  // focused, cutting the highlight off at the panel's top border.
  const ARROW_SIZE = 12;
  return createPortal(
    <>
      <div
        ref={dropdownRef}
        data-active-portal
        className={`peer ${positionClass} z-50 flex flex-col overflow-y-auto rounded border border-line bg-surface-2 shadow-lg focus-within:border-accent ${className}`.trim()}
        style={{
          top: position.top,
          left: position.left,
          minWidth: position.width,
          maxHeight: position.maxHeight,
        }}
      >
        {children}
      </div>
      {arrow === "up" && (
        <div
          aria-hidden
          className={`${positionClass} z-50 rotate-45 border-t border-l border-line bg-surface-2 peer-focus-within:border-accent`}
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
