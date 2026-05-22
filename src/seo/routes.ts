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
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from "./siteConfig";

export type OgType = "website" | "article";

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
      featureList: [
        "Local-first storage — data lives in your browser",
        "Spreadsheet-style monthly sheets",
        "JSON export / import for portability",
        "Optional Dropbox sync to your own app folder",
        "No account, no backend, no analytics",
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
    "No server, no account on a backend, no analytics SDK.",
  ogType: "article",
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${absoluteUrl("/privacy/")}#page`,
      url: absoluteUrl("/privacy/"),
      name: "Privacy policy — Budget",
      description:
        "How Budget handles your data: local-first, no backend, no analytics.",
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

export const CHANGELOG_ROUTE: RouteSeo = {
  path: "/changelog/",
  title: "Changelog — Budget",
  description:
    "Release notes for the Budget app. Each version lists the user-" +
    "visible additions, changes, and fixes shipped in that release, " +
    "following Keep a Changelog conventions and semantic versioning.",
  ogType: "article",
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "@id": `${absoluteUrl("/changelog/")}#article`,
      url: absoluteUrl("/changelog/"),
      headline: "Budget changelog",
      description:
        "Release notes for the Budget app, by version, following Keep " +
        "a Changelog conventions and semantic versioning.",
      inLanguage: SITE_LANGUAGE,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#app` },
      author: { "@id": `${SITE_URL}/#author` },
      publisher: { "@id": `${SITE_URL}/#author` },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": absoluteUrl("/changelog/"),
      },
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
          name: "Changelog",
          item: absoluteUrl("/changelog/"),
        },
      ],
    },
  ],
};

export const SYSTEM_ROUTE: RouteSeo = {
  path: "/system/",
  title: "How to use Budget — Budget",
  description:
    "A guided tour of every feature in the Budget app, ordered as " +
    "you'd discover them. Four tiers — Beginner, Intermediate, Pro, " +
    "Expert — each item has a summary and a Learn-more expander so " +
    "you can skip to your own level.",
  ogType: "article",
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "@id": `${absoluteUrl("/system/")}#article`,
      url: absoluteUrl("/system/"),
      headline: "How to use Budget",
      description:
        "A guided tour of every feature in the Budget app, ordered " +
        "as you'd discover them. Four tiers: Beginner, Intermediate, " +
        "Pro, Expert.",
      inLanguage: SITE_LANGUAGE,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#app` },
      author: { "@id": `${SITE_URL}/#author` },
      publisher: { "@id": `${SITE_URL}/#author` },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": absoluteUrl("/system/"),
      },
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
          name: "How to use Budget",
          item: absoluteUrl("/system/"),
        },
      ],
    },
  ],
};

export const ROUTES: readonly RouteSeo[] = [
  HOME_ROUTE,
  PRIVACY_ROUTE,
  CHANGELOG_ROUTE,
  SYSTEM_ROUTE,
];
