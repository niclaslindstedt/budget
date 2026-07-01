import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X } from "lucide-react";

import {
  useEscapeKey,
  useIsMobile,
  useVisualViewportHeight,
  useVisualViewportOffsetTop,
} from "../hooks";
import { useT } from "../i18n";
import { useBodyScrollLock } from "../utils/scroll-lock";

// Tabbable / focusable elements inside the modal. Mirrors the standard
// selector used by every focus-trap library — `[tabindex="-1"]` is
// explicitly excluded so programmatically-focused-only scroll regions
// (the SettingsModal panel wrapper, for instance) don't trap Tab.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusables(root: HTMLElement | null): HTMLElement[] {
  if (root === null) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

// Input types that don't open the on-screen keyboard — focusing them
// shouldn't scroll the modal body (they'd otherwise yank an already-
// visible toggle around for no reason). Everything else (text, decimal,
// numeric, email, date, …) plus <textarea> and contenteditable does.
const NON_KEYBOARD_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "file",
  "range",
  "color",
  "image",
  "hidden",
]);

function opensSoftKeyboard(el: HTMLElement): boolean {
  if (el.tagName === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  if (el.tagName === "INPUT") {
    return !NON_KEYBOARD_INPUT_TYPES.has((el as HTMLInputElement).type);
  }
  return false;
}

// Shared shell for every modal dialog in the app. Owns:
//
// * The overlay — opaque `bg-surface` filling the screen on mobile
//   (true sub-screen layout, every pixel goes to content), translucent
//   black backdrop with a centered card on desktop. Clicking the
//   backdrop dismisses; on mobile the modal covers the whole viewport
//   so there's nothing exposed to click anyway. When `centered` is
//   true the modal renders as a translucent-backdrop centered card on
//   every viewport size — see below.
//
// * The bordered surface shell — edge-to-edge `100svh` on mobile,
//   capped to `min(95svh, viewport - 2rem)` for the desktop card.
//
// * Keyboard dismissal (Escape) and body scroll lock.
//
// * Visible-height handling — the fullscreen-on-mobile shell pins to the
//   live `useVisualViewportHeight()` rather than a CSS viewport unit, so
//   its footer can't slide off the bottom edge. This covers both the soft
//   keyboard (iOS shifts the visual viewport up to fit it, so a `100svh`
//   shell would hide its footer under the keyboard) and the iOS 26
//   standalone PWA case where `100vh` overshoots the visible screen. The
//   handling is only wired for the default fullscreen layout — `centered`
//   modals float in the middle and keep their own CSS height cap.
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

// Shared handle on the scrolling `Modal.Body` element so `Modal.Header`
// can scroll it back to the top when the header is tapped (an iOS
// status-bar-tap-style affordance — handy for the long, read-only
// viewers like BudgetViewerModal / HistoryModal). The root owns the ref
// and the Body registers its scroll element into it; null when the modal
// has no scrolling body, in which case the header tap is a no-op.
const ModalBodyScrollContext =
  createContext<React.MutableRefObject<HTMLDivElement | null> | null>(null);

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
  // When true, the modal renders as a centered card on every viewport
  // size (mobile + desktop) instead of filling the screen on mobile.
  // Use this for modals that don't open the soft keyboard — pickers,
  // confirmations, read-only info — where the dead space under a short
  // fullscreen modal looks worse than a centered card. The rule of
  // thumb is: if the modal contains no text inputs (`<input type="text"`,
  // `inputMode="decimal"`, `<textarea>`, `contentEditable`, etc.) it
  // can be `centered`. Modals with such inputs must stay default so the
  // visible-height pin (`useVisualViewportHeight`) keeps the footer above
  // the keyboard.
  centered?: boolean;
  // When true, the desktop card pins itself to a stable `95svh`
  // (matching the cap used by the default branch) instead of letting
  // its height respond to content. Mobile keeps the usual `100svh`
  // fullscreen shell. Use this for tabbed modals where switching tabs
  // would otherwise make the whole card jump as content grows or
  // shrinks — e.g. SettingsModal, whose tallest tabs would otherwise
  // scroll beyond the visible card.
  fixedHeight?: boolean;
  // When true, focus the first body focusable synchronously on open
  // (in a layout effect, within the same task as the discrete tap that
  // flipped `open`) instead of after a frame. This keeps the focus
  // attributed to the user gesture so iOS opens the soft keyboard for a
  // text input — the default requestAnimationFrame-deferred focus lands
  // the caret (the field shows focus) but iOS suppresses the keyboard
  // because the focus is no longer tied to the originating tap. Set this
  // on modals whose first action is typing into a text field that should
  // be ready on open (the transfer-search modal). Leave it off for
  // modals whose first focusable isn't a keyboard-opening input —
  // focusing a button a frame later is fine and the deferred path keeps
  // the portal settled first.
  focusOnOpen?: boolean;
  children: React.ReactNode;
};

export function Modal({
  open,
  onClose,
  labelledBy,
  role = "dialog",
  size = "max-w-lg",
  scrollableBody = true,
  centered = false,
  fixedHeight = false,
  focusOnOpen = false,
  children,
}: RootProps) {
  useBodyScrollLock(open);
  useEscapeKey(open, onClose);

  const isMobile = useIsMobile();
  const visualViewportHeight = useVisualViewportHeight();
  const visualViewportOffsetTop = useVisualViewportOffsetTop();

  const shellRef = useRef<HTMLDivElement | null>(null);
  // Registered by `Modal.Body` so `Modal.Header` can scroll it to the
  // top on click. Lives on the root so it's shared across the header /
  // body siblings without the caller threading a ref between them.
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  // The element that owned focus before the modal opened — restored
  // on close so tab order continues from where the user left it
  // (e.g. focus returns to the row's action button after the
  // BudgetEditEntryFullModal closes).
  const openerRef = useRef<HTMLElement | null>(null);

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

  // Focus management — on every open / close transition:
  //  1. Capture the opener (the button or input that had focus before
  //     the modal showed up) so we can hand control back when it
  //     closes.
  //  2. Move focus into the modal shell, preferring the first focusable
  //     inside the body (e.g. a form input) but falling back to the
  //     shell itself (`tabIndex={-1}`) so Tab still walks into the modal
  //     even if it has no focusable content. The timing of this step is
  //     what splits into two effects below: deferred for most modals,
  //     synchronous for `focusOnOpen` ones (iOS soft-keyboard handling).
  //  3. On close, restore focus to the opener if it's still in the
  //     document.
  // Move focus to the first focusable inside the modal body. Skips the
  // header close button — it's a dismiss control, not the user's likely
  // first action — falling back to close-button → shell.
  const focusInitial = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const focusables = getFocusables(shell);
    const body = shell.querySelector<HTMLElement>("[data-modal-body]");
    const bodyFocusables = body ? getFocusables(body) : [];
    const target = bodyFocusables[0] ?? focusables[0] ?? shell;
    // `preventScroll: true` so moving focus into the modal never drags
    // the body to reveal the target. Matters when the first focusable
    // sits off-screen — e.g. a row's swipe-revealed action button,
    // parked off the right edge of an `overflow: hidden` row: a plain
    // `focus()` scrolls that row sideways to surface the button, which
    // reads as a phantom half-swipe on the first row. Mirrors the same
    // guard on `restoreOpener` below.
    target.focus({ preventScroll: true });
  }, []);

  const restoreOpener = useCallback(() => {
    const opener = openerRef.current;
    if (opener && document.contains(opener)) {
      // `preventScroll: true` because we don't want the browser's
      // default focus-into-view behaviour to fight the scroll-position
      // restore `useBodyScrollLock` does on release.
      opener.focus({ preventScroll: true });
    }
  }, []);

  // Default (deferred) focus-into-modal path — every modal that doesn't
  // opt into `focusOnOpen`. Waits a frame for the portal to settle before
  // reaching for the first focusable, then restores the opener on close.
  useEffect(() => {
    if (!open || focusOnOpen) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(focusInitial);
    return () => {
      cancelAnimationFrame(raf);
      restoreOpener();
    };
  }, [open, focusOnOpen, focusInitial, restoreOpener]);

  // iOS-friendly synchronous focus path — `focusOnOpen` modals. A layout
  // effect fires within the same task as the discrete tap that flipped
  // `open`, so the focus stays attributed to the user gesture and iOS is
  // allowed to open the soft keyboard. The opener is captured here
  // before focus moves (still the trigger at this point) and restored on
  // close. See the `focusOnOpen` prop docs for why the deferred path above
  // can't be used for a text input that should type-ready on open.
  useLayoutEffect(() => {
    if (!open || !focusOnOpen) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    focusInitial();
    return restoreOpener;
  }, [open, focusOnOpen, focusInitial, restoreOpener]);

  // Keep the focused text field above the soft keyboard. When a
  // keyboard-opening input inside the body gains focus the visual
  // viewport shrinks (see `useVisualViewportHeight`) and the shell
  // height follows it — but the browser won't reliably scroll a field
  // inside the body's own scroll container into the shortened visible
  // band, especially with the fixed + translated shell on iOS, so the
  // field can end up hidden behind the keyboard. We scroll it into view
  // explicitly: once on focus, and again on every visible-viewport
  // change while it stays focused (the keyboard finishing its open
  // animation is one such change). `block: "nearest"` only moves a field
  // that's actually clipped, so it never disturbs an already-visible top
  // field on open or jumps the body while tabbing on desktop.
  const focusedFieldRef = useRef<HTMLElement | null>(null);
  const scrollFocusedFieldIntoView = useCallback(() => {
    const el = focusedFieldRef.current;
    if (!el || document.activeElement !== el || !document.contains(el)) return;
    el.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, []);

  useEffect(() => {
    if (!open) return;
    const shell = shellRef.current;
    if (!shell) return;
    function onFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      if (target && opensSoftKeyboard(target)) {
        focusedFieldRef.current = target;
        // Defer a frame so any viewport shift the focus kicks off has
        // landed before we measure and scroll.
        requestAnimationFrame(scrollFocusedFieldIntoView);
      }
    }
    function onFocusOut(e: FocusEvent) {
      if (focusedFieldRef.current === e.target) focusedFieldRef.current = null;
    }
    shell.addEventListener("focusin", onFocusIn);
    shell.addEventListener("focusout", onFocusOut);
    return () => {
      shell.removeEventListener("focusin", onFocusIn);
      shell.removeEventListener("focusout", onFocusOut);
    };
  }, [open, scrollFocusedFieldIntoView]);

  // Re-run the scroll whenever the visible band changes — the soft
  // keyboard opening / resizing — so a field focused while the keyboard
  // was closed is pulled clear of it once it animates in.
  useEffect(() => {
    if (!open) return;
    scrollFocusedFieldIntoView();
  }, [
    open,
    visualViewportHeight,
    visualViewportOffsetTop,
    scrollFocusedFieldIntoView,
  ]);

  // Focus trap — cycles Tab / Shift+Tab inside the shell so keyboard
  // users can't accidentally Tab into the inert background. Without
  // this, Tab past the last focusable lands on the next item in DOM
  // order outside the portal (somewhere in the sheet view), at which
  // point focus is lost behind the modal.
  function trapTab(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const shell = shellRef.current;
    if (!shell) return;
    const focusables = getFocusables(shell);
    if (focusables.length === 0) {
      e.preventDefault();
      shell.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !shell.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  // Always flex-col + overflow-hidden on mobile so Footer is pinned
  // by flex layout and Body owns its own scroll. Desktop drops the
  // 100svh constraint and (when scrollableBody) caps the height. The
  // `centered` branch uses the desktop layout on every viewport size.
  // When `fixedHeight` is set, desktop pins the card to a stable
  // `95svh` (leaves a margin around the card, matches the cap used by
  // the other branches) so switching tabs never resizes the card and
  // the footer always stays inside the viewport. Mobile keeps the
  // full `100svh` shell. Note: when fixedHeight is true we drop the
  // `sm:h-auto` from the mobile/desktop layout because Tailwind v4
  // emits named utilities AFTER arbitrary ones, so `sm:h-auto` would
  // otherwise win over `sm:h-[95svh]` and let the modal grow with its
  // content (notably the tall Categories tab) past the visible
  // viewport.
  const desktopHeightClass = fixedHeight
    ? "sm:h-[95svh]"
    : scrollableBody
      ? "sm:max-h-[min(95svh,calc(100svh-2rem))]"
      : "sm:max-h-[95svh]";
  const centeredHeightClass = fixedHeight
    ? "h-[95svh]"
    : scrollableBody
      ? "max-h-[min(95svh,calc(100svh-2rem))]"
      : "max-h-[95svh]";
  const mobileToDesktopHeight = fixedHeight
    ? `h-[100svh] ${desktopHeightClass}`
    : `h-[100svh] sm:h-auto ${desktopHeightClass}`;
  const shellLayout = centered
    ? `flex w-full ${size} flex-col overflow-hidden ${centeredHeightClass}`
    : `flex w-full ${size} flex-col overflow-hidden ${mobileToDesktopHeight}`;

  // Pin the mobile fullscreen shell to the live `visualViewport.height`
  // — the real visible band — instead of letting CSS height it. This
  // covers two failure modes the static `100vh` shell (the
  // `[data-modal-shell="fullscreen"]` rule, used in the iOS 26
  // standalone PWA) could not:
  //
  //  * Resting overshoot — on iPhone 15/16 Pro PWAs `100vh` resolves
  //    TALLER than the visible screen, so the pinned footer (Delete /
  //    Cancel / Save) slid past the bottom edge into the home-indicator
  //    strip, leaving the buttons cut off below a dead black band. Plain
  //    `100vh` was chosen (#378) because `svh` / `dvh` were clipped too
  //    SHORT at cold launch, but it overshoots on current hardware.
  //  * Keyboard open — the visual viewport shrinks to the band above the
  //    soft keyboard, and `visualViewport.height` already reflects that,
  //    so the footer rides above the keyboard with no separate inset
  //    math (the earlier `calc(100vh - keyboardInset)` overshot in iOS
  //    Safari, where `100vh` is the toolbar-hidden large viewport).
  //
  // `visualViewport.height` is by definition never taller than what's on
  // screen, so the footer can't overshoot; `min(100vh, …)` is a belt-and
  // -suspenders cap against a transient reading larger than the screen.
  // Desktop / SSR report `0` (guarded below) and keep the CSS height.
  // `centered` modals float in the middle and are unaffected by the
  // bottom edge, so they opt out and keep their own height cap.
  //
  // The `translateY(offsetTop)` is what keeps the shell tracking the
  // visible band when iOS shifts the visual viewport up to clear the
  // soft keyboard. The shell is anchored to the LAYOUT viewport (`fixed
  // inset-0`), which doesn't move with the keyboard, so pinning only the
  // height would leave the shell's top above the visible band (its header
  // scrolls off-screen) and its footer floating `offsetTop` pixels above
  // the keyboard — the dead-space gap. Translating down by `offsetTop`
  // realigns the shell's top with the visible top, so its pinned footer
  // lands right on the keyboard. `offsetTop` is `0` when the keyboard is
  // closed (or the field already sits above it), so this is a no-op in
  // the common case.
  const shellStyle: React.CSSProperties | undefined =
    !centered && isMobile && visualViewportHeight > 0
      ? {
          height: `min(100vh, ${visualViewportHeight}px)`,
          transform:
            visualViewportOffsetTop > 0
              ? `translateY(${visualViewportOffsetTop}px)`
              : undefined,
        }
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
  const overlayClass = centered
    ? "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    : "fixed inset-0 z-50 flex justify-center bg-surface sm:items-center sm:bg-black/50 sm:p-4";

  const shellChrome = centered
    ? "bg-surface rounded-lg shadow-2xl"
    : "bg-surface sm:rounded-lg sm:shadow-2xl";

  // `data-modal-overlay` / `data-modal-shell` mark the standalone-mode
  // workaround targets in `styles.css`. iOS 26 PWAs clip both `fixed;
  // inset: 0` and `100svh` to a too-short visualViewport, so the
  // standalone-mode rules repin them to `var(--screen-h-px)` (the
  // correct `window.innerHeight`). `"fullscreen"` is the variant that
  // takes the workaround — `"centered"` cards float in the middle and
  // are unaffected by the bottom clip.
  const overlayVariant = centered ? "centered" : "fullscreen";

  return createPortal(
    <div
      role={role}
      aria-modal="true"
      aria-labelledby={labelledBy}
      data-active-portal
      data-modal-overlay={overlayVariant}
      className={overlayClass}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={trapTab}
    >
      <div
        ref={shellRef}
        data-modal-shell={overlayVariant}
        // `tabIndex={-1}` lets the shell receive focus as a fallback
        // when the modal has no focusable children — the trap
        // otherwise leaves keyboard users stranded.
        tabIndex={-1}
        className={`${shellLayout} ${shellChrome}`}
        style={shellStyle}
      >
        <ModalLabelContext.Provider value={{ id: labelledBy }}>
          <ModalBodyScrollContext.Provider value={bodyScrollRef}>
            {children}
          </ModalBodyScrollContext.Provider>
        </ModalLabelContext.Provider>
      </div>
    </div>,
    document.body,
  );
}

type HeaderProps = {
  title: React.ReactNode;
  // Optional leading glyph rendered before the title at the same baseline.
  // Pass a sized lucide icon (or any inline node) — e.g.
  // `<Pencil size={14} aria-hidden focusable={false} />`. The header wraps
  // it in an `inline-flex items-center gap-2` span with the `text-flag`
  // accent so every modal title has the same hairline of identity.
  icon?: React.ReactNode;
  // When set, a back button renders at the leading edge of the header
  // (before the title) and calls this instead of dismissing the modal.
  // Used for in-modal drill-downs that stay in the same dialog — e.g. the
  // changelog modal swapping to a feature-doc view and back. The back
  // button stops click propagation so it never doubles as scroll-to-top.
  onBack?: () => void;
  onClose: () => void;
};

function Header({ title, icon, onBack, onClose }: HeaderProps) {
  const ctx = useContext(ModalLabelContext);
  const bodyScrollRef = useContext(ModalBodyScrollContext);
  const t = useT();

  // Tapping the header scrolls the body back to the top — the same
  // affordance as tapping the iOS status bar. A no-op when there's no
  // scrolling body or it's already at the top. The close button stops
  // propagation so dismissing never doubles as a scroll.
  const scrollBodyToTop = useCallback(() => {
    const el = bodyScrollRef?.current;
    if (!el || el.scrollTop === 0) return;
    const reduceMotion =
      document.documentElement.getAttribute("data-reduce-motion") === "true";
    el.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, [bodyScrollRef]);
  // The padding-top is expressed as a Tailwind utility (not an inline
  // style) so the `@media (display-mode: standalone)` block in
  // `styles.css` can win the cascade and trim the extra `0.75rem` —
  // an inline style would beat any external CSS without `!important`.
  // Matches the `[data-app-header]` pattern: the gap above the title
  // collapses to just `env(safe-area-inset-top)` in standalone PWAs so
  // it lines up with the gap the Dynamic Island leaves above itself.
  return (
    // The header's `onClick` (scroll-to-top) is a pointer/touch-only
    // convenience, mirroring tapping the iOS status bar. Keyboard users
    // scroll the focused body natively, so the header deliberately stays
    // out of the tab order rather than becoming a focusable control —
    // there's no keyboard handler to pair with the click.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <header
      data-modal-header
      onClick={scrollBodyToTop}
      className="flex shrink-0 items-center justify-between border-b border-line bg-surface-3 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))]"
    >
      <h2
        id={ctx?.id}
        className="flex min-w-0 items-center gap-2 text-sm font-bold tracking-wide text-fg-bright"
      >
        {onBack ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBack();
            }}
            aria-label={t("common.back")}
            className="-ml-1 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <ChevronLeft size={20} aria-hidden focusable={false} />
          </button>
        ) : null}
        {icon ? (
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="inline-flex shrink-0 text-flag">{icon}</span>
            <span className="min-w-0 truncate">{title}</span>
          </span>
        ) : (
          <span className="min-w-0 truncate">{title}</span>
        )}
      </h2>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={t("common.close")}
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
  // Drop the default `px-3 py-3 sm:px-4 sm:py-4` so callers that own
  // their own padding (a flush table with a sticky `<thead>`, say) can
  // start their content at y=0 of the scroll container. Tailwind sorts
  // utilities by value in its emitted CSS, so a `px-0 py-0` passed via
  // `className` would lose the cascade to the defaults above — this
  // prop removes them at the source.
  noPadding?: boolean;
  // Expose the scrolling element to the caller. The body owns its own
  // overflow, so any IntersectionObserver tied to a sentinel inside
  // the body must pass this element as the observer's `root` —
  // observing against the viewport would never fire for clipped
  // sentinels.
  scrollRef?: React.Ref<HTMLDivElement>;
};

function Body({
  children,
  className = "",
  noPadding = false,
  scrollRef,
}: BodyProps) {
  const bodyScrollRef = useContext(ModalBodyScrollContext);
  // Register the scroll element with the root (so `Modal.Header` can
  // scroll-to-top) while still forwarding it to the caller's `scrollRef`
  // when one was supplied.
  const setScrollEl = useCallback(
    (el: HTMLDivElement | null) => {
      if (bodyScrollRef) bodyScrollRef.current = el;
      if (typeof scrollRef === "function") scrollRef(el);
      else if (scrollRef) {
        (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current =
          el;
      }
    },
    [bodyScrollRef, scrollRef],
  );
  const paddingClass = noPadding ? "" : "px-3 py-3 sm:px-4 sm:py-4";
  return (
    <div
      ref={setScrollEl}
      data-modal-body
      className={`flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${paddingClass} ${className}`
        .replace(/\s+/g, " ")
        .trim()}
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
  // Padding-bottom is a Tailwind utility (not inline) for the same
  // cascade reason as Header — keeps the standalone-mode override path
  // open if we ever need to tune the footer's footprint per display
  // mode. `env(safe-area-inset-bottom)` keeps the buttons above the
  // iOS home indicator on every viewport.
  return (
    <footer
      data-modal-footer
      className={`flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] ${className}`.trim()}
    >
      {children}
    </footer>
  );
}

Modal.Header = Header;
Modal.Body = Body;
Modal.Footer = Footer;
