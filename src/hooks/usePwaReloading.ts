import { useSyncExternalStore } from "react";

// Tracks whether a PWA reload is in flight. Flipped on by
// `UpdateToast` the moment the user clicks Reload — read by
// `HeaderStar` so the achievement star renders inactive during the
// reload window. Without this, the brief gap between the click and
// the actual `window.location.reload()` (plus the SW activation
// hop) lets the filled star sit on screen, only to flip empty once
// the new build mounts; the switch reads as the star "going away".
//
// The flag never resets in-process: the only thing that clears it
// is the actual page reload, which discards the entire JS heap and
// re-mounts everything with `reloading = false`.

let reloading = false;
const listeners = new Set<() => void>();

export function markPwaReloading(): void {
  if (reloading) return;
  reloading = true;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return reloading;
}

export function usePwaReloading(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
