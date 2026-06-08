// On-demand loading for the non-default webfont families.
//
// The default family (JetBrains Mono, the `mono` id) is imported
// statically in `src/main.tsx`, so it's part of the main bundle and
// precached for offline first paint. The three non-default families
// load lazily — when the user selects one (`useTheme`) or when the
// Appearance font picker mounts to render its previews
// (`AppearanceTab`). Their woff2 are excluded from the service-worker
// precache in `vite.config.ts` (the same on-demand treatment the
// pdf.js chunks get), so the browser only fetches them on first use
// and HTTP-caches them afterwards. A session that never leaves the
// default face never downloads them at all.
//
// Only the latin + latin-ext subsets ship: the app's two languages
// (English, Swedish) live entirely within them, so fontsource's bare
// `400.css` / `700.css` entrypoints — which also pull cyrillic / greek
// / vietnamese — would be pure waste. OpenDyslexic is latin-only
// upstream, so it has no latin-ext import.
//
// Local-first: every byte is bundled and served from our own origin —
// no CDN at runtime.

import type { FontFamilyId } from "../data/types";

type NonDefaultFamily = Exclude<FontFamilyId, "mono">;

const loaders: Record<NonDefaultFamily, () => Promise<unknown>> = {
  sans: () =>
    Promise.all([
      import("@fontsource/inter/latin-400.css"),
      import("@fontsource/inter/latin-ext-400.css"),
      import("@fontsource/inter/latin-700.css"),
      import("@fontsource/inter/latin-ext-700.css"),
    ]),
  serif: () =>
    Promise.all([
      import("@fontsource/source-serif-4/latin-400.css"),
      import("@fontsource/source-serif-4/latin-ext-400.css"),
      import("@fontsource/source-serif-4/latin-700.css"),
      import("@fontsource/source-serif-4/latin-ext-700.css"),
    ]),
  dyslexic: () =>
    Promise.all([
      import("@fontsource/opendyslexic/latin-400.css"),
      import("@fontsource/opendyslexic/latin-700.css"),
    ]),
};

// Memoise so each family's CSS is fetched at most once per session.
const started = new Map<FontFamilyId, Promise<unknown>>();

// Ensure the `@font-face` rules for `id` are present. A no-op (resolved
// promise) for the statically-bundled default family.
export function loadFontFamily(id: FontFamilyId): Promise<unknown> {
  if (id === "mono") return Promise.resolve();
  const existing = started.get(id);
  if (existing) return existing;
  const p = loaders[id]();
  started.set(id, p);
  return p;
}

// Kick off every non-default family so the font-picker previews render
// in their real face. Fire-and-forget — the previews swap in as each
// lands.
export function loadAllFontFamilies(): void {
  for (const id of Object.keys(loaders) as NonDefaultFamily[]) {
    void loadFontFamily(id);
  }
}
