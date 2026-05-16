import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The site is served from the custom domain budget.niclaslindstedt.se
// (see public/CNAME), which is rooted at "/". If the custom domain is
// ever removed and the app falls back to niclaslindstedt.github.io/budget/,
// switch base to "/budget/" for production builds.
export default defineConfig({
  plugins: [react()],
  base: "/",
});
