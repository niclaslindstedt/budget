import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Mirror `dist/index.html` to `dist/<alias>/index.html` after build so
// GitHub Pages can serve the SPA from a clean URL like `/privacy/`
// (returning 200 instead of the 404-fallback shuffle). The SPA reads
// `window.location.pathname` and picks the right view to mount.
function emitPathAlias(...aliases: readonly string[]): Plugin {
  return {
    name: "emit-path-alias",
    apply: "build",
    closeBundle() {
      const outRoot = resolve(__dirname, "dist");
      for (const alias of aliases) {
        const dir = resolve(outRoot, alias);
        mkdirSync(dir, { recursive: true });
        copyFileSync(
          resolve(outRoot, "index.html"),
          resolve(dir, "index.html"),
        );
      }
    },
  };
}

// The site is served from the custom domain budget.niclaslindstedt.se
// (see public/CNAME), which is rooted at "/". If the custom domain is
// ever removed and the app falls back to niclaslindstedt.github.io/budget/,
// switch base to "/budget/" for production builds.
export default defineConfig({
  plugins: [react(), tailwindcss(), emitPathAlias("privacy")],
  base: "/",
});
