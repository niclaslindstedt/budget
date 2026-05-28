// Tiny custom i18n runtime. One React context carries the active
// language, one typed `t()` function reads from per-language catalog
// modules. No bundle-size cost from a third-party library, no async
// loading, no namespaces — just a typed lookup with `{name}`-style
// interpolation.

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  type ReactNode,
} from "react";

import { en, type Catalog } from "./locales/en";
import { sv } from "./locales/sv";
import type { Lang } from "./locale";

const catalogs: Record<Lang, Catalog> = { en, sv };

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

// Flatten each catalog into a `dotted.path → string` map once at module
// load. The runtime then resolves `t("a.b.c")` as a single `Map.get`
// instead of splitting the path and walking the nested object on every
// call. With 1000+ `t()` call sites and many landing in per-row render
// paths, the per-call savings compound across the app.
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

const flatCatalogs: Record<Lang, Map<string, string>> = (() => {
  const out = {} as Record<Lang, Map<string, string>>;
  for (const [lang, catalog] of Object.entries(catalogs) as [Lang, Catalog][]) {
    const m = new Map<string, string>();
    flattenCatalog(catalog, "", m);
    out[lang] = m;
  }
  return out;
})();

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
      const raw = flatCatalogs[lang].get(key) ?? key;
      return formatString(raw, params);
    },
    [lang],
  );
}

// Standalone lookup for non-React contexts (the format helpers, the
// validator). Pass the language explicitly so this stays pure.
export function tFor(
  lang: Lang,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const raw = flatCatalogs[lang].get(key) ?? key;
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
