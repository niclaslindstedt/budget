// Single source of truth for every SEO copy string and URL: <title>,
// meta descriptions, Open Graph / Twitter tags, JSON-LD, robots.txt,
// the sitemap, and llms.txt. Both runtime code and the build-time
// route splicer in `vite.config.ts` import from here, so tweaking the
// site's pitch is a one-file change.

export const SITE_URL = "https://budget.niclaslindstedt.se";

export const SITE_NAME = "Budget";
export const SITE_TAGLINE = "A local-first budget app";

// Meta description doubles as og:/twitter: description and the JSON-LD
// description, so keep it ≤ 160 chars (Google truncation point) while
// still naming the breadth (accounts, salary, loans), the dual cloud
// sync, and the privacy stance that is the project's whole identity.
export const SITE_DESCRIPTION =
  "A local-first budget app that tracks accounts, salary, and loans in " +
  "your browser. Sync to Dropbox or Google Drive, or export JSON. " +
  "No account, no backend.";

// Keyword list shared by the <meta name="keywords"> tag in index.html
// and the WebApplication JSON-LD `keywords` field. Not a ranking signal
// on its own, but keeps the two surfaces from drifting apart.
export const SITE_KEYWORDS =
  "local-first, budget, personal finance, money management, accounts, " +
  "salary, loan tracking, savings, net worth, forecasting, spreadsheet, " +
  "no account, no backend, privacy, offline, pwa, dropbox sync, " +
  "google drive sync, encrypted, json export, free";

// Canonical feature list surfaced in the WebApplication JSON-LD
// (rich-result `featureList`) and mirrored in index.html. Reflects the
// real page set — accounts, salary, loans, savings, investments,
// properties, insights — rather than the original ledger-only pitch.
export const SITE_FEATURES: readonly string[] = [
  "Local-first storage — your data lives in your browser",
  "Track accounts, salary, loans, savings, investments, and properties",
  "Net-worth insights and budget forecasting",
  "Spreadsheet-style monthly sheets with running balances",
  "JSON export / import for full portability",
  "Optional encrypted sync to your own Dropbox or Google Drive",
  "Installable PWA that works offline",
  "English and Swedish, with dark / light themes",
  "No account, no backend, no behavioural tracking",
];

export const SITE_LANGUAGE = "en";
export const SITE_LOCALE = "en_US";

export const AUTHOR = {
  name: "Niclas Lindstedt",
  url: "https://niclaslindstedt.se",
  github: "https://github.com/niclaslindstedt",
  linkedin: "https://www.linkedin.com/in/niclaslindstedt/",
} as const;

export const AUTHOR_SAME_AS: readonly string[] = [
  AUTHOR.github,
  AUTHOR.linkedin,
];

export const REPO_URL = "https://github.com/niclaslindstedt/budget";

export const DEFAULT_OG_IMAGE = "/og-default.png";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT = `${SITE_NAME} — ${SITE_TAGLINE}`;

export const SITEMAP_PATH = "/sitemap.xml";
export const ROBOTS_PATH = "/robots.txt";
export const LLMS_PATH = "/llms.txt";

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = SITE_URL.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}
