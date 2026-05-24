// Single source of truth for every SEO copy string and URL: <title>,
// meta descriptions, Open Graph / Twitter tags, JSON-LD, robots.txt,
// the sitemap, and llms.txt. Both runtime code and the build-time
// route splicer in `vite.config.ts` import from here, so tweaking the
// site's pitch is a one-file change.

export const SITE_URL = "https://budget.niclaslindstedt.se";

export const SITE_NAME = "Budget";
export const SITE_TAGLINE = "A local-first budget app";

export const SITE_DESCRIPTION =
  "A local-first budget app that keeps your data in your browser. " +
  "Export and import as JSON; no account, no backend, no behavioural " +
  "tracking.";

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
