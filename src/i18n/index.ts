// Tiny custom i18n runtime. One React context carries the active
// language, one typed `t()` function reads from per-language catalog
// modules. No bundle-size cost from a third-party library, no namespaces
// — just a typed lookup with `{name}`-style interpolation.
//
// English is bundled (the default + fallback + the `Catalog`/`MessageKey`
// type source); every other language is code-split and loaded on demand
// via `ensureCatalog`, so a language the user never selects costs nothing
// at first paint. Lookups are still synchronous — `t()` / `tFor()` fall
// back to English for any key whose language catalog isn't resident yet,
// and `LanguageRoot` loads the active catalog before applying it so that
// fallback is a safety net rather than a visible state.

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  type ReactNode,
} from "react";

import { en, type Catalog } from "./locales/en";
import type { Lang } from "./locale";

// Dotted-path type derived from the catalog shape. Lets `t("a.b.c")`
// autocomplete to every leaf and rejects typos at the call site.
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends object
      ? Leaves<T[K], `${P}${K}.`>
      : never;
}[keyof T & string];

export type MessageKey = Leaves<Catalog>;

// Flatten a catalog into a `dotted.path → string` map. The runtime then
// resolves `t("a.b.c")` as a single `Map.get` instead of splitting the
// path and walking the nested object on every call. With 1000+ `t()`
// call sites and many landing in per-row render paths, the per-call
// savings compound across the app.
function flattenCatalog(
  obj: unknown,
  prefix: string,
  out: Map<string, string>,
): void {
  if (obj === null || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix === "" ? k : `${prefix}.${k}`;
    if (typeof v === "string") out.set(path, v);
    else flattenCatalog(v, path, out);
  }
}

function flatten(catalog: Catalog): Map<string, string> {
  const m = new Map<string, string>();
  flattenCatalog(catalog, "", m);
  return m;
}

// English is the default language and the fallback for every lookup, so
// it stays statically imported and flattened eagerly — no async gate for
// English users, and a guaranteed synchronous answer for any key in any
// language (a not-yet-loaded catalog falls through to this map). It is
// also the source of the compile-time `Catalog` / `MessageKey` types.
const flatEn = flatten(en);

// Every *other* language is code-split: its catalog (~50 kB gzip per
// language) loads on demand via `ensureCatalog`, keyed by the loader
// registry below, and is flattened into this map once it arrives. Seeded
// with English so `flatCatalogs.en` is always present. Adding a language
// is: extend `Lang`, add a `locales/<code>/` dir, and add one line here.
const flatCatalogs: Partial<Record<Lang, Map<string, string>>> = {
  en: flatEn,
};

// Dynamic-import thunks for the non-default languages. The `Record` is
// keyed on `Exclude<Lang, "en">`, so adding a language to the `Lang`
// union is a compile error until its loader is registered here too —
// the lazy split can't be silently forgotten for a new language. Each
// `import()` becomes its own rolldown chunk, kept out of the entry
// bundle until the user actually runs in that language.
const CATALOG_LOADERS: Record<Exclude<Lang, "en">, () => Promise<Catalog>> = {
  sv: () => import("./locales/sv").then((m) => m.sv),
};

// De-dupe concurrent loads of the same language (e.g. StrictMode's
// double-invoked effect, or a render firing before the first load
// resolves) so a catalog is fetched and flattened at most once.
const inFlight = new Map<Lang, Promise<void>>();

// Whether `lang`'s catalog is resident — `true` immediately for English,
// and for any language once `ensureCatalog` has resolved. Callers gate a
// first paint on this to avoid a flash of English for a non-English user.
export function isCatalogLoaded(lang: Lang): boolean {
  return flatCatalogs[lang] !== undefined;
}

// Load (and flatten) `lang`'s catalog if it isn't resident yet. Resolves
// immediately for English / already-loaded languages. Pure lookups
// (`tFor`, `useT`) fall back to English until this resolves, so calling
// it is about *completeness*, not correctness — the UI is never blocked
// on it, only the optional first-paint gate is.
export function ensureCatalog(lang: Lang): Promise<void> {
  if (isCatalogLoaded(lang)) return Promise.resolve();
  const existing = inFlight.get(lang);
  if (existing) return existing;
  const loader = CATALOG_LOADERS[lang as Exclude<Lang, "en">];
  if (!loader) return Promise.resolve();
  const p = loader().then((catalog) => {
    flatCatalogs[lang] = flatten(catalog);
    inFlight.delete(lang);
  });
  inFlight.set(lang, p);
  return p;
}

function formatString(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const v = params[key];
    return v === undefined ? match : String(v);
  });
}

const LanguageContext = createContext<Lang>("en");

export type TFunction = (
  key: MessageKey,
  params?: Record<string, string | number>,
) => string;

export function LanguageProvider({
  value,
  children,
}: {
  value: Lang;
  children: ReactNode;
}) {
  return createElement(LanguageContext.Provider, { value }, children);
}

export function useLang(): Lang {
  return useContext(LanguageContext);
}

export function useT(): TFunction {
  const lang = useContext(LanguageContext);
  return useCallback<TFunction>(
    (key, params) => {
      // Fall back to English when the active language's catalog hasn't
      // loaded yet (a code-split language mid-fetch). `LanguageRoot`
      // gates the first paint so this only ever surfaces briefly, if at
      // all, during a runtime language switch.
      const raw = (flatCatalogs[lang] ?? flatEn).get(key) ?? key;
      return formatString(raw, params);
    },
    [lang],
  );
}

// Standalone lookup for non-React contexts (the format helpers, the
// validator). Pass the language explicitly so this stays pure. Falls
// back to English when `lang`'s catalog isn't resident yet — its only
// non-test caller runs during render, long after `LanguageRoot` has
// ensured the active catalog, so this fallback is a safety net rather
// than a path the UI normally hits.
export function tFor(
  lang: Lang,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const raw = (flatCatalogs[lang] ?? flatEn).get(key) ?? key;
  return formatString(raw, params);
}

// Convenience: pick "one" vs "other" based on count. Most languages
// only need these two forms; ICU's full plural rules would be overkill
// for the strings this app carries.
export function plural(
  t: TFunction,
  oneKey: MessageKey,
  otherKey: MessageKey,
  n: number,
  params?: Record<string, string | number>,
): string {
  return t(n === 1 ? oneKey : otherKey, { n, ...(params ?? {}) });
}

export {
  type Lang,
  SUPPORTED_LANGS,
  bcp47,
  detectInitialLanguage,
} from "./locale";
