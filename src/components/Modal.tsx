import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useEscapeKey } from "../hooks";
import { useBodyScrollLock } from "../utils/scroll-lock";

// Shared shell for every modal dialog in the app. Owns the overlay
// (50% black backdrop + click-outside-to-close), the bordered surface
// shell (mobile bottom-sheet rounding, desktop centered card), the
// keyboard dismissal, and the body scroll lock.
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

  if (!open) return null;

  const shellSize = scrollableBody
    ? `flex max-h-[95vh] w-full ${size} flex-col overflow-hidden`
    : `w-full ${size}`;

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
        className={`${shellSize} rounded-t-lg bg-surface shadow-2xl sm:rounded-lg`}
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
