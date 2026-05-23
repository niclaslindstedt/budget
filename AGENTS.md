# AGENTS.md

Guidance for AI coding agents working on this repository. This file is
the single source of truth for agent guidance — tool-specific guidance
files (`CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`,
`.github/copilot-instructions.md`) are symlinks pointing here (see
`OSS_SPEC.md` §7.1).

## What this project is

`budget` — a local-first budget app built with Vite, React 18, and
TypeScript. The built output is a static site deployed to GitHub Pages
via `.github/workflows/pages.yml`. There is no backend, no account, no
sync service: persistent state lives in `localStorage`, and the user
can export / import it as a JSON file for portability.

The first piece of UI is a spreadsheet-style sheet with typed columns
(date, description, amount, balance, completed), draggable column
headers, auto-sizing columns capped by `MAX_COLUMN_CHARS`, a derived
running balance, and one table per month. Persistent state lives
under the `localStorage` key `budget.v1`.

## Vision

The current feature surface is small but the data model and module
boundaries assume the following will land later — design and review
new code with these in mind, even if the immediate change is narrow:

- **Multiple sheets.** Users can add, name, switch between, and
  reorder sheets. The active sheet is part of the persisted state.
- **Sheet types.** Beyond the default transactional ledger: budget
  planning, loan tracking, savings forecasts, parental-leave (Sweden)
  planning, and similar planners. Each type is a sheet flavour with
  its own columns, computed cells, and (where useful) charts.
- **Multiple accounts.** Sheets can belong to a named account so
  balances and forecasts can be computed per account, then rolled up.
- **Import / export.** A JSON file format with a `version` field,
  forward-only migrations, and round-trip safety with localStorage.
  See `src/storage/file.ts` (planned).
- **User options.** Per-sheet column visibility, max column width,
  currency, locale, week-starts-on, etc. Stored alongside the budget.
- **Forecasting and planners.** Pure functions in
  `src/data/forecasting/` consumed by sheet-type components. No
  network calls; all logic runs locally.

The local-first, no-backend invariant holds throughout — none of the
above introduces a server, an account, or a third-party service.
Anything that would needs an explicit spec change.

When introducing a new abstraction, prefer shapes that scale to the
list above (e.g. `Sheet.type`, columns keyed by id so future column
kinds slot in, opening balance modelled per-sheet so per-account roll
ups are mechanical). Do not pre-implement these features — only make
the design accommodate them.

## Build and test commands

Prefer `make` targets over raw `npm run` commands so local and CI stay
in sync:

| Command              | What it does                                                |
| -------------------- | ----------------------------------------------------------- |
| `make install`       | `npm ci`                                                    |
| `make dev`           | Start the Vite dev server                                   |
| `make build`         | Type-check and produce a production build                   |
| `make preview`       | Preview the production build locally                        |
| `make lint`          | ESLint + TypeScript type-check                              |
| `make typecheck`     | `tsc -b --noEmit` only                                      |
| `make fmt`           | Prettier rewrite in place                                   |
| `make fmt-check`     | Prettier check without writing                              |
| `make test`          | Vitest suite                                                |
| `make e2e`           | Playwright suite against the `/preview/` build              |
| `make e2e-install`   | Install the Chromium browser Playwright drives              |
| `make preview-build` | Build `dist/` with `VITE_BASE_PATH=/preview/`               |
| `make preview-serve` | `preview-build` + serve at `http://localhost:4173/preview/` |
| `make icons`         | Regenerate the PWA icon set from `public/favicon.svg`       |
| `make icons-check`   | CI drift guard — fail if `make icons` would change anything |
| `make clean`         | Remove `dist/` and Vite cache                               |

CI runs on every push and pull request:

- **CI** (`.github/workflows/ci.yml`) — `make fmt-check`, `make lint`,
  `make build`, `make icons-check`, `make test`.
- **Preview** (`.github/workflows/preview.yml`) — runs the Playwright
  end-to-end suite (`e2e/`) against a local `/preview/` build on
  every push to `main`. The release workflow chains into it via
  `workflow_call`, so a red preview run stops a tag before any
  commit / GitHub Release lands.

Deployment runs separately in **Pages**
(`.github/workflows/pages.yml`) on every push to `main`.

## Architecture summary

```
src/
├── main.tsx              # React 18 entry, mounts <App /> into #root
├── App.tsx               # thin auth state machine + storage hookup
├── styles.css            # global styles + sheet layout
├── components/
│   ├── BudgetView.tsx    # main editor — owns the budget reducer, modal state, and every handler
│   ├── SheetView.tsx     # one sheet — month grouping + opening balance
│   ├── MonthTable.tsx    # one month's table (header + rows + add row)
│   ├── ColumnHeader.tsx  # draggable column header (HTML5 drag-and-drop)
│   ├── Cell.tsx          # per-type cell editor (date/text/number/check)
│   ├── Modal.tsx         # compound shell for every modal dialog
│   ├── FloatingPanel.tsx # portalled dropdown shell for pickers
│   ├── ColorPalette.tsx  # circular color-swatch grid
│   ├── GlyphGrid.tsx     # 8-column icon-button grid
│   ├── UpdateToast.tsx   # PWA "new build, click to reload" prompt
│   └── cells/            # readonly cell variants + shared classes
├── data/
│   ├── types.ts          # Budget, Sheet, Column, Row, CellValue
│   ├── constants.ts      # MAX_COLUMN_CHARS, STORAGE_KEY
│   └── sheet.ts          # pure helpers (group, sort, balances, reorder)
├── hooks/
│   ├── useChangelogAutoOpen.ts # gate the "What's new" popup per APP_VERSION
│   ├── useEscapeKey.ts          # close-on-Escape listener
│   ├── useIdleSignOut.ts        # activity tracker + session re-stamp + sign-out warning
│   ├── usePointerOutside.ts     # close-on-outside-click listener
│   └── useFloatingPosition.ts   # anchor a float to a trigger element
├── storage/
│   ├── adapter.ts             # StorageAdapter interface + ConflictError
│   ├── boot-auth.ts           # `readBootAuth` + `AuthState` resolved from session + users registry
│   ├── local-adapter.ts       # localStorage adapter (id "browser")
│   ├── folder-adapter.ts      # File System Access adapter (id "folder")
│   ├── folder-handle-store.ts # IDB persistence + permission helpers for the folder handle
│   ├── dropbox-adapter.ts     # Dropbox HTTP adapter + OAuth (PKCE)
│   ├── gdrive-adapter.ts      # Google Drive HTTP adapter + OAuth (PKCE)
│   ├── oauth-pkce.ts          # Shared PKCE helpers (verifier, challenge)
│   ├── encrypting-adapter.ts  # AES-GCM envelope wrapper around any adapter
│   └── backend-preference.ts  # Per-user backend choice + cloud tokens
├── i18n/
│   ├── index.ts               # LanguageProvider, useT(), typed `t()`,
│   │                          #   plural() helper, MessageKey type
│   ├── LanguageRoot.tsx       # Top-level provider mounted by main.tsx;
│   │                          #   listens for `budget:language` events
│   ├── locale.ts              # Lang type, bcp47(), detectInitialLanguage()
│   ├── language-preference.ts # Plaintext localStorage mirror so pre-auth
│   │                          #   and standalone routes pick up the choice
│   └── locales/
│       ├── en.ts              # Canonical English catalog. The `Catalog`
│       │                      #   type widens this so `sv.ts` is enforced
│       └── sv.ts              # Swedish; typed against `Catalog` so missing
│                              #   keys are compile errors
├── utils/
│   ├── date.ts                # `todayIso`, `addMonthsIso` (pure date helpers)
│   ├── format.ts              # `formatNumber`, `withCurrency`, lang-aware month names
│   ├── semver.ts              # `cmpSemver` for changelog gating
│   └── …                       # logger, download, xlsx, scroll-lock, build-env
└── seo/
    ├── siteConfig.ts          # SITE_URL, SITE_NAME, AUTHOR, OG defaults
    └── routes.ts              # per-route <title> / description / JSON-LD
```

Dependency direction: `components/` depend on `data/` and `storage/`.
Nothing in `data/` or `storage/` imports from `components/`. Keep it
that way.

## Where new code goes

| Change                                  | Location                                                                                                                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New UI section / page                   | `src/components/<Name>.tsx` + wire into `src/App.tsx`                                                                                                                                                                              |
| Reusable React hook                     | `src/hooks/<useFoo>.ts` (re-exported from `src/hooks/index.ts`)                                                                                                                                                                    |
| Persisted-data shape changes            | `src/data/` (add types + a migration if needed)                                                                                                                                                                                    |
| Read/write to `localStorage`            | `src/storage/local.ts`                                                                                                                                                                                                             |
| Export / import file format             | `src/storage/file.ts`                                                                                                                                                                                                              |
| Vite config (base path, plugins)        | `vite.config.ts`                                                                                                                                                                                                                   |
| Vite plugin (build-time codegen)        | `vite/<plugin>.ts` (in `tsconfig.node.json`'s scope, not `src/`)                                                                                                                                                                   |
| Build-time generated TS                 | `src/generated/` (gitignored; rebuilt by a `vite/*.ts` plugin)                                                                                                                                                                     |
| New persisted storage key               | Route through `nsKey` / `nsCloudPath` / `nsIdbName` in `src/data/constants.ts`                                                                                                                                                     |
| SEO copy / per-route head               | `src/seo/siteConfig.ts`, `src/seo/routes.ts`                                                                                                                                                                                       |
| Site-wide discovery files               | `public/robots.txt`, `public/og-default.png` (static). `sitemap.xml` and `llms.txt` are generated at build time from `src/seo/routes.ts` + `src/seo/siteConfig.ts` — edit the routes table, not the output files.                  |
| PWA manifest / service-worker config    | `vite.config.ts` (`pwaPlugin()`); `public/` (icons generated from `public/favicon.svg` via `make icons`). See "Service-worker rollout invariants" below.                                                                           |
| ESLint rules, TS config                 | `eslint.config.js`, `tsconfig.app.json`                                                                                                                                                                                            |
| New `make` target                       | `Makefile` + the README Usage table + `ci.yml`                                                                                                                                                                                     |
| Changelog fragment (user-affecting PRs) | `.changes/unreleased/<unix-ts>-<slug>.md`                                                                                                                                                                                          |
| Release / changelog tooling             | `scripts/release/*.mjs` (collator, extractor, PR check)                                                                                                                                                                            |
| New user-facing string                  | `src/i18n/locales/en.ts` (canonical) + `src/i18n/locales/sv.ts` (Swedish). See "Translations" below.                                                                                                                               |
| New language                            | `src/i18n/locale.ts` (`Lang` union, `bcp47`, `detectInitialLanguage`), `src/i18n/locales/<code>.ts`, `src/data/constants.ts` (`SUPPORTED_LANGUAGES`), `src/components/LanguagePicker.tsx` (flag button). See "Translations" below. |
| New end-to-end test (common flow)       | `e2e/specs/<name>.spec.ts` — exercises a user journey through the `/preview/` build. See "End-to-end tests" below.                                                                                                                 |
| Regression test for a shipped bug       | `e2e/regression/<slug>.spec.ts` — confirms the bug then locks in the fix. See `e2e/regression/README.md`.                                                                                                                          |

## Conventions

- **TypeScript strict mode is on** (`tsconfig.app.json`: `strict`,
  `noUnusedLocals`, `noUnusedParameters`). Don't disable these.
- **React function components only**, named exports, prop types
  declared inline as a `type Props = { … }`.
- **Prettier** (`.prettierrc.json`) owns formatting — double quotes,
  semicolons, trailing commas, 80-column width. Run `make fmt` before
  pushing.
- **Imports**: relative paths, no path aliases. External packages
  first, then relative, separated by a blank line.
- **Commit style**: Conventional Commits (`feat:`, `fix:`, `chore:`,
  …) per `OSS_SPEC.md` §8.1.
- **Visual style**: monospaced face, One Dark / One Light palette, and
  a few syntax-coloured accents for sheet content (dates, amounts,
  completion). That is the whole "terminal" budget — don't dress
  modals, form labels, headers, or buttons up as a CLI. No `$` prompts
  in modal titles, no `--flag`-style field labels, no `command --flag`
  headings. Modal titles are plain sentences ("New entry", "Delete
  row"); form labels are plain words ("Description", "Amount"). The
  `text-flag` / `text-path` / `text-pipe` utilities exist for sheet
  cells and similar data tokens, not for chrome.
- **Theming and tokens.** The Appearance settings tab lets users pick
  Dark / Light / System / Custom themes plus a font family; the
  Custom theme also exposes radius, density, border width, and a
  reduce-motion toggle. The runtime (see `src/hooks/useTheme.ts`)
  writes the user's choice as CSS custom properties on `<html>`, so
  **every new colour, border-radius, transition, animation,
  font-family declaration, and border thickness must read through a
  CSS variable — never a hardcoded literal.** Anything baked in as a
  magic value silently ignores the user's Custom theme.
  - **Colours** → use the existing tokens (`--page-bg`, `--surface`,
    `--surface-2`, `--surface-3`, `--fg`, `--fg-bright`, `--muted`,
    `--line`, `--accent`, `--meta`, `--link`, `--path`, `--flag`,
    `--pipe`, `--danger`, `--success`, `--positive`, `--negative`).
    Add a new token to `:root` and mirror it in every palette block
    (dark / light / system) before reaching for a fresh hex literal.
    Then map it into Tailwind's utility surface via `@theme inline`
    so `bg-foo` / `text-foo` work.
  - **Border-radius** → Tailwind's bare `.rounded` is remapped to
    `var(--radius-sm)` and `.rounded-sm` / `.rounded-md` / `.rounded-lg`
    resolve through `var(--radius-*)` by default, so the whole bare-
    `rounded` surface follows the Custom-theme radius preset
    automatically. Reach for `.rounded-full` (or `.rounded-none`) when
    a surface should keep its shape regardless of theme. `.field-input`
    has its own dedicated rule pinned to `var(--radius-md)`. When
    widening the reach further (e.g. opting more sized variants into
    `--radius-*` instead of Tailwind's), update the comment block near
    the end of `src/styles.css` so the surface area stays discoverable.
  - **Font family** → `var(--app-font-family)`, set by the
    `useTheme` hook from `settings.fontFamily`. Component-specific
    stacks are fine only when the deviation is the point (e.g. a
    font-preview row that shows each option in its own face).
  - **Border thickness** → Tailwind's bare `.border` and
    `.border-{t,r,b,l}` are remapped to `var(--border-width)` so the
    default chrome surface follows the Custom-theme preset. Explicit
    `.border-0` / `.border-2` (and equivalent side-pinned variants)
    stay literal — reach for those when a surface should keep its
    weight regardless of theme (status indicators, accent strips).
  - **Transitions / animations** → must respect
    `[data-reduce-motion="true"]`. The unlayered rule at the bottom
    of `src/styles.css` short-circuits every `transition-duration` /
    `animation-duration` to 0ms when the attribute is set. Don't
    write `transition-duration: 200ms !important` without gating it
    on `:root:not([data-reduce-motion="true"])` — bypassing the
    guard silently overrides the user's accessibility choice.
- **Always use custom dropdowns.** Never reach for the native
  `<select>` / `<option>` elements — the browser renders them with the
  OS's own widget, which breaks the monospaced One Dark / One Light
  look and feel and looks especially out-of-place on mobile (see the
  iOS wheel picker). Build a button + listbox in the project style
  instead — model new pickers on `TypePicker` / `AccountPicker` in
  `src/components/SheetModal.tsx` or `CategoryPicker` in
  `src/components/CategoryPicker.tsx` (use the latter's portal pattern
  when the dropdown lives in a tight cell or could overflow its
  container). Apply the same rule when refactoring older code: if you
  touch a screen that still has a native `<select>`, replace it.
- **No hardcoded user-facing strings.** Every visible string —
  button labels, `placeholder`, `aria-label`, `title`, modal titles,
  toast messages — goes through `t("section.key")` from
  `useT()`. The two catalogs in `src/i18n/locales/{en,sv}.ts` are
  the source of truth; the `Catalog` type widens English so Swedish
  is enforced at compile time. See the "Translations" section below
  for the full workflow. Date / month rendering goes through the
  `lang`-aware helpers in `src/utils/format.ts` so calendar text
  follows the picker too.
- **Modal layout — fullscreen vs centered.** `Modal` defaults to
  edge-to-edge `100svh` on mobile (centered card on desktop) so its
  iOS visual-viewport math can keep the footer above the soft
  keyboard. Pass `centered` (see `src/components/Modal.tsx`) to render
  a centered card on every viewport size instead. **The rule:** if the
  modal contains no inputs that open the soft keyboard — no
  `<input type="text">` / `inputMode="decimal"` / `<textarea>` /
  `contentEditable`, etc. — it should be `centered`. A short
  fullscreen modal looks weird with all the dead space below; a
  centered card avoids that. Inputs that don't trigger a keyboard
  (`<input type="date">`, `type="checkbox"`, `type="radio"`,
  `type="file"`, custom button-listbox pickers) don't disqualify a
  modal from `centered`. The keyboard guard isn't only cosmetic — a
  centered modal whose footer slides under the iOS keyboard becomes
  unsubmittable, so don't switch a text-input modal to `centered`
  without also reworking the soft-keyboard handling. When adding a
  modal, decide which mode applies and use it from day one.
- **PR conventions**: PR titles must follow Conventional Commits
  because the title becomes the squash-merge commit on `main`.
  Squash-merge is the only permitted merge strategy. **Rebase on
  latest `main` before opening a PR**:
  `git fetch origin main && git rebase origin/main`.

## Test conventions

Tests live under `tests/` at the repo root. File stems must end with
`_test` or `_tests` (see `OSS_SPEC.md` §20.2). `make test` runs Vitest;
add coverage when meaningful tests exist.

No tests exist yet — the skeleton has nothing to assert. Add them as
real features land (start with `src/storage/` once data persistence is
in).

## End-to-end tests

Playwright-driven specs live under `e2e/` and run against a built
`/preview/` slot (same artifact `pages.yml` ships to the live
`/preview/` URL):

```
e2e/
├── fixtures.ts            # shared Playwright fixtures: storage wipe + signInAsGuest
├── specs/                 # common-use-case journeys (auth, sheet, settings, …)
└── regression/            # bugs that shipped once — see e2e/regression/README.md
```

The runner is `make e2e`; the config (`playwright.config.ts`) handles
booting `make preview-serve` and tearing it down. `make e2e-install`
fetches the Chromium build the suite needs — run it once on a fresh
clone (CI installs automatically inside `preview.yml`).

Conventions:

- Each test gets a fresh browser context plus a cleared `localStorage`
  / `sessionStorage` / IndexedDB (handled by the `clean` fixture).
- Land users on the budget shell via `signInAsGuest(page)` rather than
  re-clicking through the auth screen.
- Prefer accessible-name selectors (`getByRole`, `getByLabel`) over
  CSS classes or `data-testid` attributes — labels are already
  in `src/i18n/locales/en.ts` and the suite stays in step with i18n
  changes automatically.
- File stems are `*.spec.ts` (Playwright convention), distinct from
  `*_test.ts` (Vitest). Don't mix the two suites in one folder.
- A new common-flow spec goes in `e2e/specs/<name>.spec.ts`; a fix
  for a shipped bug goes in `e2e/regression/<slug>.spec.ts` with a
  header comment summarising the symptom and linking the issue / PR.

## Documentation sync points

| If you change …                                                                            | Also update …                                                                                                                 |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `package.json` scripts                                                                     | `Makefile`, `README.md` Usage section                                                                                         |
| `Makefile` targets                                                                         | `README.md` Usage section, `ci.yml`                                                                                           |
| `src/` top-level layout                                                                    | `README.md`, this file                                                                                                        |
| Node version in `.nvmrc`                                                                   | `ci.yml`, `pages.yml`, `README.md`                                                                                            |
| Persisted-data shape                                                                       | `docs/architecture.md`                                                                                                        |
| CHANGELOG fragment format                                                                  | `scripts/release/collate-changelog.mjs`, `.agent/skills/release/SKILL.md`, the "Releases and changelog" section below         |
| `nsKey` / `nsCloudPath` / `nsIdbName` semantics                                            | This file (the "Releases and changelog" section), the inline comments on the helpers in `src/data/constants.ts`               |
| Vite `base` handling                                                                       | `vite.config.ts`, `pages.yml`, the "Cross-cutting rules" section below                                                        |
| `pwaPlugin()` manifest / scope / `cacheId` semantics                                       | This file (the "Service-worker rollout invariants" section), the inline comments on `pwaPlugin()` in `vite.config.ts`         |
| `src/i18n/locales/en.ts` shape                                                             | `src/i18n/locales/sv.ts` (compile-time enforced via the `Catalog` type) + `tests/i18n_catalog_test.ts` (runtime parity check) |
| Custom-theme reach (selectors reading `--radius-*` / `--border-width` / `--density-row-*`) | `src/styles.css` (the rule + comment block at the end) and the "Theming and tokens" bullet in this file                       |

## Translations

The app ships in English and Swedish. The runtime is custom — no
`react-i18next` — because the string surface is small enough that a
typed `t(key)` lookup against per-language catalog modules is cheaper
than the library's bundle cost. See `src/i18n/` for the moving parts.

### How `t()` works in a component

```tsx
import { useT } from "../i18n";

export function MyComponent() {
  const t = useT();
  return <button>{t("common.save")}</button>;
}
```

- `useT()` is a thin hook that reads the active `Lang` from
  `LanguageContext` (wired in `src/i18n/LanguageRoot.tsx`, mounted by
  `src/main.tsx`). It returns a `t(key, params?)` function whose `key`
  is autocompleted from the `Catalog` type.
- Placeholders use `{name}`-style braces: `t("sheet.edit", { name })`
  resolves `"Edit {name}"` against the active language's catalog.
- For plurals, prefer two sibling keys (`...One` / `...Other`) chosen
  at the call site by the count, e.g.
  `n === 1 ? t("foo.entryOne", { n }) : t("foo.entryOther", { n })`.
  Use the `plural()` helper in `src/i18n/index.ts` when the same
  one/other pair appears in more than three call sites.
- Outside React (validators, format helpers), use `tFor(lang, key)`
  from `src/i18n/index.ts` — pass the language explicitly so the
  function stays pure.

### Adding a new string

1. Add the key to `src/i18n/locales/en.ts` under the most specific
   existing group (`common`, `settings`, `sheet`, `modal`, etc.).
   Group new top-level keys by component / feature area, not by
   visual grouping.
2. Add the same key to `src/i18n/locales/sv.ts` with the Swedish
   translation. The `Catalog` type derived from `en.ts` makes
   `sv.ts` a compile error until you do — `make typecheck` will
   surface the missing key.
3. Replace the literal in the component with `t("section.key")`.
   Capture `t` once at the top of the component: `const t = useT();`.
4. The `tests/i18n_catalog_test.ts` parity check is the runtime
   safety net — it asserts the catalogs have the same shape and that
   Swedish has no empty strings. Runs as part of `make test`.

### Adding a new language

1. Add the two-letter code to the `Lang` union in
   `src/i18n/locale.ts`, extend `SUPPORTED_LANGS`, map it to a BCP-47
   tag in `bcp47()`, and teach `detectInitialLanguage()` how to
   recognise it from `navigator.language`.
2. Mirror the code in `src/data/constants.ts` (`SUPPORTED_LANGUAGES`);
   the validator at `src/data/validate.ts` picks it up via the
   constant.
3. Create `src/i18n/locales/<code>.ts` exporting an object typed as
   `Catalog` — TypeScript will then fail the build until every leaf
   is translated.
4. Add a flag SVG + button to `src/components/LanguagePicker.tsx`.
   Inline SVG, not emoji (`🇬🇧`/`🇸🇪`) — the One Dark / One Light
   aesthetic depends on deterministic rendering across OSes, and
   flag emojis fall back to letter-pairs on Windows.
5. Add per-language month-name arrays to `MONTH_SHORT_BY_LANG` in
   `src/utils/format.ts` so the `"D MMM"` / `"D MMM YYYY"` date
   formats render correctly when the language is selected.

### What's intentionally not translated

- `src/components/PrivacyPage.tsx` body — privacy policy referencing
  storage/encryption claims; the prose tracks those guarantees and
  is reviewed as a whole.
- The rendered `CHANGELOG.md` body inside `ChangelogModal` and
  `ChangelogPage` — driven by `src/generated/changelog.ts` which
  mirrors the markdown source-of-truth. Only the chrome (modal
  title, "Got it" button, page heading) translates.
- `Column.label` — stored per-sheet user data, not a translatable
  string. New sheets get default column labels in the language
  active at creation time.
- Formula identifiers (`endOfMonthBalance`, `sheet("Wife", …)`, …)
  are code tokens the user types. Only the surrounding prose in
  `FormulaHelpButton` translates.

## Changing the persisted shape

The persisted shape lives in `src/data/types.ts` and is enforced at
runtime by `src/data/validate.ts`. When you change it:

1. Update `src/data/types.ts` and `src/data/validate.ts` first.
2. Add a forward-only migration in `src/data/migrations.ts` and bump
   `LATEST_VERSION` + the `UserData.version` literal together.

## Cross-cutting rules

- **No backend.** This is a local-first app. Never reach for a remote
  store, third-party API, or analytics service without an explicit
  spec change. The deploy is a plain static bundle on GitHub Pages.
- **Vite `base` path.** `vite.config.ts` uses `base: "/"` because the
  production site is served from the custom domain
  `budget.niclaslindstedt.se` (see `public/CNAME`, which Vite copies
  into the deployed artifact). If the custom domain is ever dropped
  so the app falls back to `<user>.github.io/<repo>/`, update both
  `vite.config.ts` (to `"/<repo>/"`) and the README live-site URL,
  and remove `public/CNAME`.

## Service-worker rollout invariants

The app installs as a PWA from both deploy slots. Production at `/`
and staging at `/preview/` register as **two independent apps** on
any device — never one shared install. Every identity-bearing field
branches on `IS_PREVIEW` inside `pwaPlugin()` in `vite.config.ts`:

- `manifest.id`, `manifest.scope`, `manifest.start_url` — `/` vs
  `/preview/`. Distinct `id` is what makes Chrome / Android treat
  the two installs as different apps; without it they dedupe.
- `manifest.name` / `short_name` — `Budget` vs `Budget (preview)` /
  `Budget pre`.
- `workbox.cacheId` — `budget` vs `budget-preview`. Sets the Cache
  Storage namespace prefix so the two slots can't collide.
- `apple-mobile-web-app-title` — patched from `Budget` to `Budget pre`
  for the preview build via the `patchAppleTitle` Vite plugin so iOS
  home-screen tiles are visually distinguishable.

**Update strategy.** `registerType: "autoUpdate"` with
`skipWaiting` + `clientsClaim`. New service workers activate
immediately and claim the open tab, but the JS bundle running in
the tab is the old one until the user reloads. The
`UpdateToast` component (mounted from `LanguageRoot`) surfaces a
non-blocking "reload to apply" prompt — never refresh mid-edit.
Visibility-gated polling (`reg.update()` every 60 min) catches new
builds on tabs left open all day.

**Rollback.** If a SW ever ships broken (precaches a bad build,
infinite refresh loop, anything), ship a "kill" SW via a hotfix:
either disable `pwaPlugin()` in `vite.config.ts` and add a one-line
`public/sw.js` (`self.skipWaiting(); caches.keys().then(ks =>
Promise.all(ks.map(k => caches.delete(k))));
self.clients.claim();`), or switch the plugin to `strategies:
"injectManifest"` with the same body in `src/sw.ts`. Combined with
`cleanupOutdatedCaches: true`, this caps any failure mode at "one
bad deploy". Documented in the release skill.

## Releases and changelog

### Semver and release cadence

The app uses semantic versioning. Bumps are chosen at release time
via the `bump` input on `.github/workflows/release.yml`
(`workflow_dispatch` only):

- `patch` — bug fixes, no visible behaviour change beyond the fix.
- `minor` — new user-facing feature, additive change, or visible
  behaviour change. Default and most common.
- `major` — breaking change to the persisted-data shape that an
  older build cannot read, or a deliberate UX overhaul.

The first release ever cut bumps `0.0.1` → `0.1.0`. The running
bundle exposes its version as `__APP_VERSION__` (injected by Vite's
`define` block from `package.json`); `src/utils/build-env.ts`
re-exports it as `APP_VERSION` for app code.

### Changeset fragments

When a PR introduces a **user-visible** change, drop a small markdown
file in `.changes/unreleased/<unix-ts>-<slug>.md`:

```
---
type: Added
---

One-line description users will read in the "What's new" popup.
```

`type:` is one of `Added | Changed | Fixed | Removed | Security |
Deprecated` (Keep a Changelog). The body is markdown; one line is
usually plenty, multi-line bodies are fine and render under one
bullet. The timestamp prefix on the filename keeps the lexical sort
deterministic so concatenation roughly mirrors commit order.

**Only add a fragment when the change affects users.** Skip a
fragment for: pure refactors, build / CI / test tweaks, dependency
bumps that don't change behaviour, doc-only edits (`*.md`,
`docs/`), and tooling changes (`eslint.config.js`,
`tsconfig*.json`, `.prettierrc*`, etc.). The `changeset` job in
`ci.yml` enforces a fragment per PR; opt out by labelling the PR
`no-changelog` when the change genuinely has no user-visible
impact. The script's skip-list lives in
`scripts/release/check-changeset.mjs` — extend it when adding new
"obviously not user-visible" path patterns.

**Don't add a fragment for fixes or polish to features introduced
since the last release.** If a feature shipped in the most recent
`vX.Y.Z` tag, a bug fix on top of it is a genuine post-release
regression — write a `type: Fixed` fragment. But if the feature was
introduced after that tag (its `Added` fragment is still sitting in
`.changes/unreleased/`), the codepath you're fixing has never been in
production. The original fragment will describe the feature in its
final, post-fix shape when the release lands, so a separate `Fixed`
fragment would only narrate a regression no user ever saw. Fold the
substance into the original fragment if it changes the user-visible
description; otherwise label the PR `no-changelog` and move on. The
same rule covers small extensions that polish an unreleased feature
(re-arranging the new modal, hiding a toggle that doesn't apply
yet) — update the parent fragment, don't add a sibling.

Use the `write-changeset` skill to apply this rule consistently. The
skill resolves the latest `v*` tag, inspects the commits and existing
fragments since, and decides whether the current change needs a new
fragment, an edit to an existing one, or the `no-changelog` label.

### End-to-end release flow

1. Maintainer dispatches the `Release` workflow with a
   `patch | minor | major` bump.
2. The workflow runs `npm version <bump> --no-git-tag-version` and
   `scripts/release/collate-changelog.mjs`, which converts
   `.changes/unreleased/*.md` into a new `## [X.Y.Z] - YYYY-MM-DD`
   section in `CHANGELOG.md` and deletes the consumed fragments.
3. The workflow commits the bump + changelog + fragment deletion,
   tags `vX.Y.Z`, and pushes both to `main`.
4. `gh release create` publishes a GitHub Release whose body is the
   new section (sliced by `scripts/release/extract-section.mjs`).
5. The workflow chains into `pages.yml` via `workflow_call` so the
   new tag is served at `/` immediately, instead of waiting for the
   next push to trigger Pages.

The CHANGELOG.md surface is rendered inside the app in two places —
both fed by the build-time parser in `vite/changelog-plugin.ts`,
which emits `src/generated/changelog.ts`:

- `src/components/ChangelogPage.tsx` at `/changelog/` (linked from
  the burger menu in the page header alongside the privacy policy).
- `src/components/ChangelogModal.tsx` — the "What's new" popup
  that auto-opens on first mount after an upgrade, gated by
  `Settings.lastSeenChangelogVersion`. Silent on a fresh install:
  the running version is stamped to last-seen so existing users
  don't get spammed with notes for software they just installed.

### Preview deploy and data isolation

`/preview/` always serves the current `main`. Every push to `main`
triggers `pages.yml`, which:

1. Resolves the latest `v*` tag with `git describe`. If a tag
   exists, checks it out and builds with `VITE_BASE_PATH=/`. If
   not (i.e. before the first release), the workflow falls back to
   serving `main` at `/` with no preview slot — same as the
   pre-release-pipeline behaviour, so the change was safe to land
   ahead of the first dispatch.
2. Returns to `main` and builds with `VITE_BASE_PATH=/preview/`.
3. Merges the two `dist/` trees into one Pages artifact, deleting
   the preview's `CNAME` first (only the root copy is allowed).

The preview build sets `<meta name="robots" content="noindex,nofollow">`
on every emitted alias so search engines never index a second copy
of the app. JSON-LD `@id`s remain canonical (point at the
production `SITE_URL`) so the preview doesn't fork structured-data
entities.

**Data isolation.** Vite's `define` block exposes
`__IS_PREVIEW__` to the bundle when `VITE_BASE_PATH !== "/"`.
That flips on a `STORAGE_NS = "preview"` constant inside
`src/data/constants.ts`, which threads through three helpers that
every persistence surface must be routed through:

- `nsKey(key)` — for any `localStorage` / `sessionStorage` key
  starting with `budget.` (data buckets, users registry, backend
  preference, cloud tokens, encryption mode, session cache, PKCE
  verifiers, the new `lastSeenChangelogVersion` is in `Settings`
  so it rides the bucket key automatically).
- `nsCloudPath(path)` — for cloud storage paths and bare cloud
  filenames. Dropbox writes to `/preview/budget.json` and
  `/preview/backups/` inside the same registered app folder;
  GDrive writes to `budget-preview.json` and a
  `budget-preview-backups` folder in My Drive.
- `nsIdbName(name)` — for IndexedDB database names. The
  FileSystem-handle DB becomes `budget-folder-handles-preview`.

When introducing a new persisted surface, route it through the
appropriate helper from day one. Forgetting one is a silent way to
break the "preview cannot touch production data" invariant.

The OAuth redirect URI helper at
`src/storage/oauth-pkce.ts:37-39` already derives the URI from
`window.location.origin + pathname`, so the preview flow requests
`https://budget.niclaslindstedt.se/preview` as its redirect
automatically. **Manual one-time setup:** add that URL to the
authorized redirect URI list on both the Dropbox app console and
the Google Cloud OAuth consent screen, or the preview's "Connect"
buttons return an `unauthorized redirect` error from the provider.
Documented in the release skill's pre-flight checklist.

The user-picked folder backend (File System Access API) is the one
surface where the namespace can't intercede — the user chose the
directory. Picking the same directory in both builds is on them;
the in-app folder picker would write to `budget.json` either way.

## OSS*SPEC.md exceptions — the website \_is* the project

`OSS_SPEC.md` is written for a hypothetical project shape where the
deliverable is a library, CLI, or SDK and the `website/` is a
**showcase** for that deliverable — a separate marketing site with a
hero, feature grid, hosted docs, and an SEO surface tuned for new
visitors discovering the product. **This project is not that shape.**
The deployed GitHub Pages bundle at `budget.niclaslindstedt.se` _is_
the budget app: it is the entire user-facing deliverable, served as a
single-page React SPA, with no marketing layer wrapped around it. The
"site" and the "product" are the same artifact.

That mismatch makes several spec rules either inapplicable or
actively counter-productive here. The bash validator
(`scripts/validate.sh` from `niclaslindstedt/oss-spec`) cannot model
this distinction and will keep emitting the violations below — they
are intentional and must **not** be "fixed" by inventing the missing
surfaces. Agents running `sync-oss-spec` should compare against this
list before touching anything.

| Spec section                                                                                                                | Why it does not apply here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §10.5 release toolchain pin file beyond `.nvmrc`                                                                            | Node is the only toolchain. `.nvmrc` already pins it and `ci.yml` / `pages.yml` read from it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| §11.2 `website/` directory + source-extraction script                                                                       | There is no separate website to keep in sync with the product — the product IS the website. The source-extraction pattern (`website/scripts/extract-source-data.*` emitting `website/src/generated/sourceData.*`) exists to prevent a showcase from drifting out of sync with the thing it showcases; here there is nothing to mirror.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| §11.3 SEO scaffolding — partial: per-route prerendering of app content, per-content OG image generator, RSS/Atom/JSON feeds | The user's ledger lives in `localStorage` — there is nothing to prerender for the app's `/` route, and there is no time-ordered content stream to feed. The static surfaces the site exposes (`/`, `/privacy/`, `/changelog/`) DO get the §11.3.2 head requirements, JSON-LD, sitemap, robots, llms.txt, a per-route `<noscript>` fallback, and a single shared 1200×630 OG image — all wired by the `emit-path-alias-with-seo` plugin in `vite.config.ts` from the route table in `src/seo/routes.ts`. `sitemap.xml` and `llms.txt` are emitted into `dist/` from that same table so they cannot drift. Adding per-route prerendered bodies, per-content OG images, or RSS/Atom feeds would be cargo-culted noise here; the per-route `<noscript>` block gives crawlers enough body content to avoid the soft-404 trap §11.3.1 worries about. |
| §11.3.10 `seo.yml` + `lighthouse.yml` workflows                                                                             | Quality-gate CI for a marketing site. Not relevant when there is no marketing surface. Page-weight discipline (§11.3.9) is still a worthwhile habit — the dev should keep the bundle small — but it is not gated in CI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| §12 CLI obligations (`--help-agent`, `--debug-agent`, `commands`, `man/`)                                                   | Not a CLI. The user interacts with a UI in their browser.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| §13 `examples/` directory                                                                                                   | No CLI / SDK surface to exemplify. The app itself is the example.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| §13.5 `prompts/` directory                                                                                                  | This project does not ship versioned AI prompts. (`prompts/<name>/<v>.md` is for repos that publish prompts as a product — e.g. `oss-spec` itself.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| §19 logging + §19.4 central output module                                                                                   | There is no terminal, no log file, and no `~/.local/state/<project>/` to write into — the app runs entirely in a browser tab. Production error reporting, if it ever lands, will use a thin in-app helper rather than the `src/output.{ts,rs,…}` pattern the spec describes. Add such a helper only when there is a real call site for it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| §21.5 `update-manpages`, `update-website` skills                                                                            | Required only when the corresponding artifact (`man/`, `website/`) exists. Neither does. See the registry in `.agent/skills/maintenance/SKILL.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Everything else in `OSS_SPEC.md` does apply. In particular: the
README / CONTRIBUTING / CODE_OF_CONDUCT / SECURITY trio (§2–§6), the
single-source-of-truth symlinks for tool-specific guidance (§7.1),
Conventional Commits + squash-merge (§8), the `Makefile` target set
(§9), `ci.yml` + `pages.yml` (§10.1 / §10.4), `docs/` (§11.1), test
layout and naming (§20), the source-file size cap (§20.5), and the
agent-skills structure (§21.2–§21.4, §21.6, §21.8) are all in scope
and must stay healthy.

If the project later grows a real marketing site, a CLI companion, or
a published SDK, revisit this table and delete the corresponding row.
The exceptions exist because the surface is absent, not because the
spec is wrong.

## Maintenance skills

Agent-driven maintenance playbooks live under
`.agent/skills/<name>/SKILL.md` per `OSS_SPEC.md` §21. Tool-specific
discovery paths (`.claude/skills/`) are symlinks to `.agent/skills/`
so every tool sees the same canonical set.

| Skill                  | Run when                                                                                                                                                                                                                                                                                                                                                                                                            | Run order |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `update-docs`          | `docs/` may be stale relative to `src/` layout, the persisted-data shape, or the `Makefile` target table — or `src/components/PrivacyPage.tsx` may be stale relative to the storage / encryption / Dropbox claims it restates.                                                                                                                                                                                      | 1         |
| `update-readme`        | `README.md` may be stale relative to `package.json` scripts, `Makefile` targets, `.nvmrc`, or the user-visible UI.                                                                                                                                                                                                                                                                                                  | 2         |
| `sync-oss-spec`        | This repo may have drifted out of conformance with `OSS_SPEC.md` — runs the upstream bash validator and walks the violations until it reports zero.                                                                                                                                                                                                                                                                 | last      |
| `maintenance`          | Bring the whole repository back into sync without first diagnosing which artifact is stale — dispatches every `update-*` above in order.                                                                                                                                                                                                                                                                            | umbrella  |
| `release`              | Maintainer (or agent on their behalf) wants to cut a new release. Walks the pre-flight checklist (clean tree, on `main`, fragments parse, OAuth redirect URIs already registered for `/preview`), dispatches the workflow, verifies the deploy, links to the rollback recipe.                                                                                                                                       | manual    |
| `write-changeset`      | Decide whether the current change needs a `.changes/unreleased/<unix-ts>-<slug>.md` fragment. Resolves the latest `v*` tag, lists commits and existing fragments since, classifies the change, and either writes a new fragment, edits a parent fragment in place, or labels the PR `no-changelog`. Run per-PR, before opening the PR.                                                                              | manual    |
| `debug-from-logs`      | The user pasted captured log output (in-app Logs tab, console transcript, CI snippet, anything timestamped or scoped). Walks the trace from last-known-good to the failure, traces each suspicious line back to its source by greping the logged string, forms and verifies a root-cause hypothesis, and ends by evaluating log sufficiency — adding the missing diagnostics in the same change when they were not. | manual    |
| `tune-pwa-icons`       | The home-screen / launcher / browser-tab icon looks wrong on a real device (too small, off-centre, transparent, clipped by iOS rounding, eaten by an Android mask). Walks an edit / regenerate / inspect loop that reads the rasterised PNGs after every change, scored against Apple HIG and the W3C maskable-icon spec.                                                                                           | manual    |
| `write-pr-description` | About to open a PR (or revise one already pushed). Derives the title and body from the diff, commit log, and source tree — never from the chat that produced the change — and yields a Conventional-Commits title and a `## Summary` + `## Test plan` body that describe the problem and the fix in the voice of someone reading the PR cold.                                                                       | manual    |

`update-manpages` and `update-website` are listed in `OSS_SPEC.md`
§21.5 but are intentionally omitted here — see the "OSS_SPEC.md
exceptions" section above. The `release`, `write-changeset`,
`debug-from-logs`, `tune-pwa-icons`, and `write-pr-description`
skills are manual playbooks (a maintainer dispatches the release
workflow; the contributor decides per-PR whether a fragment is
warranted; the agent runs the debug playbook whenever the user
pastes logs; the icon set is tuned when a real device shows it
looking wrong; the PR body is drafted right before opening the
PR), so none of them are part of the `maintenance` umbrella —
that umbrella only runs automatic sync skills. New automatic-sync skills go in this table in the order
they should run — upstream fixes first, downstream mirrors last;
`sync-oss-spec` always runs last to catch residual violations,
and the `maintenance` umbrella reflects the same order in its own
registry.
