import {
  defineConfig,
  minimal2023Preset as preset,
} from "@vite-pwa/assets-generator/config";

// Drives @vite-pwa/assets-generator. Source: public/favicon.svg.
// Output (committed): public/pwa-{64,192,512,maskable-512}.png and
// public/apple-touch-icon-180.png. Both the prod / preview manifests
// reference the same icon bytes — the slot differentiation is in the
// manifest `id` / `scope` / `name`, not in the artwork.
//
// We override `apple` and `maskable` from `minimal2023Preset`: the
// preset's defaults bake a 30% white border around the SVG, which iOS
// renders as a white frame on the home-screen tile and Android reveals
// under launcher masks. The SVG already paints `#1d2027` edge-to-edge
// (matches `manifest.theme_color`), so:
//   - apple: padding 0, dark background → full-bleed dark tile, iOS
//     just rounds the corners.
//   - maskable: padding 0.1, dark background → glyph sits comfortably
//     inside the W3C 80%-diameter safe zone while the dark colour
//     bleeds to all four edges so no Android mask reveals launcher
//     chrome.
const THEME_BACKGROUND = "#1d2027";

export default defineConfig({
  preset: {
    ...preset,
    apple: {
      ...preset.apple,
      padding: 0,
      resizeOptions: { fit: "contain", background: THEME_BACKGROUND },
    },
    maskable: {
      ...preset.maskable,
      padding: 0.1,
      resizeOptions: { fit: "contain", background: THEME_BACKGROUND },
    },
  },
  images: ["public/favicon.svg"],
});
