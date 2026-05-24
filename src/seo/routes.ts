// Per-route SEO metadata. Consumed by the build-time route splicer in
// `vite.config.ts`, which reads `dist/index.html` (already populated
// with the homepage values from `index.html`) and writes a copy under
// `dist/<route.alias>/index.html` with the route-specific <title>,
// description, canonical, og:*, twitter:*, and JSON-LD blocks
// substituted in. Add a new route here + add the alias to
// `emitPathAliasWithSeo` in `vite.config.ts` to extend.

import {
  AUTHOR,
  AUTHOR_SAME_AS,
  DEFAULT_OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from "./siteConfig";

export type OgType = "website" | "article";

export type ChangeFreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface SitemapEntry {
  changefreq: ChangeFreq;
  // 0.0 - 1.0; rendered to one decimal place in sitemap.xml.
  priority: number;
}

export interface RouteSeo {
  // URL path the route is served at, with trailing slash. Used as the
  // build-time output directory (minus the leading slash) and as the
  // canonical URL suffix.
  path: string;
  title: string;
  description: string;
  ogType: OgType;
  // Top-level JSON-LD blocks to embed in <head>. Use the canonical
  // `${SITE_URL}/#author` @id for the author Person so Google
  // deduplicates the entity across pages.
  jsonLd: object[];
  // sitemap.xml row for this route. Omit to keep the route out of the
  // generated sitemap (e.g. the 404 page).
  sitemap?: SitemapEntry;
  // Per-route <noscript> body. Pure HTML string spliced into the
  // alias HTML between the <!-- NOSCRIPT_START --> markers so non-JS
  // crawlers and link unfurlers see route-specific content instead of
  // the home-page fallback. Omit to inherit the home-page noscript.
  noscriptBody?: string;
}

// Pre-baked <noscript> fragments. Kept inside the routes module so
// the splicer in `vite.config.ts` reads them from the same source of
// truth as <title>, description, and JSON-LD.
// Inline single quotes around 'Liberation Mono' (rather than the
// double quotes the homepage `index.html` uses with `&quot;`) so the
// style fragment stays valid HTML when embedded verbatim inside a
// double-quoted attribute by the route splicer.
const NOSCRIPT_STYLE_MAIN = `font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.25rem; color: #c8c8c8; background: #1d2027; line-height: 1.55;`;
const NOSCRIPT_STYLE_H1 = `font-size: 1.5rem; color: #e5c07b; margin: 0 0 1rem;`;

function noscript(h1: string, paragraphs: string[]): string {
  const body = paragraphs.map((p) => `<p>${p}</p>`).join("\n          ");
  return [
    `<main style="${NOSCRIPT_STYLE_MAIN}">`,
    `  <h1 style="${NOSCRIPT_STYLE_H1}">${h1}</h1>`,
    `  ${body}`,
    `  <p><a href="/">Back to ${SITE_NAME}</a></p>`,
    `</main>`,
  ].join("\n        ");
}

const AUTHOR_PERSON = {
  "@type": "Person",
  "@id": `${SITE_URL}/#author`,
  name: AUTHOR.name,
  url: AUTHOR.url,
  sameAs: [...AUTHOR_SAME_AS],
} as const;

const WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: `${SITE_URL}/`,
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  inLanguage: SITE_LANGUAGE,
  publisher: { "@id": `${SITE_URL}/#author` },
} as const;

export const HOME_ROUTE: RouteSeo = {
  path: "/",
  title: "Budget — local-first budget app",
  description: SITE_DESCRIPTION,
  ogType: "website",
  sitemap: { changefreq: "weekly", priority: 1.0 },
  jsonLd: [
    { "@context": "https://schema.org", ...AUTHOR_PERSON },
    WEBSITE,
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript. Requires HTML5.",
      inLanguage: SITE_LANGUAGE,
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      author: { "@id": `${SITE_URL}/#author` },
      publisher: { "@id": `${SITE_URL}/#author` },
      screenshot: absoluteUrl(DEFAULT_OG_IMAGE),
      keywords:
        "local-first, budget, finance, spreadsheet, no account, no backend, privacy, offline, pwa",
      featureList: [
        "Local-first storage — data lives in your browser",
        "Spreadsheet-style monthly sheets",
        "JSON export / import for portability",
        "Optional Dropbox sync to your own app folder",
        "No account, no backend, no behavioural tracking",
      ],
    },
  ],
};

export const PRIVACY_ROUTE: RouteSeo = {
  path: "/privacy/",
  title: "Privacy — Budget",
  description:
    "How Budget handles your data: it lives in your browser's local " +
    "storage and, if you opt in, in your own Dropbox app folder. " +
    "No server, no account on a backend, no behavioural tracking SDK.",
  ogType: "article",
  sitemap: { changefreq: "monthly", priority: 0.5 },
  noscriptBody: noscript("Privacy policy — Budget", [
    "Budget is a local-first budget app. Your ledger lives in your browser's local storage. There is no backend, no account on a server, and no behavioural tracking SDK. The production site loads a privacy-friendly page-view counter (GoatCounter) that records aggregated hits only. You can optionally sync the same JSON to your own Dropbox app folder.",
    "The full privacy policy needs JavaScript to render. Enable JavaScript and reload, or read the source on GitHub.",
  ]),
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${absoluteUrl("/privacy/")}#page`,
      url: absoluteUrl("/privacy/"),
      name: "Privacy policy — Budget",
      description:
        "How Budget handles your data: local-first, no backend, no behavioural tracking.",
      inLanguage: SITE_LANGUAGE,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#app` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SITE_URL}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Privacy",
          item: absoluteUrl("/privacy/"),
        },
      ],
    },
  ],
};

export const ROUTES: readonly RouteSeo[] = [HOME_ROUTE, PRIVACY_ROUTE];
