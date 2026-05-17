// Shared OAuth 2.0 PKCE helpers used by every cloud storage adapter
// that signs in through the browser (Dropbox, Google Drive, …). The
// helpers are pure and stateless; each adapter owns its own
// `sessionStorage` key for the verifier so parallel auth flows don't
// race each other.

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
export function redirectUri(): string {
  return `${window.location.origin}/`;
}
