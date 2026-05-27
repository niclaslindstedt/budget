// Document-level DOM-query helpers used by gesture hooks that listen on
// `document` (usePullToRefresh, useSheetSwipe). These ask "is there an
// open Modal / FloatingPanel anywhere on the page?" — distinct from the
// per-target `target.closest('[data-active-portal]')` check in
// useSheetSwipe's `isOptedOut`, which asks "did the touch start inside
// one?" Both questions exist; only the document-wide one is shared.

export function hasOpenModal(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

// FloatingPanel (TypePicker, CategoryPicker, BackendPicker, …) marks
// its portalled root + dismiss backdrop with `data-active-portal`.
// While one is open the user is interacting with a popover whose own
// scroll container sits over the page, so a downward drag inside it
// is "scroll up in the list", not "pull the page". Without this gate
// a document-level listener arms at scrollY=0 and the resulting pull
// fires onRefresh when the user lifts their finger.
export function hasOpenFloatingPanel(): boolean {
  return document.querySelector("[data-active-portal]") !== null;
}
