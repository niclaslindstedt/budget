// Plaintext mirror of `Settings.language` in localStorage. The
// canonical setting still lives inside the (possibly encrypted)
// budget bucket, but mirroring the language in plaintext lets the
// auth screen, the standalone `/privacy` route, and the loading
// shell render in the right language without
// first decrypting the bucket. Language preference is not PII —
// leaking it is no worse than leaking the browser's
// `Accept-Language` header.

import { nsKey } from "../data/constants";
import { detectInitialLanguage, type Lang } from "./locale";

const KEY = nsKey("budget.language.v1");

export function readLanguagePreference(): Lang {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "sv" || raw === "en") return raw;
  } catch {
    // localStorage may throw under private-mode quotas / cross-origin
    // iframes — fall through to detection.
  }
  return detectInitialLanguage();
}

export function writeLanguagePreference(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Silent: the bucket still carries the canonical setting; the
    // mirror is a UX nicety.
  }
}
