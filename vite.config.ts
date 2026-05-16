import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages serves project sites at /<repo>/, so the base path must
// match the repo name when building for production. Local dev runs at
// "/" so vite serves assets without the prefix.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/budget/" : "/",
}));
