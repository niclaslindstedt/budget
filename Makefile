.PHONY: install dev build preview preview-build preview-serve lint typecheck fmt fmt-check test e2e e2e-install e2e-ui clean changelog codegen

install:
	npm ci

dev:
	npm run dev

# Codegen step that emits src/generated/changelog.ts from CHANGELOG.md.
# Needed before tsc -b runs (typecheck / lint / build) because the
# generated module is gitignored. The Vite dev server / `vite build`
# also re-emit via vite/changelog-plugin.ts, but the standalone script
# means a fresh CI checkout can run `make lint` without first
# running `make build`.
codegen:
	node scripts/codegen/changelog.mjs

build: codegen
	npm run build

preview:
	npm run preview

# Build the app for the `/preview/` slot — same shape as the Pages
# workflow's preview build. Playwright's `webServer` invokes
# `preview-serve` (below), which depends on this build.
preview-build: codegen
	VITE_BASE_PATH=/preview/ npm run build

# Serve the `/preview/` build on http://localhost:4173/preview/. Used
# by `make e2e` and by the `Preview` CI workflow to drive Playwright
# against the same bundle that ships to the live `/preview/` slot.
# `VITE_BASE_PATH` is set here too because `vite preview` re-reads
# `vite.config.ts` at runtime — without it, the preview server would
# serve at `/` even though the build was emitted for `/preview/`.
preview-serve: preview-build
	VITE_BASE_PATH=/preview/ npm run preview -- --port 4173 --strictPort

lint: codegen
	npm run lint
	npm run typecheck

typecheck: codegen
	npm run typecheck

fmt:
	npm run format

fmt-check:
	npm run format:check

test:
	npm test

# Install the Chromium build Playwright drives. CI installs with
# `--with-deps` to also pull the apt packages Chromium needs on a
# bare runner image; locally `make e2e-install` skips that since
# desktops already have the system libs.
e2e-install:
	npx playwright install chromium

# End-to-end suite against the local `/preview/` build (see
# `playwright.config.ts`). The config's `webServer` block runs
# `make preview-serve` automatically and tears it down after the run.
e2e:
	npx playwright test

# Same as `e2e` but with Playwright's interactive UI runner. Handy
# when iterating on a failing spec — pick the spec, watch it run,
# inspect the trace inline.
e2e-ui:
	npx playwright test --ui

clean:
	rm -rf dist node_modules/.vite src/generated

# Local preview of what the release workflow will write to CHANGELOG.md.
# Pass the planned version: `make changelog VERSION=0.2.0`. Deletes the
# fragments in .changes/unreleased/ — run inside a scratch branch /
# worktree if you just want to peek.
changelog:
	@if [ -z "$(VERSION)" ]; then \
		echo "usage: make changelog VERSION=X.Y.Z"; exit 2; \
	fi
	node scripts/release/collate-changelog.mjs $(VERSION)
