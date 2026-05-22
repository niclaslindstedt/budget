import {
  defineConfig,
  minimal2023Preset as preset,
} from "@vite-pwa/assets-generator/config";

// Drives @vite-pwa/assets-generator. Source: public/favicon.svg.
// Output (committed): public/pwa-{64,192,512,maskable-512}.png and
// public/apple-touch-icon-180.png. Both the prod / preview manifests
// reference the same icon bytes — the slot differentiation is in the
// manifest `id` / `scope` / `name`, not in the artwork.
export default defineConfig({
  preset,
  images: ["public/favicon.svg"],
});
