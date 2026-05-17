import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { PRIVACY_ROUTE, SCHEMA_ROUTE, type RouteSeo } from "./src/seo/routes";
import {
  DEFAULT_OG_IMAGE,
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  absoluteUrl,
} from "./src/seo/siteConfig";

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Render the per-route SEO payload that replaces the homepage block
// between the HEAD_SEO_START / HEAD_SEO_END markers in
// `dist/<alias>/index.html`. Site-wide tags (charset, viewport,
// theme-color, favicon, og:site_name, og:locale, application-name)
// live outside the markers in `index.html` and are preserved on every
// alias.
function renderRouteSeo(route: RouteSeo): string {
  const canonical = absoluteUrl(route.path);
  const image = absoluteUrl(DEFAULT_OG_IMAGE);
  const title = escapeHtmlAttr(route.title);
  const desc = escapeHtmlAttr(route.description);

  const lines: string[] = [];
  lines.push(`<title>${escapeHtmlText(route.title)}</title>`);
  lines.push(`<meta name="description" content="${desc}" />`);
  lines.push(`<link rel="canonical" href="${canonical}" />`);
  lines.push(
    `<meta name="robots" content="index,follow,max-image-preview:large" />`,
  );

  lines.push(`<meta property="og:type" content="${route.ogType}" />`);
  lines.push(`<meta property="og:title" content="${title}" />`);
  lines.push(`<meta property="og:description" content="${desc}" />`);
  lines.push(`<meta property="og:url" content="${canonical}" />`);
  lines.push(`<meta property="og:image" content="${image}" />`);
  lines.push(`<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`);
  lines.push(
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
  );
  lines.push(
    `<meta property="og:image:alt" content="${escapeHtmlAttr(OG_IMAGE_ALT)}" />`,
  );

  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:title" content="${title}" />`);
  lines.push(`<meta name="twitter:description" content="${desc}" />`);
  lines.push(`<meta name="twitter:image" content="${image}" />`);
  lines.push(
    `<meta name="twitter:image:alt" content="${escapeHtmlAttr(OG_IMAGE_ALT)}" />`,
  );

  for (const block of route.jsonLd) {
    // `</` escape stops a stray `</script` substring inside a description
    // from prematurely closing the <script> wrapper.
    const json = JSON.stringify(block).replace(/<\//g, "<\\/");
    lines.push(`<script type="application/ld+json">${json}</script>`);
  }

  return lines.join("\n    ");
}

const HEAD_SEO_RE =
  /<!-- HEAD_SEO_START[\s\S]*?-->[\s\S]*?<!-- HEAD_SEO_END -->/;

function spliceRouteSeo(html: string, route: RouteSeo): string {
  if (!HEAD_SEO_RE.test(html)) {
    throw new Error(
      "emit-path-alias-with-seo: HEAD_SEO markers missing in " +
        "dist/index.html — cannot splice per-route SEO. Did `index.html` " +
        "drop the <!-- HEAD_SEO_START --> / <!-- HEAD_SEO_END --> pair?",
    );
  }
  const block =
    `<!-- HEAD_SEO_START (${route.path}) -->\n    ` +
    renderRouteSeo(route) +
    `\n    <!-- HEAD_SEO_END -->`;
  return html.replace(HEAD_SEO_RE, block);
}

// Mirror `dist/index.html` to `dist/<route>/index.html` after build so
// GitHub Pages can serve the SPA from a clean URL like `/privacy/`
// (returning 200 instead of the 404-fallback shuffle), with the
// homepage SEO block replaced by the route-specific one from
// `src/seo/routes.ts`. Also emits `dist/404.html` — same shell, marked
// noindex — so GitHub Pages' SPA fallback returns a real 404 page
// without leaking soft-404 signals when crawlers guess URLs.
function emitPathAliasWithSeo(...routes: readonly RouteSeo[]): Plugin {
  return {
    name: "emit-path-alias-with-seo",
    apply: "build",
    closeBundle() {
      const outRoot = resolve(__dirname, "dist");
      const indexPath = resolve(outRoot, "index.html");
      const indexHtml = readFileSync(indexPath, "utf8");

      for (const route of routes) {
        const alias = route.path.replace(/^\/|\/$/g, "");
        if (!alias) continue;
        const dir = resolve(outRoot, alias);
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          resolve(dir, "index.html"),
          spliceRouteSeo(indexHtml, route),
          "utf8",
        );
      }

      const notFound: RouteSeo = {
        path: "/404",
        title: "Not found — Budget",
        description: "The page you requested does not exist on this site.",
        ogType: "website",
        jsonLd: [],
      };
      const notFoundHtml = spliceRouteSeo(indexHtml, notFound).replace(
        `<meta name="robots" content="index,follow,max-image-preview:large" />`,
        `<meta name="robots" content="noindex,follow" />`,
      );
      writeFileSync(resolve(outRoot, "404.html"), notFoundHtml, "utf8");
    },
  };
}

// The site is served from the custom domain budget.niclaslindstedt.se
// (see public/CNAME), which is rooted at "/". If the custom domain is
// ever removed and the app falls back to niclaslindstedt.github.io/budget/,
// switch base to "/budget/" for production builds, and update
// `SITE_URL` in `src/seo/siteConfig.ts` so canonicals don't 404.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    emitPathAliasWithSeo(PRIVACY_ROUTE, SCHEMA_ROUTE),
  ],
  base: "/",
});
