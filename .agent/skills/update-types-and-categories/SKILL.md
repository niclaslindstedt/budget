---
name: update-types-and-categories
description: "Use when the user wants to update categories or types for the budget. Covers adding, renaming, recoloring, re-glyphing, removing, or moving preset categories (PRESET_CATEGORIES) and preset entry types (PRESET_ENTRY_TYPES) in src/data/presets.ts — and the cascade of changes that has to land with them (CategoryIcon union, icon map, glyph allowlists, picker palettes, English + Swedish i18n, validator-friendly id rules, and changeset/PR conventions). Also covers adding a brand-new glyph from lucide-react so a fresh icon can back a type or category."
---

# Updating preset categories and entry types

The "categories" and "types" surface in the budget app is a curated
list of household line items shipped in code so users get a useful
starting palette without seeding their own. Categories are the broad
buckets (Housing, Food, Transport, …) used for cross-row analysis;
types are concrete repeating entries (Rent, Groceries, Spotify, …)
that belong to exactly one category. Both ship as **presets** in
`src/data/presets.ts` and are surfaced through the Settings →
Categories / Types screens, the row-level type picker, and (for
categories) the analytics rollups.

This skill is the playbook for changing that surface — adding,
renaming, recoloring, re-glyphing, removing, or moving an entry —
and walks the cascading edits so nothing falls out of sync.

## The big picture

Every category / type touches up to six files. Skipping one breaks
typecheck, the validator, the i18n parity test, or the picker UI.

| Concern               | File                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Preset definitions    | `src/data/presets.ts` — `PRESET_CATEGORIES`, `PRESET_ENTRY_TYPES`                                                |
| Glyph type union      | `src/data/types.ts` — `CategoryIcon`                                                                             |
| Glyph render map      | `src/components/icons.tsx` — `CATEGORY_ICONS` + lucide imports                                                   |
| Glyph allowlist       | `src/data/constants.ts` — `CATEGORY_ICON_NAMES`                                                                  |
| Glyph picker palettes | `src/data/constants.ts` — `TYPE_GLYPH_NAMES`, `CATEGORY_GLYPH_NAMES`, `SHEET_GLYPH_NAMES`, `ACCOUNT_GLYPH_NAMES` |
| Display names         | `src/i18n/locales/en.ts` and `src/i18n/locales/sv.ts` — `presetTypes`, `presetCategories`                        |

Tests that fail loudly when these drift:

- `tests/preset_names_test.ts` — every preset id must have a non-empty
  English **and** Swedish display name.
- `tests/i18n_catalog_test.ts` — Swedish catalog must mirror English
  key-for-key with no empty strings (the `Catalog` type widens
  `en.ts` so missing Swedish keys are a compile error too).

## Shape of a preset entry type

`PRESET_ENTRY_TYPES` is built from a local `seeds` array, then mapped
into the final shape. Each seed:

```ts
{
  slug: "groceries",            // kebab-case; embedded in the id
  name: "Groceries",            // canonical English; never read by the UI — display goes through i18n
  color: C[3],                  // CATEGORY_COLORS index (0–7)
  glyph: "shopping-cart",       // must be in the CategoryIcon union
  category: "food",             // PRESET_CATEGORIES slug (without the "preset-cat-" prefix)
  kind: "expense",              // "income" | "expense" | omit for either
}
```

The map step turns each seed into:

```ts
{
  id: `preset-type-${slug}`,
  name,
  color,
  glyph,
  categoryId: `preset-cat-${category}`,
  // kind only set when defined; omitted means "any" at read time.
}
```

`PRESET_CATEGORIES` is the same idea with `slug`, `name`, `color`,
`icon`. Categories don't have a `kind`.

## Id immutability rule

Read the long comment block above `PRESET_ENTRY_TYPES` before
removing or renaming anything. The rule is in there:

> Once shipped, an id must never be reassigned — a rename keeps the
> id; a removed preset stays in this list (the hidden flag is the
> user-facing equivalent) so existing references continue to
> resolve.

What this means in practice:

- **Rename a preset** → change `name` and the matching i18n value.
  Keep `slug` (and therefore the id). Stored rows / merchant hints /
  budgets keep resolving.
- **Recolor / re-glyph** → change the field. Existing rows
  re-render with the new look.
- **Move a type to a different category** → change `category`.
  Existing rows keep the typeId; the category they roll up into
  shifts.
- **Remove a preset** → the canonical move is to leave the entry in
  `PRESET_ENTRY_TYPES` and let users hide it through Settings → Types
  (which writes to `hiddenPresetTypeIds`). Stored data keeps
  resolving.
- **Remove a preset for real (delete)** → safe but graceless. The
  validator at `src/data/validate.ts:228` silently drops `row.typeId`
  when the id is no longer known, so rows orphan to "no type".
  Hidden-list entries that no longer match a known id are stripped
  on load (`validate.ts:1224`). When the maintainer explicitly asks
  to remove a preset (as in PR #392 / HOA fee), deletion is fine —
  this is a single-user personal app, not a public SDK with stored
  data in the wild. Still confirm the request rather than deleting
  proactively.

## Adding a new preset entry type

1. Pick a `slug`. Lowercase, kebab-case, unique across
   `PRESET_ENTRY_TYPES`. Stable forever once shipped.
2. Pick a `category`. Must be one of the existing
   `PRESET_CATEGORIES` slugs (`housing`, `food`, `transport`,
   `health`, `bills`, `entertainment`, `savings`, `income`,
   `family`, `personal`, `travel`, `other`). If none fit, add a
   category first (see below).
3. Pick a `color` from `CATEGORY_COLORS` (`C[0]`–`C[7]`). Lean on
   the existing pattern — siblings in a category often share a
   color so the picker reads as a group.
4. Pick a `glyph` from the `CategoryIcon` union. If nothing fits,
   add a new glyph first (see "Adding a new glyph" below).
5. Pick a `kind`:
   - `"expense"` for outflows (Rent, Groceries, Streaming).
   - `"income"` for inflows (Salary, Barnbidrag, Tax refund).
   - Omit for either-way entries (Savings — can be a deposit on one
     sheet and an arrival on another).
6. Add the seed to the right section of `PRESET_ENTRY_TYPES`. The
   array is grouped by category with `// Housing` / `// Food` /
   `// Transport` / … markers — slot it under the matching marker.
7. Add the slug to `src/i18n/locales/en.ts` under `presetTypes`,
   then `src/i18n/locales/sv.ts` under `presetTypes`. Typecheck
   fails until both are present.

Slot order inside a section affects the order users see in the
type picker. Keep related entries adjacent (insurance next to
mortgage, leasing next to fuel, …).

## Adding a new preset category

Categories are higher-stakes than types because they show up in the
rollups and in the picker as a parent header. Add one only when no
existing bucket is a reasonable fit.

1. Pick a `slug` (kebab-case, unique among `PRESET_CATEGORIES`).
2. Add a seed to `PRESET_CATEGORIES` with `name`, `color`, `icon`.
3. Add the slug to both i18n catalogs under `presetCategories`.
4. Any preset types that belong to it: set `category: "<slug>"` in
   their seed.

## Adding a new glyph

A glyph rides in five places — miss one and either typecheck fails
(union / map / picker arrays disagree) or the picker silently omits
the new icon.

1. **lucide-react sanity check.** Confirm the icon exists in the
   installed version:

   ```sh
   ls node_modules/lucide-react/dist/esm/icons/ | grep -E '^<kebab-name>\.mjs$'
   ```

   If it's missing, pick a different name from
   https://lucide.dev/icons/ or bump `lucide-react`.

2. **`src/data/types.ts` — `CategoryIcon` union.** Add the kebab
   name to the union. Slot under the matching `// Food & drink` /
   `// Transport` / `// Home & utilities` / … comment for
   discoverability.

3. **`src/components/icons.tsx`.** Import the PascalCase component
   from `lucide-react` (keep the import block alphabetized) and add
   a map entry `"<kebab-name>": <Component>` to `CATEGORY_ICONS`.

4. **`src/data/constants.ts` — `CATEGORY_ICON_NAMES`.** Append the
   kebab name. This is the master allowlist the validator checks
   against; without it, a row that uses the new glyph is rejected
   on load.

5. **`src/data/constants.ts` — picker palettes.** Add the glyph to
   the palettes where it should be offered:
   - `TYPE_GLYPH_NAMES` for the type-creator picker. Slot under the
     right `// Food & drink` / `// Transport` / `// Home &
utilities` / `// Lifestyle` / `// Health` / `// Money` / …
     section header.
   - `CATEGORY_GLYPH_NAMES` for the category-creator picker (only
     when the icon is broad enough to label a whole bucket).
   - `SHEET_GLYPH_NAMES` / `ACCOUNT_GLYPH_NAMES` when relevant —
     usually not, since those palettes are deliberately narrow
     (sheets are workspace containers; accounts are real-world
     money stores).

Cross-context use is allowed by the validator (a category tagged
`wallet` works fine); the picker just won't offer the glyph in
contexts where it isn't listed.

## What's intentionally not translated

`name` on the seed is the canonical English string but the runtime
never reads it for display — it's a fallback / documentation
artifact. The picker always looks up the i18n key
`presetTypes.<slug>` (or `presetCategories.<slug>`) via
`displayTypeName` / `displayCategoryName` in
`src/i18n/preset-names.ts`. Swedish-institution names
(Systembolaget, A-kassa, CSN, ISK, Apoteket) keep their proper
names in every language — the same string in both `en.ts` and
`sv.ts`.

User-added types and categories (`UserData.types` / `UserData.categories`)
store their own `name` and bypass the i18n lookup entirely — they
render verbatim regardless of language.

## End-to-end checklist for adding a new type with a fresh glyph

```
[ ] lucide icon exists in node_modules/lucide-react/dist/esm/icons/
[ ] src/data/types.ts — added to CategoryIcon union
[ ] src/components/icons.tsx — imported lucide component + added map entry
[ ] src/data/constants.ts — added to CATEGORY_ICON_NAMES
[ ] src/data/constants.ts — added to TYPE_GLYPH_NAMES (and CATEGORY_GLYPH_NAMES if broad)
[ ] src/data/presets.ts — added seed to PRESET_ENTRY_TYPES under the right // <Category> marker
[ ] src/i18n/locales/en.ts — added slug under presetTypes
[ ] src/i18n/locales/sv.ts — added slug under presetTypes
[ ] make typecheck && make lint && make test
[ ] make fmt
```

## Changeset and PR conventions

The household preset-types feature shipped after `v0.1.0` and its
`Added` fragment is still sitting in
`.changes/unreleased/1779190977-household-types-and-admin.md`. Per
`AGENTS.md`, **polish to an unreleased feature does not get its own
fragment** — the codepath has never been in production. Two options:

1. The parent fragment lists representative types with an ellipsis
   ("…rent, mortgage, el, A-kassa, Apoteket, SL/public transport,
   Systembolaget, ISK, CSN, …"). Small additions / removals are
   already covered by the ellipsis — no edit needed.
2. If the change is large enough to alter the user-visible
   description (e.g. an entirely new category), fold it into the
   parent fragment's prose.

After pushing, label the PR `no-changelog` via
`mcp__github__issue_write` so the `changeset` CI job passes:

```
labels: ["no-changelog"]
method: "update"
issue_number: <PR number>
```

Once a release has shipped the preset-types feature, this rule
flips: bug fixes to a released preset (the type used to be in
production and broke) get a `type: Fixed` fragment; new types
shipped after the release get a `type: Added` fragment.

## Verification

Always run before opening the PR:

```sh
make typecheck   # catches missing union members, missing i18n keys
make lint
make test        # preset_names_test + i18n_catalog_test
make fmt
```

`tests/preset_names_test.ts` walks every entry in
`PRESET_CATEGORIES` and `PRESET_ENTRY_TYPES` and asserts both
language catalogs resolve them to non-empty strings, so a missing
i18n entry surfaces there even if typecheck somehow passes.
