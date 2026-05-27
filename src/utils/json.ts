// `JSON.parse(text)` wrapped to return `null` on either bad input or
// a parse failure, so callers don't have to write the recurring
//
//   let parsed: unknown;
//   try { parsed = JSON.parse(text); } catch { return fallback; }
//
// dance. Each caller still validates the parsed shape itself — the
// helper only collapses the try/catch + null-text guard. Generic
// parameter is `unknown` by default so the type system forces shape
// validation downstream; pass an explicit `<T>` only where the
// caller has already validated against a separate schema and wants
// the parsed value typed as `T`.
export function safeJsonParse<T = unknown>(
  text: string | null | undefined,
): T | null {
  if (text === null || text === undefined || text === "") return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
