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

  return createPortal(
    <div
      ref={dropdownRef}
      data-active-portal
      className={`${positionClass} z-50 flex flex-col overflow-y-auto rounded border border-line bg-surface-2 shadow-lg ${className}`.trim()}
      style={{
        top: position.top,
        left: position.left,
        minWidth: position.width,
        maxHeight: position.maxHeight,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
