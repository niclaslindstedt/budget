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
let lockCount = 0;
let previousOverflow: string | null = null;

function setBackgroundInert(inert: boolean): void {
  for (const el of document.querySelectorAll<HTMLElement>(
    "[data-modal-background]",
  )) {
    el.inert = inert;
  }
}

function acquire() {
  if (lockCount === 0) {
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
  }
}

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    acquire();
    return release;
  }, [active]);
}
