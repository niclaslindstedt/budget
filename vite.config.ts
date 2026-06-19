import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import pkg from "./package.json" with { type: "json" };
import {
  HOME_ROUTE,
  PRIVACY_ROUTE,
  SHOWCASE_ROUTE,
  resolveNoscriptBody,
  type RouteSeo,
} from "./src/seo/routes";
import {
  DEFAULT_OG_IMAGE,
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  REPO_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  absoluteUrl,
} from "./src/seo/siteConfig";
import { emitChangelogData } from "./vite/changelog-plugin";
import { emitFeatureDocs } from "./vite/feature-docs-plugin";

// Multi-build deploy: production goes at "/", a preview of `main` goes
// at "/preview/", and an optional **stable** branch slot lives at
// "/branch/". The slot's URL never changes — only what's parked in it
// does — so a maintainer can install the `/branch/` PWA once and let
// new dispatches arrive as ordinary SW updates. `pages.yml` invokes
// vite once per slot with different `VITE_BASE_PATH` values and
// merges the resulting `dist/` trees into a single Pages artifact.
// `IS_PREVIEW` flips on for every non-production slot (preview and
// branch), so the gates that already exist — noindex meta,
// goatcounter skip, Dev settings tab — fire for branch builds too.
// Per-slot data isolation goes through `STORAGE_NS`: "" for
// production, "preview" for `/preview/`, "branch" for `/branch/`.
// The branch slot's namespace is stable across feature-branch swaps,
// so the PWA's stored data carries forward — accepting that a branch
// with a breaking schema change will be read by whatever lands next.
const BASE_PATH = process.env.VITE_BASE_PATH || "/";
const IS_PREVIEW = BASE_PATH !== "/";
const IS_BRANCH = BASE_PATH === "/branch/";
const STORAGE_NS = IS_BRANCH
  ? "branch"
  : BASE_PATH === "/preview/"
    ? "preview"
    : "";

// `pages.yml` exposes the source branch ref that produced the build
// via `VITE_BRANCH_SOURCE` so the `/branch/` slot's BUILD_LABEL can
// still reveal which feature branch is currently parked there even
// though the URL is stable. Trimmed and slug-safe-ified for display.
const BRANCH_SOURCE_RAW = process.env.VITE_BRANCH_SOURCE?.trim() ?? "";
const BRANCH_SOURCE_LABEL = BRANCH_SOURCE_RAW.replace(
  /[^a-zA-Z0-9._-]+/g,
  "-",
).slice(0, 20);

// Short build identifier rendered next to the "budget" header on
// the page and suffixed onto the browser-tab title. Shape is
// `<pkg.version>[.<run>][-<suffix>]`, where `<run>` is the
// `GITHUB_RUN_NUMBER` GitHub Actions populates automatically (so
// local builds drop it). `<suffix>` is `pre` for `/preview/`, and
// `br[-<source>]` for `/branch/` (with the source branch name when
// the CI step provides it), omitted for the production `/` slot.
const GITHUB_RUN_NUMBER = process.env.GITHUB_RUN_NUMBER;
const BUILD_SUFFIX = IS_BRANCH
  ? BRANCH_SOURCE_LABEL
    ? `br-${BRANCH_SOURCE_LABEL}`
    : "br"
  : BASE_PATH === "/preview/"
    ? "pre"
    : "";
const BUILD_LABEL =
  pkg.version +
  (GITHUB_RUN_NUMBER ? `.${GITHUB_RUN_NUMBER}` : "") +
  (BUILD_SUFFIX ? `-${BUILD_SUFFIX}` : "");

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
const NOSCRIPT_RE =
  /<!-- NOSCRIPT_START[\s\S]*?-->[\s\S]*?<!-- NOSCRIPT_END -->/;

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
  let next = html.replace(HEAD_SEO_RE, block);

  if (!NOSCRIPT_RE.test(next)) {
    throw new Error(
      "emit-path-alias-with-seo: NOSCRIPT markers missing in " +
        "dist/index.html — cannot splice per-route noscript body. " +
        "Did `index.html` drop the <!-- NOSCRIPT_START --> / " +
        "<!-- NOSCRIPT_END --> pair?",
    );
  }
  const noscript =
    `<!-- NOSCRIPT_START (${route.path}) -->\n        ` +
    resolveNoscriptBody(route) +
    `\n        <!-- NOSCRIPT_END -->`;
  next = next.replace(NOSCRIPT_RE, noscript);

  return next;
}

function buildDateIso(): string {
  // YYYY-MM-DD in UTC — `lastmod` only needs day-level precision and
  // the sitemap spec allows the date-only ISO 8601 form.
  return new Date().toISOString().slice(0, 10);
}

function renderSitemap(routes: readonly RouteSeo[]): string {
  const lastmod = buildDateIso();
  const entries = routes
    .filter(
      (r): r is RouteSeo & { sitemap: NonNullable<RouteSeo["sitemap"]> } =>
        Boolean(r.sitemap),
    )
    .map((r) => {
      const loc = escapeHtmlText(absoluteUrl(r.path));
      const priority = r.sitemap.priority.toFixed(1);
      return [
        `  <url>`,
        `    <loc>${loc}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${r.sitemap.changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        `  </url>`,
      ].join("\n");
    })
    .join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    entries,
    `</urlset>`,
    ``,
  ].join("\n");
}

function renderLlmsTxt(routes: readonly RouteSeo[]): string {
  // Wrap to roughly the same column the existing public/llms.txt
  // used (~72 chars). The description blurb stays one line; bullet
  // bodies are short enough that we leave them unwrapped.
  const lines: string[] = [];
  lines.push(`# ${SITE_NAME}`);
  lines.push("");
  lines.push(`> ${SITE_DESCRIPTION}`);
  lines.push("");
  lines.push("## Pages");
  lines.push("");
  for (const r of routes) {
    const url = absoluteUrl(r.path);
    lines.push(`- [${r.title}](${url}): ${r.description}`);
  }
  lines.push("");
  lines.push("## Source");
  lines.push("");
  lines.push(
    `- [README](${REPO_URL}#readme): features, install, and configuration.`,
  );
  lines.push(
    `- [GitHub repository](${REPO_URL}): MIT-licensed local-first PWA ` +
      `built with React, Vite, and TypeScript — source, issues, releases.`,
  );
  lines.push("");
  return lines.join("\n");
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
//
// `routes` are the non-home aliases that get their own
// `dist/<alias>/index.html`. The home route is handled in-place on
// `dist/index.html` (vite emits it from `index.html`) and only
// participates in sitemap / llms.txt generation.
function emitPathAliasWithSeo(
  home: RouteSeo,
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

      // Sitemap + llms.txt are discovery surfaces aimed at production
      // crawlers only. The preview build's `noindex,nofollow` already
      // keeps it out of the index, and there's no value in advertising
      // staging URLs to LLMs either — skip both files when the slot is
      // the preview build.
      if (!opts.noindex) {
        const allRoutes = [home, ...routes];
        writeFileSync(
          resolve(outRoot, "sitemap.xml"),
          renderSitemap(allRoutes),
          "utf8",
        );
        writeFileSync(
          resolve(outRoot, "llms.txt"),
          renderLlmsTxt(allRoutes),
          "utf8",
        );
      }
    },
  };
}

// Rewrite the static `apple-mobile-web-app-title` meta in `index.html`
// for non-production slots. iOS shows this string under the
// home-screen icon; without per-slot differentiation, a user who
// installs `/`, `/preview/`, and `/branch/` would see identical
// "Budget" tiles. Preview becomes "Budget pre"; the branch slot
// becomes "Budget br" (stable across feature-branch swaps so the
// installed tile keeps the same label every time a fresh ref is
// parked). The rewrite runs in `transformIndexHtml`, which fires
// before vite-plugin-pwa's own head-injection and before the
// alias-emitting `closeBundle` step — so the SEO alias HTMLs inherit
// the patched value automatically.
function patchAppleTitle(): Plugin {
  return {
    name: "patch-apple-mobile-title",
    apply: "build",
    transformIndexHtml(html) {
      if (!IS_PREVIEW) return html;
      const suffix = IS_BRANCH ? "br" : "pre";
      return html.replace(
        '<meta name="apple-mobile-web-app-title" content="Budget" />',
        `<meta name="apple-mobile-web-app-title" content="Budget ${suffix}" />`,
      );
    },
  };
}

// Strip the legacy `woff` fallback from fontsource's `@font-face`
// rules. Each fontsource subset CSS ships `src: url(...woff2)
// format('woff2'), url(...woff) format('woff')`; every browser this
// PWA targets supports woff2 (it requires service workers), so the
// woff copy is never fetched — it would only be emitted into `dist/`
// as dead weight (~850 KB across all families before this). Running as
// an `enforce: "pre"` transform means the woff `url()` is gone before
// Vite's CSS plugin resolves it, so the file is never emitted at all.
function stripWoffFallback(): Plugin {
  return {
    name: "strip-woff-fallback",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("@fontsource") || !id.endsWith(".css")) return null;
      const stripped = code.replace(
        /,\s*url\([^)]+\)\s*format\((['"])woff\1\)/g,
        "",
      );
      return stripped === code ? null : { code: stripped, map: null };
    },
  };
}

// Inject a GoatCounter page-view tracker into the deployed HTML
// when `VITE_GOATCOUNTER_ENDPOINT` is set AND this is the production
// slot (`VITE_BASE_PATH === "/"`). The preview slot is deliberately
// skipped — it is `noindex,nofollow` and effectively only the
// maintainer visits it, so analytics there would pollute stats with
// self-traffic. Local dev never runs build plugins, so `make dev`
// is also tracker-free regardless of `.env.local`.
//
// The `<script>` tag goes immediately before `</head>`, which is
// AFTER `<!-- HEAD_SEO_END -->`, so the per-route splicer in
// `emitPathAliasWithSeo` propagates it untouched into every alias
// HTML it emits (`/privacy/index.html`, `/404.html`).
function injectGoatcounter(): Plugin {
  return {
    name: "inject-goatcounter",
    apply: "build",
    transformIndexHtml(html) {
      const endpoint = process.env.VITE_GOATCOUNTER_ENDPOINT?.trim();
      if (!endpoint || IS_PREVIEW) return html;
      const tag =
        `<script data-goatcounter="${escapeHtmlAttr(endpoint)}" ` +
        `async src="https://gc.zgo.at/count.js"></script>`;
      return html.replace("</head>", `    ${tag}\n  </head>`);
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
// Update strategy: `prompt` — a new SW installs and sits in the
// `waiting` state until the user opts in via the soft toast in
// `src/components/UpdateToast.tsx`. The toast registers the SW
// itself with `updateViaCache: "none"` so update checks bypass the
// HTTP cache (vite-plugin-pwa's auto-injected `useRegisterSW`
// doesn't forward that option to Workbox, and without it Chrome's
// own HTTP cache can serve a stale `sw.js` back to the update check
// for up to 24h after the cached SW). The Reload button posts
// `SKIP_WAITING` to the waiting SW and reloads the page once it
// activates. We deliberately do NOT set `skipWaiting` /
// `clientsClaim` in the workbox config: with those flags the new SW
// activates immediately, the `waiting` state is never observed, the
// toast never renders, and the page silently runs old JS until the
// next full navigation.
// Emit a tiny `version.json` carrying this build's BUILD_LABEL into the
// slot root (`/version.json`, `/preview/version.json`, …). The running
// page knows only its OWN BUILD_LABEL, so the update toast can't name
// the *incoming* build from anything in the loaded bundle. It fetches
// this file (cache-bypassed) when the workbox `waiting` event fires to
// learn the version it's about to upgrade to. Deliberately kept out of
// precache (`json` isn't in `workbox.globPatterns`, and no runtime
// route matches it) so the active SW lets the fetch reach the network
// and return the freshly-deployed file, not a cached copy.
function emitVersionJson(): Plugin {
  return {
    name: "emit-version-json",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ version: BUILD_LABEL })}\n`,
      });
    },
  };
}

// Emit a `precache-manifest.json` listing every asset the service
// worker precaches and its on-disk byte size, plus the total. The
// running app fetches it (cache-bypassed, like `version.json`) when a
// new SW starts installing, so it can turn "files added to the precache
// cache so far" into a real percentage and fill the "budget" header
// like a glass of water while the update downloads. See
// `src/hooks/usePwaUpdate.ts` for the consumer.
//
// The list is read back out of the generated `dist/sw.js`
// (vite-plugin-pwa inlines the workbox precache manifest there as
// `precacheAndRoute([{url,revision},...])`) rather than re-globbing
// `dist/` ourselves, so the denominator matches exactly what workbox
// actually precaches — globIgnores, the SW files, and on-demand chunks
// all already filtered out. Keys are the request *pathnames* the
// browser stores in the precache cache (`<base><url>`); the consumer
// compares cache entries by pathname, which sidesteps the
// `?__WB_REVISION__=` query workbox appends to revisioned entries.
//
// Runs in `closeBundle` after `pwaPlugin()` has written `sw.js`, and
// the emitted JSON lands after the workbox glob ran, so it is itself
// left out of precache — exactly like `version.json`.
function emitPrecacheManifest(): Plugin {
  return {
    name: "emit-precache-manifest",
    apply: "build",
    // `vite-plugin-pwa` is `enforce: "post"` and writes `dist/sw.js` in
    // its own `closeBundle`; match its enforce and sit last in the
    // plugins array so this runs after the SW exists.
    enforce: "post",
    closeBundle() {
      const outRoot = resolve(__dirname, "dist");
      const swPath = resolve(outRoot, "sw.js");
      let sw: string;
      try {
        sw = readFileSync(swPath, "utf8");
      } catch {
        // No generated SW (e.g. PWA disabled) — nothing to measure.
        return;
      }
      const callIdx = sw.indexOf("precacheAndRoute([");
      if (callIdx === -1) return;
      const arrStart = sw.indexOf("[", callIdx);
      const arrEnd = sw.indexOf("}]", arrStart);
      if (arrStart === -1 || arrEnd === -1) return;
      const arr = sw.slice(arrStart, arrEnd + 2);
      const urls = [...arr.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);

      // Assets in `includeAssets` (icons / favicons) appear twice in the
      // precache manifest — once explicitly, once via `globPatterns` —
      // but resolve to a single cache entry, so key by pathname and let
      // the map dedupe both the entry and its byte contribution.
      const assets: Record<string, number> = {};
      for (const url of urls) {
        // Cache keys resolve `url` against the SW scope (`BASE_PATH`),
        // so the stored pathname is `<base><url>` with no double slash.
        const path = BASE_PATH + url.replace(/^\//, "");
        if (path in assets) continue;
        try {
          assets[path] = statSync(resolve(outRoot, url)).size;
        } catch {
          // Listed in the manifest but absent on disk — skip it.
        }
      }
      const totalBytes = Object.values(assets).reduce((a, b) => a + b, 0);

      writeFileSync(
        resolve(outRoot, "precache-manifest.json"),
        `${JSON.stringify({ totalBytes, assets })}\n`,
        "utf8",
      );
    },
  };
}

function pwaPlugin(): Plugin[] {
  // W3C app identity is BASE_PATH — distinct per slot ("/",
  // "/preview/", "/branch/") so each install registers as its own
  // app. The branch slot's identity is stable across feature-branch
  // swaps: a fresh ref parked in /branch/ arrives as a new SW build,
  // not a new app, so the installed tile and its data stay put.
  const id = BASE_PATH;
  const name = IS_BRANCH
    ? "Budget (branch)"
    : BASE_PATH === "/preview/"
      ? "Budget (preview)"
      : "Budget";
  const shortName = IS_BRANCH
    ? "Budget br"
    : BASE_PATH === "/preview/"
      ? "Budget pre"
      : "Budget";
  const cacheId = IS_BRANCH
    ? "budget-branch"
    : BASE_PATH === "/preview/"
      ? "budget-preview"
      : "budget";

  // Belt-and-braces denylist alongside the W3C scope rule: never
  // claim navigation fallbacks outside this slot, even if a stale
  // registration ever had a broader scope.
  //
  // The slot patterns must also match the slash-less `/preview` /
  // `/branch` spellings: GitHub Pages 301-redirects those to the
  // trailing-slash URL, but the production SW (scope `/`) intercepts
  // the navigation before the network, so a denylist that only knows
  // `/preview/` serves the production index.html at `/preview` and
  // the user lands in the production app at the preview URL. Workbox
  // tests these against `url.pathname + url.search`, hence the `\?`
  // alternative.
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const navigateFallbackDenylist =
    BASE_PATH === "/"
      ? [/^\/preview(?:\/|\?|$)/, /^\/branch(?:\/|\?|$)/]
      : [new RegExp(`^/(?!${escapeRegex(BASE_PATH.slice(1))})`)];

  return VitePWA({
    registerType: "prompt",
    // `UpdateToast` registers the SW itself via `workbox-window`
    // (so it can pass `updateViaCache: "none"`); no auto `<script>`
    // injection.
    injectRegister: null,
    includeAssets: [
      "favicon.svg",
      "favicon-mark.svg",
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
      // alias HTMLs (`/privacy/`, `/home/`, `/404.html`).
      // `globIgnores` keeps source maps and the discovery files out
      // of precache (they're served from the network just fine, and
      // don't need to be available offline). The pdf.js chunks
      // (`pdf-*.js` + `pdf.worker.min-*.mjs`) are also excluded: pdf.js
      // is dynamically imported only when a PDF attachment is opened, so
      // precaching its ~1.7 MB would make every install / SW update pay
      // for a feature most sessions never touch. They load on demand and
      // the browser HTTP-caches them after first use.
      //
      // The non-default webfont families (Inter, Source Serif 4,
      // OpenDyslexic) get the same treatment: they load on demand from
      // `src/utils/fonts.ts` only when the user selects or previews one,
      // so precaching their woff2 would make every install pay for faces
      // most sessions never render (OpenDyslexic alone is ~230 KB). Only
      // the default JetBrains Mono woff2 stays precached for offline
      // first paint; the others HTTP-cache on first use.
      globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff2}"],
      globIgnores: [
        "**/*.map",
        "robots.txt",
        "sitemap.xml",
        "llms.txt",
        "**/pdf*.{js,mjs}",
        "**/inter-*.woff2",
        "**/source-serif-4-*.woff2",
        "**/opendyslexic-*.woff2",
      ],
      navigateFallback: `${BASE_PATH}index.html`,
      navigateFallbackDenylist,
      cleanupOutdatedCaches: true,
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
    emitFeatureDocs(),
    stripWoffFallback(),
    patchAppleTitle(),
    injectGoatcounter(),
    emitVersionJson(),
    pwaPlugin(),
    emitPathAliasWithSeo(HOME_ROUTE, [PRIVACY_ROUTE, SHOWCASE_ROUTE], {
      noindex: IS_PREVIEW,
    }),
    // After pwaPlugin so `dist/sw.js` exists to be measured.
    emitPrecacheManifest(),
  ],
  base: BASE_PATH,
  build: {
    rollupOptions: {
      output: {
        // Split a stable vendor chunk for the React runtime. React and
        // react-dom change rarely between releases, so pinning them in
        // their own content-hashed chunk keeps that hash stable across
        // app updates — a returning user re-downloads only the app code
        // that actually changed, not the whole framework, instead of
        // busting one monolithic `index-*.js` on every deploy.
        advancedChunks: {
          groups: [
            {
              name: "react-vendor",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __IS_PREVIEW__: JSON.stringify(IS_PREVIEW),
    __BUILD_LABEL__: JSON.stringify(BUILD_LABEL),
    __STORAGE_NS__: JSON.stringify(STORAGE_NS),
    __DEV_SEED__: JSON.stringify(process.env.VITE_DEV_SEED === "1"),
  },
});
