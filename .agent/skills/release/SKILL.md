---
name: release
description: "Use when the maintainer (or an agent acting on their behalf) wants to cut a new release of the Budget app. Walks the pre-flight checklist, dispatches the workflow, verifies the deploy, and links to the rollback recipe. Manual playbook — not part of the `maintenance` umbrella."
---

# Cutting a release

Releases are semver-tagged GitHub releases that promote `main` to the
production `/` slot of the GitHub Pages deploy. The mechanism lives in
`.github/workflows/release.yml`; this skill is the human-friendly
checklist around it.

The first release ever cut bumps `0.0.1` → `0.1.0`. After that,
choose `patch` for bug fixes, `minor` for additive user-visible
changes, and `major` for breaking persisted-data shape changes or
deliberate UX overhauls.

## Pre-flight checklist

Before dispatching anything, confirm:

1. **You're on `main` and the working tree is clean.** The workflow
   refuses to release otherwise. From a checkout:

   ```sh
   git fetch origin main
   git checkout main && git reset --hard origin/main
   git status   # must report nothing to commit
   ```

2. **There is at least one fragment in `.changes/unreleased/`** other
   than `.gitkeep`. The collator refuses to write an empty release —
   if there are no fragments, there's nothing user-visible to ship and
   the dispatch is probably premature. Double-check by listing:

   ```sh
   ls -1 .changes/unreleased/ | grep -v '^\.gitkeep$'
   ```

3. **Every fragment parses.** The collator fails loudly on a bad
   front-matter or an unknown `type:`, but it's better to catch that
   before the workflow runs. Dry-run the collator in a scratch
   directory:

   ```sh
   TMP=$(mktemp -d)
   cp -r . "$TMP/"
   cd "$TMP" && node scripts/release/collate-changelog.mjs 9.9.9
   head -40 CHANGELOG.md   # eyeball the new section
   ```

4. **CI is green on the latest commit on `main`.** Look at
   `.github/workflows/ci.yml`'s run for that sha — `make build` will
   be re-run during the release workflow's sanity step but a failing
   CI here is a hint the release will fail mid-flight.

5. **(First-time only.) OAuth redirect URIs include the preview
   origin.** If this is the very first release that flips on the
   dual-track deploy, add
   `https://budget.niclaslindstedt.se/preview` to the authorized
   redirect URI lists on both:
   - Dropbox app console — <https://www.dropbox.com/developers/apps>
     → your app → OAuth 2 → Redirect URIs.
   - Google Cloud OAuth consent screen —
     <https://console.cloud.google.com/apis/credentials> → your
     OAuth 2 client → Authorized redirect URIs.

   Without this, preview's "Connect" buttons return an
   `unauthorized redirect` error from the provider.

6. **If the release touches `pwaPlugin()` in `vite.config.ts`,
   `vite-plugin-pwa`'s version, or `public/favicon.svg`,** double-
   check the manifest shape locally before dispatching:

   ```sh
   make build && cat dist/manifest.webmanifest
   # id, scope, start_url must all be "/"
   make preview-build && cat dist/manifest.webmanifest
   # id, scope, start_url must all be "/preview/"
   ```

   Each PWA-bearing release also warrants a manual install smoke
   test in a fresh Chrome profile after deploy (post-flight step 6
   below).

## Dispatch

Trigger the workflow with the chosen bump:

```sh
gh workflow run release.yml -f bump=minor       # or patch / major
gh run watch                                    # follow the run
```

Don't switch terminals while it runs — the workflow pushes a commit
and a tag back to `main`, and any local work on `main` after that
needs to be rebased.

## Post-flight verification

After the workflow finishes successfully:

1. **Tag and release exist.**

   ```sh
   git fetch --tags
   git tag --list 'v*' | tail -5
   gh release view "$(git tag --list 'v*' | tail -1)"
   ```

2. **`package.json` is bumped, `CHANGELOG.md` is updated, fragments
   are gone.** Pull the release commit and check:

   ```sh
   git pull --ff-only
   git show --stat HEAD~0    # the release commit
   ls -1 .changes/unreleased/   # should only have .gitkeep
   ```

3. **Pages is serving the new version at `/`.** Hit
   `https://budget.niclaslindstedt.se/` in a browser, open DevTools,
   and check that `__APP_VERSION__` (paste into the console) matches
   the new version. Then check `/preview/` — it should serve the same
   version (since the preview build is now of the just-tagged
   commit), with `<meta name="robots" content="noindex,nofollow">`
   in the source.

4. **The changelog popup fires on a stale install.** In a fresh
   private window, visit `/`, create a guest user, then open the
   browser console and run:

   ```js
   const k = Object.keys(localStorage).find((k) =>
     k.startsWith("budget.user."),
   );
   const data = JSON.parse(localStorage[k]);
   data.settings.lastSeenChangelogVersion = "0.0.1"; // any version older than the new one
   localStorage[k] = JSON.stringify(data);
   location.reload();
   ```

   The "What's new" modal should open showing the new section.
   Closing it stamps the new version back; reloading should not
   re-open the modal.

5. **`/changelog/` renders the new entry** at
   `https://budget.niclaslindstedt.se/changelog/`.

6. **PWA: distinct manifests + isolated service workers per slot.**
   In a fresh Chrome profile:
   - `https://budget.niclaslindstedt.se/manifest.webmanifest` — JSON
     has `"id": "/"`, `"scope": "/"`, `"name": "Budget"`.
   - `https://budget.niclaslindstedt.se/preview/manifest.webmanifest`
     — JSON has `"id": "/preview/"`, `"scope": "/preview/"`,
     `"name": "Budget (preview)"`.
   - DevTools → Application → Service Workers on each origin
     shows exactly one registration per slot, scope matches.
   - DevTools → Application → Cache Storage shows
     `workbox-precache-v2-budget` for `/` and
     `workbox-precache-v2-budget-preview` for `/preview/` — never
     mixed.

## Rollback

The bundle was never published to a registry, so rollback is
git-only:

```sh
TAG=vX.Y.Z   # the tag you want to undo
git fetch --tags
git push origin :refs/tags/$TAG          # delete remote tag
git tag -d $TAG                          # delete local tag
gh release delete $TAG --yes             # remove the GitHub Release
git revert HEAD --no-edit                # back out the release commit
git push origin main
```

The next push to `main` (the revert commit itself) will trigger
`pages.yml`; with no `v*` tags around, it falls back to serving
`main` at `/` until you cut a real replacement release.

If only the changelog body was wrong, you can hand-edit
`CHANGELOG.md` and `gh release edit $TAG --notes-file …` without
touching tags or `package.json`.

## Service-worker kill-switch

If a release ships a broken service worker — precaches a bad
build, gets stuck in a refresh loop, fails to activate — the git
revert above won't help: the broken SW is still installed in every
user's browser and will keep serving the bad bundle from its cache
until it gets replaced.

The recipe is to ship a _replacement_ SW that nukes its own
caches and unregisters cleanly, then cut a hotfix release so users
pick it up:

1. On a new branch, edit `vite.config.ts` and either:
   - Comment out the `pwaPlugin()` line and add a static
     `public/sw.js` with the kill body:

     ```js
     self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));
     self.addEventListener("activate", (e) =>
       e.waitUntil(
         (async () => {
           const keys = await caches.keys();
           await Promise.all(keys.map((k) => caches.delete(k)));
           await self.clients.claim();
         })(),
       ),
     );
     ```

   - Or switch `pwaPlugin()` to `strategies: "injectManifest"`
     pointed at the same body in `src/sw.ts`.

2. Cut a hotfix: `gh workflow run release.yml -f bump=patch`.

3. Users with the broken SW pick up the kill SW on their next
   visit; it wipes Cache Storage and (with `clientsClaim`) takes
   over the open tab so the next reload serves a fresh bundle from
   the network.

4. Once user reports settle, restore the normal `pwaPlugin()`
   config in a follow-up PR. `cleanupOutdatedCaches: true` plus
   this recipe caps any failure mode at one bad deploy.

## Common failure modes

- **`working tree is not clean`** — the workflow saw uncommitted
  changes after `npm ci`. Usually a lockfile drift. Re-run `npm ci`
  locally, commit any updates, push, retry.
- **`gh: tag exists`** — somebody (or a previous failed run) already
  pushed the tag. Bump again or delete the orphan tag first.
- **`No fragments found`** — there's nothing user-visible to ship.
  Either land a fragment-bearing PR first, or skip the release.
- **OAuth redirect URI not registered for preview** — visible in
  preview only, after the deploy: clicking Dropbox / Google "Connect"
  returns `redirect_uri_mismatch`. Register the
  `…/preview` URL on the provider's console and the next attempt
  works.
