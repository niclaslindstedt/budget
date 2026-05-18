import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useEscapeKey } from "../hooks";
import { useBodyScrollLock } from "../utils/scroll-lock";

// Shared shell for every modal dialog in the app. Owns the overlay
// (50% black backdrop + click-outside-to-close), the bordered surface
// shell (mobile bottom-sheet rounding, desktop centered card), the
// keyboard dismissal, the body scroll lock, and — on mobile only —
// a swipe-down-to-dismiss gesture from the drag handle.
//
// Usage:
//
//     <Modal open={open} onClose={onClose} labelledBy="my-title">
//       <Modal.Header title="My modal" onClose={onClose} />
//       <Modal.Body>...</Modal.Body>
//       <Modal.Footer>...</Modal.Footer>
//     </Modal>
//
// Bodies differ wildly across modals (scroll regions, tabs, action
// stacks); compound slots keep the shell rigid while letting bodies
// own their own structure. `Modal.Footer` is optional — modals like
// `ConfirmDialog` skip it and render their own action stack inside
// `Modal.Body`.

type LabelCtx = { id: string };
const ModalLabelContext = createContext<LabelCtx | null>(null);

type RootProps = {
  open: boolean;
  onClose: () => void;
  // Id assigned to `Modal.Header`'s title element so screen readers
  // announce it as the dialog's label.
  labelledBy: string;
  // Use `"alertdialog"` for destructive confirmations (ConfirmDialog).
  role?: "dialog" | "alertdialog";
  // Tailwind max-width class for the inner shell. Defaults to `max-w-lg`.
  size?: string;
  // When true, the inner shell uses `max-h-[95vh] flex-col
  // overflow-hidden` so `Modal.Body` can be a scrolling middle and
  // `Modal.Footer` stays stuck to the bottom. Default true.
  scrollableBody?: boolean;
  children: React.ReactNode;
};

// Pull the handle this far past its rest position to dismiss the
// sheet outright. Below this distance — and without a flick — the
// sheet snaps back to 0.
const DISMISS_DISTANCE_PX = 120;
// Flick threshold: a quick downward gesture (>= this many px/ms over
// a non-trivial distance) also dismisses, so the user doesn't have
// to drag all the way past DISMISS_DISTANCE_PX.
const FLICK_VELOCITY_PX_MS = 0.5;
const FLICK_MIN_DISTANCE_PX = 30;
// Animation duration for the snap-back and the dismiss slide-off.
const SETTLE_MS = 200;

export function Modal({
  open,
  onClose,
  labelledBy,
  role = "dialog",
  size = "max-w-lg",
  scrollableBody = true,
  children,
}: RootProps) {
  useBodyScrollLock(open);
  useEscapeKey(open, onClose);

  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    y: number;
    pointerId: number;
    time: number;
  } | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [settling, setSettling] = useState(false);

  // Reset transient drag state whenever the modal closes so the next
  // open starts from a clean slate.
  useEffect(() => {
    if (open) return;
    setDragY(0);
    setSettling(false);
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  if (!open) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragRef.current = {
      y: e.clientY,
      pointerId: e.pointerId,
      time: performance.now(),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setSettling(false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    setDragY(Math.max(0, e.clientY - start.y));
  };

  const finishDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const start = dragRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer was already released — ignore.
    }

    if (cancelled) {
      setSettling(true);
      setDragY(0);
      return;
    }

    const dy = e.clientY - start.y;
    const dt = Math.max(1, performance.now() - start.time);
    const velocity = dy / dt;
    const dismiss =
      dy >= DISMISS_DISTANCE_PX ||
      (velocity >= FLICK_VELOCITY_PX_MS && dy >= FLICK_MIN_DISTANCE_PX);

    if (dismiss) {
      const height =
        shellRef.current?.getBoundingClientRect().height ?? window.innerHeight;
      setSettling(true);
      setDragY(height + 80);
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        onClose();
      }, SETTLE_MS);
    } else {
      setSettling(true);
      setDragY(0);
    }
  };

  const shellSize = scrollableBody
    ? `flex max-h-[95vh] w-full ${size} flex-col overflow-hidden`
    : `w-full ${size}`;

  const dragging = dragRef.current !== null;
  const shellStyle: React.CSSProperties = {
    transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
    transition:
      !dragging && settling
        ? `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0.6, 0.2, 1)`
        : undefined,
  };

  // Portal to document.body so the modal escapes any `inert` ancestor —
  // the app-wide [data-modal-background] wrapper flips inert on the
  // sheet content while a modal is open, and an inline-mounted modal
  // (e.g. DatePickerModal opened from a row's date cell) would
  // otherwise inherit that inert and become un-tappable. The portal
  // also lifts the dialog out of the data-sheet-content subtree so
  // ActiveRowProvider's "block other buttons" rule never applies to
  // anything inside a modal.
  return createPortal(
    <div
      role={role}
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={shellRef}
        className={`${shellSize} rounded-t-lg bg-surface shadow-2xl sm:rounded-lg`}
        style={shellStyle}
        onTransitionEnd={() => setSettling(false)}
      >
        {/* Drag handle — only rendered in the mobile bottom-sheet
            layout (sm:hidden). Pulling it down past DISMISS_DISTANCE_PX
            (or flicking it) dismisses the modal; otherwise it snaps
            back. The desktop centered card relies on the X button,
            Escape, and backdrop click instead. */}
        <div
          aria-hidden
          className="flex w-full cursor-grab touch-none select-none justify-center pb-1 pt-2 active:cursor-grabbing sm:hidden"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => finishDrag(e, false)}
          onPointerCancel={(e) => finishDrag(e, true)}
        >
          <div className="h-1 w-10 rounded-full bg-line" />
        </div>
        <ModalLabelContext.Provider value={{ id: labelledBy }}>
          {children}
        </ModalLabelContext.Provider>
      </div>
    </div>,
    document.body,
  );
}

type HeaderProps = {
  title: React.ReactNode;
  onClose: () => void;
};

function Header({ title, onClose }: HeaderProps) {
  const ctx = useContext(ModalLabelContext);
  return (
    <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
      <h2
        id={ctx?.id}
        className="text-sm font-bold tracking-wide text-fg-bright"
      >
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
      >
        <X size={18} aria-hidden focusable={false} />
      </button>
    </header>
  );
}

type BodyProps = {
  children: React.ReactNode;
  className?: string;
};

function Body({ children, className = "" }: BodyProps) {
  return (
    <div
      className={`flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

type FooterProps = {
  children: React.ReactNode;
  className?: string;
};

function Footer({ children, className = "" }: FooterProps) {
  return (
    <footer
      className={`flex items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3 ${className}`.trim()}
    >
      {children}
    </footer>
  );
}

Modal.Header = Header;
Modal.Body = Body;
Modal.Footer = Footer;
