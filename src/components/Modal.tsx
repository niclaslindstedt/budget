import { createContext, useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useEscapeKey, useIsMobile, useVirtualKeyboardInset } from "../hooks";
import { useBodyScrollLock } from "../utils/scroll-lock";

// Shared shell for every modal dialog in the app. Owns:
//
// * The overlay — opaque `bg-surface` filling the screen on mobile
//   (true sub-screen layout, every pixel goes to content), translucent
//   black backdrop with a centered card on desktop. Clicking the
//   backdrop dismisses; on mobile the modal covers the whole viewport
//   so there's nothing exposed to click anyway.
//
// * The bordered surface shell — edge-to-edge `100svh` on mobile,
//   capped to `min(95svh, viewport - 2rem)` for the desktop card.
//
// * Keyboard dismissal (Escape) and body scroll lock.
//
// * iOS soft-keyboard handling — on iOS the layout viewport stays the
//   full device height while the visual viewport shifts up to fit the
//   keyboard, so a `100svh` shell would have its footer hidden under
//   the keyboard. The shell shrinks by `useVirtualKeyboardInset()` on
//   mobile so the footer stays visible. Android Chrome with
//   `interactive-widget=resizes-content` (set in `index.html`) resizes
//   the layout viewport itself so the math collapses to ~0 there.
//
// Usage:
//
//     <Modal open={open} onClose={onClose} labelledBy="my-title">
//       <Modal.Header title="My modal" onClose={onClose} />
//       <Modal.Body>...</Modal.Body>
//       <Modal.Footer>...</Modal.Footer>
//     </Modal>

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
  // Tailwind max-width class. Defaults to `max-w-lg`. On mobile the
  // shell always fills the viewport horizontally — `size` only matters
  // on desktop. (On a typical phone the viewport is narrower than any
  // `max-w-*` we ship, so `w-full` wins anyway.)
  size?: string;
  // When true (default), the inner shell uses flex column +
  // `overflow-hidden` so `Modal.Body` is a scrolling middle and
  // `Modal.Footer` stays pinned to the bottom. Set to false for short
  // content where neither scrolling nor a sticky footer is desired
  // (e.g. ConfirmDialog, DatePickerModal).
  scrollableBody?: boolean;
  children: React.ReactNode;
};

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

  const isMobile = useIsMobile();
  const keyboardInset = useVirtualKeyboardInset();

  // Adds a class to <body> while any modal is open so the fixed
  // mobile chrome (sheet tabs, bulk action bar) can hide via CSS —
  // they otherwise hover above the modal during keyboard interactions
  // because the visual viewport shrinks but their `bottom: …` value
  // doesn't update.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("modal-open");
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [open]);

  if (!open) return null;

  // Always flex-col + overflow-hidden on mobile so Footer is pinned
  // by flex layout and Body owns its own scroll. Desktop drops the
  // 100svh constraint and (when scrollableBody) caps the height.
  const shellLayout = scrollableBody
    ? `flex h-[100svh] w-full ${size} flex-col overflow-hidden sm:h-auto sm:max-h-[min(95svh,calc(100svh-2rem))]`
    : `flex h-[100svh] w-full ${size} flex-col overflow-hidden sm:h-auto sm:max-h-[95svh]`;

  // On iOS the visual viewport shifts up to fit the keyboard but the
  // layout viewport (and therefore `100svh`) stays the same — the
  // shell's bottom ends up under the keyboard. Shrink the shell so
  // the footer rides above the keyboard. Desktop never needs this;
  // Android with `interactive-widget=resizes-content` reports an
  // inset of 0 (the layout viewport already shrunk for us).
  const shellStyle: React.CSSProperties | undefined =
    isMobile && keyboardInset > 0
      ? { height: `calc(100svh - ${keyboardInset}px)` }
      : undefined;

  // Portal to document.body so the modal escapes any `inert` ancestor —
  // the app-wide [data-modal-background] wrapper flips inert on the
  // sheet content while a modal is open, and an inline-mounted modal
  // (e.g. DatePickerModal opened from a row's date cell) would
  // otherwise inherit that inert and become un-tappable. The portal
  // also lifts the dialog out of the data-sheet-content subtree so
  // ActiveRowProvider's "block other buttons" rule never applies to
  // anything inside a modal.
  // `data-active-portal` opts the modal out of ActiveRowProvider's
  // document-level dismiss handler. A modal opened from inside a sheet
  // row (e.g. DatePickerModal from a date cell) leaves the row
  // registered as active for the lifetime of the modal; without the
  // marker, the very first pointerdown inside the portaled modal would
  // be treated as "outside the active row" and dismiss the row — which
  // closes the modal and swallows the trailing click, so the picker
  // never sees the tap on a date. Modals opened from outside a sheet
  // row have no registration to dismiss, so the marker is a no-op for
  // them.
  return createPortal(
    <div
      role={role}
      aria-modal="true"
      aria-labelledby={labelledBy}
      data-active-portal
      className="fixed inset-0 z-50 flex justify-center bg-surface sm:items-center sm:bg-black/50 sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`${shellLayout} bg-surface sm:rounded-lg sm:shadow-2xl`}
        style={shellStyle}
      >
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
    <header
      className="flex shrink-0 items-center justify-between border-b border-line bg-surface-3 px-4 py-3"
      style={{
        paddingTop: `calc(0.75rem + env(safe-area-inset-top))`,
      }}
    >
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
        className="-mr-1 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg sm:h-8 sm:w-8"
      >
        <X size={20} aria-hidden focusable={false} />
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
      className={`flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-4 sm:py-4 ${className}`.trim()}
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
      className={`flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 pt-3 ${className}`.trim()}
      style={{
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
      }}
    >
      {children}
    </footer>
  );
}

Modal.Header = Header;
Modal.Body = Body;
Modal.Footer = Footer;
