---
name: tune-pwa-icons
description: "Use when the home-screen / launcher / browser-tab icon looks wrong on a real device — too small, off-center, transparent, clipped by iOS rounding, or eaten by an Android mask. Walks an edit / regenerate / inspect loop that uses the Read tool to look at the rasterised PNGs after every change, scored against Apple Human Interface Guidelines and the W3C maskable-icon spec. Also the right skill when adding a new icon size to the generator or restyling the existing artwork. Manual playbook — not part of the `maintenance` umbrella."
---

# Tuning the PWA icon set

The entire icon set is generated from one source SVG
(`public/favicon.svg`) by `@vite-pwa/assets-generator`
(`pwa-assets.config.ts`), then committed to `public/`. The generator
rasterises the SVG with `sharp` / `resvg` — which does **not** behave
exactly like a browser:

- `dominant-baseline` is often silently ignored, so a text glyph
  positioned with `dominant-baseline="central"` ends up in the top
  half of the canvas.
- Web fonts aren't fetched; the rasterizer falls back to whatever
  monospace font is installed in the build container (usually DejaVu
  Sans Mono on Linux). Metrics drift accordingly.
- Transparent regions stay transparent through the pipeline, which
  is what you want for `pwa-*.png` favicons but **not** what you want
  for the apple-touch icon — iOS paints transparent regions white on
  the home screen, which looks like a broken icon.

The cost of getting this wrong is fixed at deploy time (the artwork
ships once with the build and lands on user home screens), so the
skill exists to make "perfect" a few minutes of iteration instead of
guesswork.

## When to invoke

Invoke this skill whenever the home-screen / launcher / browser-tab
icon looks wrong on a real device:

- Too small relative to surrounding icons (the canonical "tiny
  postage stamp on a white square" failure mode).
- Off-centre vertically or horizontally — `dominant-baseline`
  rasterisation quirk, or `text-anchor` mismatched with `x`.
- Transparent / white background on iOS while the rest of the app
  brand expects the dark page background.
- Glyph clipped by iOS's rounded corners (~22.5% radius) because
  it extends to the bleeds.
- Maskable PNG looks fine in a square but loses critical content
  under an Android circle / squircle / teardrop mask.

Also invoke when:

- Adding or removing an icon size from `pwa-assets.config.ts`.
- Restyling the source SVG (new colour, new glyph, new background).
- The `make icons-check` drift guard fails in CI because someone
  edited the source without regenerating.

Do **not** invoke for unrelated visual work (in-app SVGs, the
favicon SVG used directly by browsers without rasterisation, the
`og-default.png` social preview — that one's a different pipeline).

## Pipeline

```
public/favicon.svg
   │
   ▼ npx pwa-assets-generator  (from `make icons`)
   │
   ├─► public/pwa-64x64.png          ← <link rel="icon"> small
   ├─► public/pwa-192x192.png        ← manifest icon
   ├─► public/pwa-512x512.png        ← manifest icon (large)
   ├─► public/maskable-icon-512x512.png  ← manifest, purpose="maskable"
   ├─► public/apple-touch-icon-180x180.png  ← <link rel="apple-touch-icon">
   └─► public/favicon.ico            ← 48px legacy
```

Settings live in `pwa-assets.config.ts` (`minimal2023Preset`). The
manifest icons themselves are referenced from `vite.config.ts`
(`pwaPlugin()` → `manifest.icons`), but the file names are produced
by the preset and don't need editing for routine icon tuning.

`make icons-check` is the CI drift guard — it regenerates into a
temp dir and `cmp`s every output against `public/`. The skill ends
with that target green.

## The iteration loop

The Read tool renders PNGs inline, which is the whole reason this
skill is fast: you can see every iteration without leaving the
session. The loop is short and is meant to be repeated.

1. **Read the current generated PNGs first.** Look at the apple-touch
   and maskable outputs before you change anything — the "wrong"
   you're fixing might be subtler than expected, or already fine on
   one of the two paths.

   ```
   Read public/apple-touch-icon-180x180.png
   Read public/maskable-icon-512x512.png
   Read public/pwa-192x192.png
   ```

2. **Edit `public/favicon.svg`.** Start from one of the templates in
   the "Apple touch icon — what good looks like" / "Maskable icon —
   what good looks like" sections below. Make one targeted change at
   a time (font size, baseline y, background fill, glyph swap); a
   diff that touches several attributes at once makes it hard to
   diagnose which one regressed something.

3. **Regenerate.**

   ```sh
   make icons
   ```

   `make icons` is idempotent — it rewrites every output PNG even
   when nothing changed. Always rerun before reading; otherwise the
   PNG you read still reflects the previous SVG.

4. **Re-read the outputs.** Inspect each one against the quality
   criteria in this skill. Compare apple-touch and maskable side by
   side — they share a source SVG so a change that improves one will
   move the other.

5. **Adjust and repeat.** Usually 2–4 iterations from a clean
   starting template is enough. If you're past 6 iterations on the
   same SVG, the source design probably wants restructuring (convert
   text to `<path>`, add a group transform, drop a problematic font
   stack) rather than another nudge to the same attribute.

6. **Run the drift guard.**

   ```sh
   make icons-check
   ```

   Silent success means the committed PNGs match the SVG. CI runs
   the same target; passing locally is the gate before push.

## Apple touch icon — what good looks like

Apple's [Human Interface Guidelines for app icons][hig-app-icons]
plus the legacy `apple-touch-icon` web rules: iOS uses the PNG you
provide at 180×180 verbatim for home-screen install, rounds the
corners (~22.5% radius "squircle"), and paints **no** background
behind alpha. That gives you these rules:

[hig-app-icons]: https://developer.apple.com/design/human-interface-guidelines/app-icons

| Rule                                                                                  | Why                                                                                                                                                                      |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Opaque, full-bleed background.** Fill the canvas edge-to-edge with a solid colour.  | iOS paints transparent regions white. The dark theme (`#1d2027`) needs an explicit `<rect>` or the icon looks like a broken tile.                                        |
| **Foreground fills 60–80% of the canvas.** Centered.                                  | Below 60% reads as a postage stamp; above 80% gets nibbled by the corner rounding. The surrounding icons on a stock home screen (1Password, BankID, …) sit in this band. |
| **No drop shadows, gloss, or system chrome.** iOS adds rounded corners; that's all.   | Pre-iOS-7 advice (round corners yourself, add gloss) is now wrong — modern iOS double-rounds and double-glosses if you do.                                               |
| **No transparency in the foreground glyph.** Use solid fills, not strokes-on-nothing. | iOS antialiasing on the rounded mask makes semi-transparent edges look fuzzy at common scales.                                                                           |
| **Avoid text other than a single logo glyph or wordmark.**                            | Body text becomes unreadable at the 60×60 scale iOS shows in Spotlight and notifications.                                                                                |

Reference template that the current Budget icon uses:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#1d2027" />
  <text
    x="32"
    y="48"
    text-anchor="middle"
    font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    font-weight="700"
    font-size="50"
    fill="#e5c07b"
  >$</text>
</svg>
```

Notes on this template:

- `y="48"` is the **baseline**, not the centre. For a 50-unit font
  on a 64-unit canvas, the baseline that visually centres a cap-
  height glyph (`$`, `B`, `0`) sits at roughly `32 + 0.35 × 50 ≈ 48.5`.
  Don't rely on `dominant-baseline="central"` — the rasterizer often
  ignores it. Adjust `y` empirically with one or two regeneration
  cycles.
- The `font-size` band that worked here was 48–52. Smaller than 46
  looks like a postage stamp; larger than 54 starts kissing the
  edges and risks corner clipping.
- The background colour matches the manifest `theme_color` and the
  `--page-bg` CSS token in `src/styles.css`. If a future redesign
  retones the app, retone the icon background in the same change so
  the install transition (browser tab → home-screen → splash) stays
  visually continuous.
- The foreground colour is `#e5c07b` (One Dark golden), matching
  the `--accent` token. Same retoning rule applies.

## Maskable icon — what good looks like

Android (and Chromium on every OS) supports manifest icons declared
with `"purpose": "maskable"` per the
[W3C maskable icon spec][maskable-spec]. The launcher composites the
icon under a shape that the OEM / theme picks at runtime (circle,
squircle, teardrop, rounded square, …), so the icon must survive
**any** of those masks.

[maskable-spec]: https://w3c.github.io/manifest/#icon-masks

| Rule                                                                                                                | Why                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Safe zone = centered circle of radius 40% of canvas** (80% diameter).                                             | Every standard Android adaptive-icon mask leaves this zone untouched. Critical content must live entirely inside it.                      |
| **Background bleeds to the edges.**                                                                                 | The OS may pad inward by up to 20%. A square that doesn't reach the edges shows an unintended ring of launcher background around it.      |
| **One PNG per declared purpose.** `purpose: "any"` and `purpose: "maskable"` are different icons even at same size. | A `purpose: "any maskable"` shared icon either has to be ugly when uncropped (too much background) or risks corner clipping when cropped. |
| **Don't ship rounded corners in the source.** The OS mask is the rounding.                                          | Doubled rounding looks like a smaller icon inside the icon.                                                                               |

The Budget pipeline gets this right by reusing the same edge-to-edge
`<rect>` and centring the glyph on `(32, ~48)` — at 50% glyph size,
the `$` fits comfortably inside the 40%-radius safe zone, and the
dark background extends to all four edges so no mask reveals
launcher chrome around it.

When adding new visual content (a sub-glyph, a badge, a tagline)
that needs to survive masking, draw the inner safe-zone circle on a
scratch copy of the SVG and verify each glyph centroid sits inside
it before regenerating:

```svg
<!-- Drop this temporarily into the SVG to visualise the maskable
     safe zone. Remove before committing. -->
<circle cx="32" cy="32" r="25.6" fill="none"
        stroke="#ff00ff" stroke-width="0.5" />
```

## Common pitfalls

The bugs we've actually shipped and rolled back, in roughly
descending order of recurrence:

1. **Transparent SVG, no `<rect>` background.** iOS paints white.
   Always start the SVG with a full-canvas `<rect>` fill.
2. **`dominant-baseline="central"` trusted as a centring primitive.**
   `resvg` and some `sharp` builds ignore it; the glyph lands in the
   top half. Use explicit `y` baseline values calibrated from the
   rasterized PNG.
3. **Font fallback drift in CI.** The build container's default
   monospace font may render the chosen glyph wider / narrower than
   on your laptop, shifting the visual centre. `make icons-check` in
   CI catches the drift only if `make icons` was rerun against the
   container's font set. Easiest fix: convert `<text>` to a `<path>`
   so the rendered shape is font-independent.
4. **Glyph too large.** `font-size` above ~54 (on a 64-unit
   viewBox) extends past the iOS rounded-corner radius and gets
   nibbled at the corners.
5. **Glyph too small.** `font-size` below ~46 reads as a postage
   stamp next to other home-screen apps.
6. **`make icons` not rerun after the SVG edit.** The PNGs on disk
   still reflect the prior SVG; `make icons-check` then catches it
   in CI as drift. Always run `make icons` before reading the PNGs
   and before committing.
7. **Editing one PNG by hand to fix a visual issue.** Don't — the
   drift guard reverts it next CI run. The source of truth is the
   SVG; everything else is generated.

## Quality criteria checklist

Before declaring the icon set "done", walk this list against the
freshly-regenerated files:

- [ ] `apple-touch-icon-180x180.png` has an opaque background that
      matches the manifest `theme_color`.
- [ ] The foreground glyph in apple-touch sits between roughly
      `(15%, 15%)` and `(85%, 85%)` of the canvas — visible margin
      on all four sides, no kissing the edges.
- [ ] The glyph is centred to within a few percent — eyeball it
      against a horizontal and vertical halfway line.
- [ ] `maskable-icon-512x512.png` keeps every foreground pixel
      within the inner 80%-diameter circle.
- [ ] `pwa-64x64.png` is still legible at thumbnail size — the
      glyph is recognisable, not a blob.
- [ ] `favicon.ico` matches (it's auto-derived; usually a smaller
      crop of the 48px favicon path).
- [ ] `make icons-check` exits silently.
- [ ] `make build` succeeds and includes the icons in the precache
      manifest.

## Verification

1. The PNGs in `public/` were regenerated by `make icons`, not
   hand-edited.
2. `make icons-check` produces no output.
3. `make lint`, `make test`, `make build` are still green.
4. The quality-criteria checklist above clears.
5. (Manual) on a real iPhone, the home-screen tile of the deployed
   `/preview/` build looks correct — dark background, prominent
   centred glyph, no kissing of the rounded corners. Apple's
   simulator and Chromium DevTools don't always replicate the
   rounding visually; the real device is the ground truth.

## Skill self-improvement

After a run:

1. If a new rasterizer quirk bit the run (Sharp version bump,
   librsvg behaviour change, new font in CI), add it to **Common
   pitfalls** with the smallest reproducer you have.
2. If the chosen `font-size` / `y` calibration moved, update the
   template in **Apple touch icon — what good looks like** so the
   next contributor starts from current truth.
3. If a new generated size or purpose was added to
   `pwa-assets.config.ts`, extend the **Pipeline** ASCII diagram
   and add a row to the **Quality criteria checklist**.
4. If the manifest `theme_color` / `--page-bg` / `--accent` tokens
   were retoned, update both colour literals in the SVG template
   and call out the link in **Apple touch icon — what good looks
   like** so retones travel atomically.
5. Commit the skill edit alongside the icon edit.
