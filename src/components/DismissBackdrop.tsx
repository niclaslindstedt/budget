import { createPortal } from "react-dom";

// Invisible full-viewport backdrop that catches every tap outside the
// element it's escorting. Render it conditionally — when an inline
// editor / popover is open and should be treated as modal-from-the-
// rest-of-the-page. The host element (input, textarea, dropdown,
// swipe-revealed row, …) is responsible for sitting ABOVE the backdrop
// via `position: relative; z-index: 60` (or any positioning + z-index
// above 50) so taps on it still land where they should.
//
// Why a backdrop instead of a document-level capture-phase listener:
// iOS Safari fires focus on an `<input>` before any capture-phase
// listener can preventDefault the mouse / touch sequence, so swallowing
// the dismissing pointerdown / mousedown / click was unreliable — the
// input under the tap focused anyway and popped the keyboard. With the
// backdrop, the tap never reaches the underlying element in the first
// place: pointer events land on the topmost element at the tap
// location, and the topmost thing is either the host (which the caller
// has elevated above the backdrop) or this backdrop (which only
// dismisses).
//
// `data-active-portal` keeps `ActiveRowProvider` from treating a tap on
// this backdrop as "outside the active region" and dismissing the row
// itself — the host's own dismiss callback owns that decision.
export function DismissBackdrop({ onDismiss }: { onDismiss: () => void }) {
  return createPortal(
    <div
      data-active-portal
      aria-hidden
      className="fixed inset-0 z-50"
      onPointerDown={(e) => {
        e.preventDefault();
        onDismiss();
      }}
    />,
    document.body,
  );
}
