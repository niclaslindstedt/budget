import { useCallback, useEffect, useRef } from "react";

import { unlock } from "../../../data/achievements";
import type { Action } from "../../../data/reducer";
import { resolveSheetSlug, sheetSlug } from "../../../data/sheet-routing";
import type { Sheet, SheetType } from "../../../data/types";

type Params = {
  sheets: readonly Sheet[];
  activeSheetId: string | null;
  dispatch: (action: Action) => void;
  // Open the new-sheet modal pre-selected to `type`. Called when a URL
  // addresses a sheet type that has no sheet at the requested ordinal
  // yet (e.g. someone was linked to `/salary` before a salary sheet
  // exists).
  onOpenNewSheet: (type?: SheetType) => void;
  // False while the storage backend is still loading the user's data.
  // Until it flips true, `sheets` is the placeholder `freshUserData()`
  // seed (a lone default budget sheet), not the persisted set — so a
  // deep link to `/cars` would resolve against sheets that don't exist
  // yet and wrongly open the new-sheet modal. The one-shot deep-link
  // consumption is held until the real data has loaded.
  ready: boolean;
};

// Vite's `base` — "/" in production, "/preview/" or "/branch/" in the
// non-production slots — always ends with a slash. The sheet slug is
// appended straight onto it (`/preview/` + `budget` → `/preview/budget`).
const BASE = import.meta.env.BASE_URL || "/";

// Strip a trailing slash so `/preview/budget/` and `/preview/budget`
// compare equal. The bare base ("/") collapses to "" — the app root.
function normalizePath(path: string): string {
  return path.replace(/\/+$/, "");
}

// Reflect the active sheet into the address bar and consume deep links,
// so the URL always names the current sheet (`/budget`, `/budget-2`, …)
// and the browser Back / Forward buttons walk sheet history:
//
//   - On first mount the URL wins: a slug that resolves to a sheet
//     selects it; a valid type with no sheet yet opens the new-sheet
//     modal pre-selected to that type; anything else (app root, a stale
//     or unknown path) is rewritten to the active sheet's slug.
//   - Afterwards the active sheet wins: switching sheets pushes a new
//     history entry (so Back returns to the previous sheet); a slug that
//     changes for a non-navigation reason (a reorder shifting an
//     ordinal) replaces in place instead of stacking a bogus entry.
//   - Back / Forward (popstate) resolves the restored URL to a sheet and
//     selects it without pushing again.
//
// OAuth round-trips (`?code=…`) are left completely alone — the cloud
// auth hook in `App.tsx` owns that query and cleans it up itself, so we
// skip every URL write while those params are present.
export function useSheetUrlSync({
  sheets,
  activeSheetId,
  dispatch,
  onOpenNewSheet,
  ready,
}: Params): void {
  // Latest values for the popstate listener, which is registered once
  // but must always act on current sheets / selection.
  const latest = useRef({ sheets, activeSheetId, onOpenNewSheet, ready });
  latest.current = { sheets, activeSheetId, onOpenNewSheet, ready };

  const didInit = useRef(false);
  // Set when we drive the selection ourselves (deep link on mount, or a
  // popstate restore) so the reflect effect doesn't push the URL we just
  // navigated to back onto the history stack.
  const skipNextPush = useRef(false);
  const prevActiveId = useRef<string | null>(activeSheetId);

  // The slug portion of the current location, with the base and any
  // trailing slash stripped. "" at the app root.
  const currentSlug = useCallback((): string => {
    let path = window.location.pathname;
    if (path.startsWith(BASE)) path = path.slice(BASE.length);
    else path = path.replace(/^\//, "");
    return path.replace(/\/+$/, "");
  }, []);

  // An OAuth callback is mid-flight — the cloud auth hook reads and then
  // clears `?code=` / `?state=` / `?error=`, so we must not touch the
  // URL until it has.
  const oauthInFlight = useCallback((): boolean => {
    return /[?&](code|state|error)=/.test(window.location.search);
  }, []);

  // Back / Forward: resolve the restored URL and mirror it into the
  // selection. Registered once; reads live state through `latest`.
  useEffect(() => {
    function onPopState() {
      if (oauthInFlight()) return;
      const {
        sheets: liveSheets,
        activeSheetId: liveActive,
        onOpenNewSheet: liveOpenNew,
        ready: liveReady,
      } = latest.current;
      // Data still loading — `liveSheets` is the placeholder seed, so
      // resolving a restored URL against it could open the new-sheet
      // modal for a sheet that does exist. The reflect effect replays
      // the URL once the load completes.
      if (!liveReady) return;
      const slug = currentSlug();
      if (!slug) return;
      const resolved = resolveSheetSlug(liveSheets, slug);
      if (!resolved) return;
      if (resolved.sheet) {
        if (resolved.sheet.id !== liveActive) {
          skipNextPush.current = true;
          unlock("deepLinker");
          dispatch({ type: "selectSheet", sheetId: resolved.sheet.id });
        }
      } else {
        liveOpenNew(resolved.type);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [currentSlug, oauthInFlight, dispatch]);

  // Keep the URL and the active sheet in step in both directions.
  useEffect(() => {
    if (oauthInFlight()) return;
    // Hold everything — deep-link consumption and URL reflection — until
    // the persisted data has loaded. Running against the placeholder
    // seed would latch `didInit` on the wrong sheet set. `ready` is an
    // effect dependency, so this re-runs the moment the load completes.
    if (!ready) return;

    const slug = sheetSlug(sheets, activeSheetId);
    if (!slug) return;
    const targetPath = normalizePath(BASE + slug);
    const herePath = normalizePath(window.location.pathname);
    // Preserve any (non-OAuth) query string / hash the app might carry.
    const suffix = window.location.search + window.location.hash;

    const finish = () => {
      prevActiveId.current = activeSheetId;
    };

    if (!didInit.current) {
      didInit.current = true;
      const urlSlug = currentSlug();
      const resolved = urlSlug ? resolveSheetSlug(sheets, urlSlug) : null;
      if (resolved?.sheet) {
        // Deep link to an existing sheet — select it; the URL already
        // matches, so suppress the push the resulting change would make.
        if (resolved.sheet.id !== activeSheetId) {
          skipNextPush.current = true;
          unlock("deepLinker");
          dispatch({ type: "selectSheet", sheetId: resolved.sheet.id });
        }
        return finish();
      }
      if (resolved && !resolved.sheet) {
        // Valid type, no sheet at that ordinal yet — offer to create it,
        // leaving the deep-link URL in place so creating the sheet
        // reconciles it.
        onOpenNewSheet(resolved.type);
        return finish();
      }
      // App root, or a stale / unknown path: reflect the active sheet
      // without stacking a history entry over the entry page.
      if (herePath !== targetPath) {
        window.history.replaceState(
          window.history.state,
          "",
          targetPath + suffix,
        );
      }
      return finish();
    }

    if (skipNextPush.current) {
      skipNextPush.current = false;
      return finish();
    }

    if (herePath !== targetPath) {
      // A real sheet switch stacks a Back target; a slug that shifted for
      // another reason (reorder) just corrects the URL in place.
      if (prevActiveId.current !== activeSheetId) {
        window.history.pushState(window.history.state, "", targetPath + suffix);
      } else {
        window.history.replaceState(
          window.history.state,
          "",
          targetPath + suffix,
        );
      }
    }
    return finish();
  }, [
    sheets,
    activeSheetId,
    currentSlug,
    oauthInFlight,
    dispatch,
    onOpenNewSheet,
    ready,
  ]);
}
