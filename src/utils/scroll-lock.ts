import { useEffect } from "react";

// Reference-counted modal lifecycle hook. Stacked modals (e.g. a
// confirm dialog opened from inside another modal) share the same
// counter so the page only "unlocks" after the last one closes.
//
// While the lock is held two things happen:
//
// 1. Page scroll is frozen by setting `overflow: hidden` on <body>,
//    so the background doesn't drift under the modal on mobile.
// 2. Every element marked with `[data-modal-background]` is set
//    `inert`, which removes its subtree from the tab order and
//    swallows pointer / mouse events. Without this the 50%-opacity
//    backdrop visually dims the page but keyboard focus can still
//    Tab into background buttons and a stray click on the header
//    icons (or the bottom sheet-tab bar, which lifts itself with
//    `pointer-events-auto`) can still trigger them.
//
// iOS Safari and iOS standalone PWAs do NOT preserve the document's
// scroll position across `body.overflow = "hidden"` toggles the same
// way Chrome and Firefox do. The scroll position can snap to 0 the
// moment we hide overflow — invisible while the modal covers the
// page, but exposed as a "page jumped to top after Save" the instant
// the modal closes. We snapshot `scrollY` at acquire time and call
// `window.scrollTo` on release if it drifted, which lands us back at
// the exact resting point the user opened the modal from. Chrome
// keeps the same scrollY across the toggle, so the restore is a
// no-op there.
let lockCount = 0;
let previousOverflow: string | null = null;
let previousScrollY: number | null = null;

function setBackgroundInert(inert: boolean): void {
  for (const el of document.querySelectorAll<HTMLElement>(
    "[data-modal-background]",
  )) {
    el.inert = inert;
  }
}

function acquire() {
  if (lockCount === 0) {
    previousScrollY = window.scrollY;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setBackgroundInert(true);
  }
  lockCount += 1;
}

function release() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow ?? "";
    previousOverflow = null;
    setBackgroundInert(false);
    if (previousScrollY !== null && window.scrollY !== previousScrollY) {
      // `behavior: "auto"` is the default, but spell it out so a
      // future global `scroll-behavior: smooth` CSS rule can't slip
      // an animation between the user pressing Save and the page
      // landing where they left it.
      window.scrollTo({ top: previousScrollY, left: 0, behavior: "auto" });
    }
    previousScrollY = null;
  }
}

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    acquire();
    return release;
  }, [active]);
}
