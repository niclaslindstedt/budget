import { useEffect } from "react";

// Workaround for iOS 26 standalone-PWA viewport-coherence bug.
//
// WebKit #297779 / #301994 / Apple devforums #800125: in an
// installed iOS 26 PWA the compositor pins fixed elements to a
// stale pre-Liquid-Glass viewport rectangle that's 100–200 px
// taller than the actually-rendered visual viewport. Every other
// signal we'd normally measure against — `window.innerHeight`,
// `100vh` / `100dvh` / `100svh`, `env(safe-area-inset-bottom)`
// — is read from the SAME poisoned rectangle, which is why our
// earlier `translate-by-(innerHeight - vv.height)` and
// `top: var(--screen-h-px)` attempts didn't help: those inputs
// were already wrong on first paint.
//
// `visualViewport.height` + `visualViewport.offsetTop` ARE the
// rendered visible area. iOS just doesn't reconcile the compositor
// with them until something "wakes" it — typically a real scroll,
// an orientation change, or (per the fozzedout iPhone PWA gist) a
// mutation of the `<meta name="viewport">` `viewport-fit` token.
//
// This module:
//
//   - `wakeViewportCompositor()` toggles the viewport meta from
//     `viewport-fit=cover` → `viewport-fit=auto` → `cover` on the
//     next two animation frames. That's the documented trick to
//     force iOS 26 to reconcile without a user-driven scroll.
//   - `syncViewportVars()` writes `visualViewport`-derived numbers
//     to `--vv-bottom` / `--vv-height` / `--vv-top` on `<html>`.
//     Pure DOM mutation; safe to call before React mounts so the
//     very first paint reads the right values.
//   - `useVisualViewportOffset()` calls both on mount and re-runs
//     `syncViewportVars()` on `visualViewport.resize` / `.scroll`,
//     `window.resize`, `orientationchange`, and `pageshow` (so a
//     PWA resumed from background re-measures too). Mount once
//     near the root of the tree.
//
// CSS in `src/styles.css` then drives the standalone-mode bottom
// bar's position from `--vv-bottom` (the actual rendered viewport
// bottom in layout-viewport pixels) instead of `bottom: 0` (which
// resolves against the stale rectangle).

export function computeViewportBottomOffset(input: {
  innerHeight: number;
  viewportHeight: number;
  viewportOffsetTop: number;
}): number {
  // Same `>= innerHeight - 1` clamp as `computeKeyboardInset` —
  // guards against sub-pixel rounding noise reporting a fake 1px
  // clip on Android Chrome with `interactive-widget=resizes-content`.
  if (input.viewportHeight >= input.innerHeight - 1) return 0;
  return Math.max(
    0,
    input.innerHeight - input.viewportHeight - input.viewportOffsetTop,
  );
}

export function syncViewportVars(): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const vv = window.visualViewport;
  // `vv.height + vv.offsetTop` is the y-coordinate (in layout
  // viewport pixels) of the rendered visible area's bottom edge.
  // When iOS lies about innerHeight, this pair is still the truth.
  // Fall back to innerHeight when the API isn't available (old
  // browsers, SSR-rendered HTML before hydration).
  const height = vv ? vv.height : window.innerHeight;
  const offsetTop = vv ? vv.offsetTop : 0;
  const bottom = Math.round(height + offsetTop);
  root.style.setProperty("--vv-height", `${Math.round(height)}px`);
  root.style.setProperty("--vv-top", `${Math.round(offsetTop)}px`);
  root.style.setProperty("--vv-bottom", `${bottom}px`);
}

function wakeViewportCompositor(): void {
  if (typeof window === "undefined") return;
  if (typeof document === "undefined") return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const original = meta.getAttribute("content");
  if (!original || !original.includes("viewport-fit=cover")) return;
  // Toggle viewport-fit on the meta tag across two animation
  // frames. iOS 26's compositor treats this as a layout-invalidating
  // event, which is what reconciles the stale rectangle. `cover`
  // is the project's normal setting (extends behind the home
  // indicator); the brief `auto` pulse is invisible to the user.
  meta.setAttribute(
    "content",
    original.replace("viewport-fit=cover", "viewport-fit=auto"),
  );
  requestAnimationFrame(() => {
    meta.setAttribute("content", original);
    requestAnimationFrame(syncViewportVars);
  });
}

export function bootViewportWorkaround(): void {
  syncViewportVars();
  wakeViewportCompositor();
  // Belt-and-suspenders: also do a no-op `scrollBy(0, 1)` /
  // `scrollBy(0, -1)` round-trip on the next frame. `scrollTo(0,
  // 0)` is a no-op at the top so it dispatches nothing, but
  // `scrollBy` always fires — and a 1px scroll is the other
  // documented way to nudge iOS into recomputing the visual
  // viewport on first paint (iifx.dev). The combined toggle +
  // scrollBy is what the threads converge on as the most-reliable
  // wake. Re-measure on a few timeouts too, in case the compositor
  // takes a few hundred ms to settle on a cold launch.
  requestAnimationFrame(() => {
    window.scrollBy(0, 1);
    window.scrollBy(0, -1);
    syncViewportVars();
  });
  for (const delay of [100, 300, 600, 1200]) {
    setTimeout(syncViewportVars, delay);
  }
}

export function useVisualViewportOffset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    syncViewportVars();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", syncViewportVars);
      vv.addEventListener("scroll", syncViewportVars);
    }
    window.addEventListener("resize", syncViewportVars);
    window.addEventListener("orientationchange", () => {
      // Give iOS a beat to settle the rotation before re-measuring.
      setTimeout(syncViewportVars, 300);
    });
    // `pageshow` fires when a PWA is resumed from a backgrounded
    // state (the BFCache restore path). Without this the bar can
    // get stuck against a stale `--vv-bottom` measured before the
    // app was suspended.
    window.addEventListener("pageshow", syncViewportVars);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", syncViewportVars);
        vv.removeEventListener("scroll", syncViewportVars);
      }
      window.removeEventListener("resize", syncViewportVars);
      window.removeEventListener("pageshow", syncViewportVars);
      // The orientation handler closes over the timeout, so we
      // can't symmetrically remove it without storing a reference.
      // Leaving the listener attached for the page's lifetime is
      // harmless — the hook is mounted in `LanguageRoot` which
      // never unmounts in practice.
    };
  }, []);
}
