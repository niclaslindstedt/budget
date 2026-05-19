// Shared OAuth 2.0 PKCE helpers used by every cloud storage adapter
// that signs in through the browser (Dropbox, Google Drive, …). The
// helpers are pure and stateless; each adapter owns its own
// `sessionStorage` key for the verifier so parallel auth flows don't
// race each other.

import { debug } from "../utils/debug";

const log = debug("oauth");

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 64 random bytes encoded as base64url — comfortably above the 43-
// character minimum the spec requires and well below the 128-character
// maximum, so the resulting string fits in a URL without truncation.
export function randomVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function challengeFor(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

// The OAuth app registration must list this exact URI; we use the
// current page origin so prod and local dev work without forking.
// No trailing slash — Google's OAuth client config rejects redirect
// URIs that end in `/`, and Dropbox accepts either form, so the
// slash-less origin is the only spelling that satisfies both.
export function redirectUri(): string {
  return window.location.origin;
}

// Pick which cloud provider issued an inbound OAuth `?code=`. The
// authoritative signal is the PKCE verifier we stashed in
// `sessionStorage` before redirecting to the provider's consent
// screen — exactly one is live during a redirect, so its presence
// alone identifies the flow. The URL's `state` query param is used
// only to disambiguate when both happen to be present (an aborted
// prior flow left a stale verifier behind). Returns `null` when
// nothing identifies the flow — caller should log and bail rather
// than fall through to a hardcoded provider, since defaulting was
// what landed a successful Google auth on the Dropbox completion
// path when Google occasionally swallowed `state`.
export function pickOauthProvider(args: {
  state: string | null;
  gdrivePending: boolean;
  dropboxPending: boolean;
}): "gdrive" | "dropbox" | null {
  const { state, gdrivePending, dropboxPending } = args;
  if (gdrivePending && !dropboxPending) return "gdrive";
  if (dropboxPending && !gdrivePending) return "dropbox";
  if (gdrivePending && dropboxPending) {
    if (state === "gdrive") return "gdrive";
    if (state === "dropbox") return "dropbox";
    return null;
  }
  return null;
}

export type FetchImpl = typeof fetch;

// All the per-provider knobs the three flow helpers below need. The
// helpers are uniform across providers; only this record changes.
//
// `extraAuthParams` carries the bits the providers legitimately differ
// on (Dropbox needs `token_access_type=offline`, Google needs `scope`
// + `access_type=online` + `include_granted_scopes=true`, …). The
// helper merges them into the redirect's query string verbatim.
//
// `providerName` is the human-readable label that surfaces in thrown
// error messages — "Dropbox token exchange failed: 400" reads better
// than a generic "OAuth token exchange failed".
export type OAuthConfig = {
  authBase: string;
  tokenEndpoint: string;
  clientId: string;
  // OAuth `state` echoed back by the redirect so a multi-provider app
  // can route the `?code=` to the right token exchange.
  state: string;
  // `sessionStorage` key for the PKCE verifier. Per-provider so
  // parallel flows don't race each other on the same slot.
  verifierKey: string;
  providerName: string;
  extraAuthParams?: Record<string, string>;
};

export type TokenResult = {
  accessToken: string;
  refreshToken: string | null;
};

// Kicks the user out to the provider's consent screen. Returns nothing
// — the next thing that happens is a full-page redirect back to the
// app with `?code=…&state=<config.state>` set.
export async function startAuth(config: OAuthConfig): Promise<void> {
  log.log(
    `${config.providerName}: startAuth (redirect=${redirectUri()}, state=${config.state}, verifierKey=${config.verifierKey})`,
  );
  const verifier = randomVerifier();
  sessionStorage.setItem(config.verifierKey, verifier);
  const challenge = await challengeFor(verifier);
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: config.state,
    ...(config.extraAuthParams ?? {}),
  });
  const dest = `${config.authBase}?${params.toString()}`;
  // Echo the outbound query keys (not values — `code_challenge` is
  // sensitive enough that we'd rather not surface it) so a comparison
  // against the inbound query on return is mechanical.
  const sentKeys = [...params.keys()].sort().join(",");
  log.log(
    `${config.providerName}: redirecting to ${config.authBase} sentKeys=${sentKeys}`,
  );
  window.location.assign(dest);
}

// Trades the code from the redirect for an access (and, where the
// provider issues one, refresh) token. Caller is responsible for
// persisting both and cleaning the URL. Throws on any failure so the
// caller can surface the error in the UI.
export async function completeAuth(
  config: OAuthConfig,
  code: string,
  fetchImpl: FetchImpl = fetch,
): Promise<TokenResult> {
  log.log(`${config.providerName}: completeAuth (code received)`);
  const verifier = sessionStorage.getItem(config.verifierKey);
  if (!verifier) {
    log.error(
      `${config.providerName}: completeAuth aborted — missing PKCE verifier (key=${config.verifierKey})`,
    );
    throw new Error("Missing PKCE verifier — restart the connect flow");
  }
  sessionStorage.removeItem(config.verifierKey);
  const params = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  const start = performance.now();
  let res: Response;
  try {
    res = await fetchImpl(config.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (err) {
    log.error(`${config.providerName}: token exchange network error`, err);
    throw err;
  }
  const ms = (performance.now() - start).toFixed(0);
  log.log(`${config.providerName}: token exchange → ${res.status} (${ms}ms)`);
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    log.error(`${config.providerName}: token exchange failed`, body);
    throw new Error(
      `${config.providerName} token exchange failed: ${res.status}`,
    );
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!json.access_token) {
    log.error(`${config.providerName}: response missing access_token`, json);
    throw new Error(
      `${config.providerName} token response missing access_token`,
    );
  }
  log.log(
    `${config.providerName}: tokens ok hasRefresh=${Boolean(json.refresh_token)}`,
  );
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
  };
}

// Trades a refresh token for a fresh access token. Returns the new
// access token only — the providers we support (today: Dropbox) keep
// the refresh token stable across calls under the PKCE flow, so the
// caller only needs to persist the new access token. Throws on any
// failure so the adapter can fall back to surfacing the original 401.
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  log.log(`${config.providerName}: refreshAccessToken`);
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
  const start = performance.now();
  let res: Response;
  try {
    res = await fetchImpl(config.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (err) {
    log.error(`${config.providerName}: refresh network error`, err);
    throw err;
  }
  const ms = (performance.now() - start).toFixed(0);
  log.log(`${config.providerName}: refresh → ${res.status} (${ms}ms)`);
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    log.error(`${config.providerName}: refresh failed`, body);
    throw new Error(
      `${config.providerName} token refresh failed: ${res.status}`,
    );
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    log.error(
      `${config.providerName}: refresh response missing access_token`,
      json,
    );
    throw new Error(
      `${config.providerName} refresh response missing access_token`,
    );
  }
  return json.access_token;
}
