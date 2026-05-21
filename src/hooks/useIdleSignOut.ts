import { useCallback, useEffect, useRef, useState } from "react";

import type { StoredUser } from "../data/types";
import { saveSession } from "../storage/session";

type UseIdleSignOutInput = {
  user: StoredUser;
  // The active user's password — re-stamped into `sessionStorage`
  // with the user's chosen TTL on each tick so a reload mid-session
  // inherits the rolling deadline.
  password: string;
  // Caller computes from `settings.sessionTimeoutMinutes * 60_000`
  // so the hook stays decoupled from the full Settings shape.
  ttlMs: number;
  onSignOut: () => void;
};

type UseIdleSignOutResult = {
  warningSecondsLeft: number | null;
  onStaySignedIn: () => void;
};

// Idle-tracked sign-out. Every user input bumps `lastActivityRef`;
// a 1 s tick decides whether to surface the "about to sign out"
// warning, sign the user out, or just re-stamp sessionStorage so a
// reload mid-session inherits the rolling deadline. The save is
// throttled to once every 30 s; the warning starts 60 s before the
// deadline. Stashing `onSignOut` in a ref keeps the effect from
// re-subscribing every render.
//
// The default (no-password) user skips this entirely — there is no
// key sitting in memory worth expiring, and "Continue without
// account" implies a stay-signed-in experience.
export function useIdleSignOut({
  user,
  password,
  ttlMs,
  onSignOut,
}: UseIdleSignOutInput): UseIdleSignOutResult {
  const signOutRef = useRef(onSignOut);
  signOutRef.current = onSignOut;
  const lastActivityRef = useRef<number>(Date.now());
  const lastSaveAtRef = useRef<number>(0);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState<number | null>(
    null,
  );
  const isGuest = user.isDefault === true;
  useEffect(() => {
    if (isGuest) return;
    // Treat the start of every signed-in session (and every TTL
    // change) as activity so the rolling window restarts from now;
    // re-stamp sessionStorage immediately so a reload right after a
    // setting change picks up the new deadline.
    lastActivityRef.current = Date.now();
    lastSaveAtRef.current = Date.now();
    saveSession(user.id, password, ttlMs);
    setWarningSecondsLeft(null);

    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const e of events) {
      window.addEventListener(e, bump, { passive: true });
    }

    // Aim for a 60 s heads-up, but never more than half the window so
    // a hand-edited 1-minute TTL doesn't fire the warning the moment
    // the user pauses to read.
    const WARNING_LEAD_MS = Math.min(60_000, Math.floor(ttlMs / 2));
    const SAVE_INTERVAL_MS = 30_000;
    const tick = window.setInterval(() => {
      const now = Date.now();
      const idleMs = now - lastActivityRef.current;
      if (idleMs >= ttlMs) {
        signOutRef.current();
        return;
      }
      const remainingMs = ttlMs - idleMs;
      if (remainingMs <= WARNING_LEAD_MS) {
        setWarningSecondsLeft(Math.max(1, Math.ceil(remainingMs / 1000)));
      } else {
        setWarningSecondsLeft((prev) => (prev === null ? prev : null));
        if (now - lastSaveAtRef.current >= SAVE_INTERVAL_MS) {
          saveSession(user.id, password, ttlMs);
          lastSaveAtRef.current = now;
        }
      }
    }, 1000);

    return () => {
      for (const e of events) window.removeEventListener(e, bump);
      window.clearInterval(tick);
    };
  }, [isGuest, user.id, password, ttlMs]);

  const onStaySignedIn = useCallback(() => {
    lastActivityRef.current = Date.now();
    lastSaveAtRef.current = Date.now();
    saveSession(user.id, password, ttlMs);
    setWarningSecondsLeft(null);
  }, [user.id, password, ttlMs]);

  return { warningSecondsLeft, onStaySignedIn };
}
