import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import pkg from "./package.json" with { type: "json" };
import {
  CHANGELOG_ROUTE,
  PRIVACY_ROUTE,
  type RouteSeo,
} from "./src/seo/routes";
import {
  DEFAULT_OG_IMAGE,
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  absoluteUrl,
} from "./src/seo/siteConfig";
import { emitChangelogData } from "./vite/changelog-plugin";

// Two-build deploy: production goes at "/", a preview of `main` goes at
// "/preview/". `pages.yml` invokes vite twice with different
// `VITE_BASE_PATH` values and merges the two `dist/` trees into a
// single Pages artifact. `IS_PREVIEW` flips on every persistence
// namespace inside the app at runtime (see `src/utils/build-env.ts`),
// keeping production data untouched by preview migrations.
const BASE_PATH = process.env.VITE_BASE_PATH || "/";
const IS_PREVIEW = BASE_PATH !== "/";

// Short build identifier rendered next to the "budget" header on
// the page and suffixed onto the browser-tab title. Shape is
// `<pkg.version>[.<run>][-pre]`, where `<run>` is the
// `GITHUB_RUN_NUMBER` GitHub Actions populates automatically (so
// local builds drop it) and `-pre` only appears on the preview
// slot (`VITE_BASE_PATH !== "/"`).
const GITHUB_RUN_NUMBER = process.env.GITHUB_RUN_NUMBER;
const BUILD_LABEL =
  pkg.version +
  (GITHUB_RUN_NUMBER ? `.${GITHUB_RUN_NUMBER}` : "") +
  (IS_PREVIEW ? "-pre" : "");

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

type EmitOptions = {
  // Rewrite the `<meta name="robots">` tag on every emitted alias —
  // and on `dist/index.html` itself — to `noindex,nofollow`. Used by
  // the `/preview/` build so search engines never index a second copy
  // of the app at `https://budget.niclaslindstedt.se/preview/...`.
  noindex?: boolean;
};

const INDEX_ROBOTS_META = `<meta name="robots" content="index,follow,max-image-preview:large" />`;
const NOINDEX_ROBOTS_META = `<meta name="robots" content="noindex,nofollow" />`;

// Mirror `dist/index.html` to `dist/<route>/index.html` after build so
// GitHub Pages can serve the SPA from a clean URL like `/privacy/`
// (returning 200 instead of the 404-fallback shuffle), with the
// homepage SEO block replaced by the route-specific one from
// `src/seo/routes.ts`. Also emits `dist/404.html` — same shell, marked
// noindex — so GitHub Pages' SPA fallback returns a real 404 page
// without leaking soft-404 signals when crawlers guess URLs.
function emitPathAliasWithSeo(
  routes: readonly RouteSeo[],
  opts: EmitOptions = {},
): Plugin {
  return {
    name: "emit-path-alias-with-seo",
    apply: "build",
    closeBundle() {
      const outRoot = resolve(__dirname, "dist");
      const indexPath = resolve(outRoot, "index.html");
      let indexHtml = readFileSync(indexPath, "utf8");

      // Preview build: rewrite the homepage's robots meta so the root
      // alias of the preview tree (`/preview/index.html`) carries
      // `noindex`. The per-route aliases below render their own robots
      // meta via `renderRouteSeo`, but we still post-process them so
      // their `index,follow,...` value flips to `noindex,nofollow`.
      if (opts.noindex) {
        indexHtml = indexHtml.replace(INDEX_ROBOTS_META, NOINDEX_ROBOTS_META);
        writeFileSync(indexPath, indexHtml, "utf8");
      }

      for (const route of routes) {
        const alias = route.path.replace(/^\/|\/$/g, "");
        if (!alias) continue;
        const dir = resolve(outRoot, alias);
        mkdirSync(dir, { recursive: true });
        let html = spliceRouteSeo(indexHtml, route);
        if (opts.noindex) {
          html = html.replace(INDEX_ROBOTS_META, NOINDEX_ROBOTS_META);
        }
        writeFileSync(resolve(dir, "index.html"), html, "utf8");
      }

      const notFound: RouteSeo = {
        path: "/404",
        title: "Not found — Budget",
        description: "The page you requested does not exist on this site.",
        ogType: "website",
        jsonLd: [],
      };
      const notFoundHtml = spliceRouteSeo(indexHtml, notFound).replace(
        INDEX_ROBOTS_META,
        `<meta name="robots" content="noindex,follow" />`,
      );
      writeFileSync(resolve(outRoot, "404.html"), notFoundHtml, "utf8");
    },
  };
}

// Rewrite the static `apple-mobile-web-app-title` meta in `index.html`
// to "Budget pre" for the preview build. iOS shows this string under
// the home-screen icon; without per-slot differentiation, a user who
// installs both `/` and `/preview/` sees two identical "Budget" tiles.
// The rewrite runs in `transformIndexHtml`, which fires before
// vite-plugin-pwa's own head-injection and before the alias-emitting
// `closeBundle` step — so the SEO alias HTMLs inherit the patched
// value automatically.
function patchAppleTitle(): Plugin {
  return {
    name: "patch-apple-mobile-title",
    apply: "build",
    transformIndexHtml(html) {
      if (!IS_PREVIEW) return html;
      return html.replace(
        '<meta name="apple-mobile-web-app-title" content="Budget" />',
        '<meta name="apple-mobile-web-app-title" content="Budget pre" />',
      );
    },
  };
}

// Configure vite-plugin-pwa so the two deploy slots (`/` and
// `/preview/`) install as fully separate apps on a user's device.
// Every identity-bearing field — manifest `id`, `scope`, `start_url`,
// app `name`, Workbox `cacheId` — branches on `IS_PREVIEW`. The two
// service workers register on disjoint scopes (more-specific scope
// wins per the browser's SW dispatch rules); the
// `navigateFallbackDenylist` adds a defensive regex against the
// other slot in case a stale registration ever surprised us.
//
// Update strategy: `autoUpdate` (skipWaiting + clientsClaim on every
// new SW) plus the soft toast in `src/components/UpdateToast.tsx`
// — the toast surfaces a non-blocking "reload to apply" prompt so we
// never refresh mid-edit. The SW activates immediately and controls
// the cache, but the open tab keeps running its old JS until the
// user clicks Reload (or navigates away and back).
function pwaPlugin(): Plugin[] {
  const id = BASE_PATH; // "/" or "/preview/" — W3C app identity
  const name = IS_PREVIEW ? "Budget (preview)" : "Budget";
  const shortName = IS_PREVIEW ? "Budget pre" : "Budget";
  const cacheId = IS_PREVIEW ? "budget-preview" : "budget";

  return VitePWA({
    registerType: "autoUpdate",
    // The React `useRegisterSW` hook handles registration; no auto
    // `<script>` injection.
    injectRegister: null,
    includeAssets: [
      "favicon.svg",
      "favicon.ico",
      "apple-touch-icon-180x180.png",
      "og-default.png",
      "robots.txt",
    ],
    manifest: {
      id,
      scope: BASE_PATH,
      start_url: BASE_PATH,
      name,
      short_name: shortName,
      description:
        "A local-first budget app that keeps your data in your browser.",
      display: "standalone",
      orientation: "any",
      theme_color: "#1d2027",
      background_color: "#1d2027",
      lang: "en",
      categories: ["finance", "productivity"],
      icons: [
        { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
        { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
        {
          src: "maskable-icon-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    workbox: {
      // Precache JS, CSS, fonts, icons, and the prerendered SEO
      // alias HTMLs (`/privacy/`, `/changelog/`, `/system/`,
      // `/404.html`). `globIgnores` keeps source maps and the
      // discovery files out of precache (they're served from the
      // network just fine, and don't need to be available offline).
      globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff2}"],
      globIgnores: ["**/*.map", "robots.txt", "sitemap.xml", "llms.txt"],
      navigateFallback: `${BASE_PATH}index.html`,
      navigateFallbackDenylist: [
        // Defensive: never claim the *other* slot under any
        // circumstance, even if a stale registration somehow had a
        // broader scope. The more-specific-scope-wins rule already
        // handles this; the regex is belt-and-braces.
        IS_PREVIEW ? /^\/(?!preview\/).+/ : /^\/preview\//,
      ],
      cleanupOutdatedCaches: true,
      skipWaiting: true,
      clientsClaim: true,
      cacheId,
    },
    // Dev-mode SW interferes with HMR. Opt in with VITE_PWA_DEV=1
    // when iterating on the toast / registration flow.
    devOptions: {
      enabled: process.env.VITE_PWA_DEV === "1",
      type: "module",
      navigateFallback: `${BASE_PATH}index.html`,
    },
  });
}

// The site is served from the custom domain budget.niclaslindstedt.se
// (see public/CNAME), which is rooted at "/". Production builds set
// `VITE_BASE_PATH=/` (the default); the preview build CI step sets
// `VITE_BASE_PATH=/preview/` so the second build's asset URLs resolve
// under `/preview/assets/...` when both bundles are merged into one
// Pages artifact. If the custom domain is ever removed and the app
// falls back to niclaslindstedt.github.io/budget/, switch the default
// base to "/budget/" for production builds, and update `SITE_URL` in
// `src/seo/siteConfig.ts` so canonicals don't 404.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    emitChangelogData(),
    patchAppleTitle(),
    pwaPlugin(),
    emitPathAliasWithSeo([PRIVACY_ROUTE, CHANGELOG_ROUTE], {
      noindex: IS_PREVIEW,
    }),
  ],
  base: BASE_PATH,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __IS_PREVIEW__: JSON.stringify(IS_PREVIEW),
    __BUILD_LABEL__: JSON.stringify(BUILD_LABEL),
  },
});
