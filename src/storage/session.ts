// Short-lived cache for the active user's password, so a page reload
// inside the TTL doesn't drop the user back to the sign-in form. The
// password is the AES-GCM decryption key (via PBKDF2) for the user's
// budget — keeping it across reloads is what makes refresh painless.
//
// Stored in `sessionStorage`, not `localStorage`: the cache is scoped
// to the browser tab and evaporates the moment the tab closes, which
// is the closest the platform offers to "in memory". An explicit
// `expiresAt` adds a 15-minute lifetime on top so an idle tab left
// open all day doesn't leave the key sitting around indefinitely.

const SESSION_KEY = "budget.session.v1";

export const SESSION_TTL_MS = 15 * 60 * 1000;

export type Session = {
  userId: string;
  password: string;
  expiresAt: number;
};

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.userId === "string" &&
    typeof v.password === "string" &&
    typeof v.expiresAt === "number"
  );
}

export function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isSession(parsed)) return null;
  if (Date.now() >= parsed.expiresAt) return null;
  return parsed;
}

export function loadSession(): Session | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const session = parseSession(sessionStorage.getItem(SESSION_KEY));
    if (!session) {
      // Sweep stale or malformed payloads so the slot doesn't leak
      // across logins.
      sessionStorage.removeItem(SESSION_KEY);
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(userId: string, password: string): Session {
  const session: Session = {
    userId,
    password,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  } catch {
    // quota / disabled — silent fail; the in-memory ref keeps the
    // current tab working, only the refresh shortcut is lost.
  }
  return session;
}

export function clearSession(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // disabled / blocked storage — silent fail
  }
}
