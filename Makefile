.PHONY: install dev build preview preview-build preview-serve lint typecheck fmt fmt-check test e2e e2e-install e2e-ui clean changelog codegen icons icons-check

install:
	npm ci

# Start the Vite dev server. Pass `SEED=1` to boot straight into the
# in-memory fake-data backend (the same seed the Developer → Fake data
# toggle loads), so you land on a fully-populated app without enabling
# developer mode or flipping the Settings toggle — handy for designing
# against realistic data. See `src/hooks/useDevSeed.ts`.
dev:
	$(if $(SEED),VITE_DEV_SEED=1 )npm run dev

# Codegen step that emits src/generated/*.ts from their markdown
# sources (changelog.ts from CHANGELOG.md, feature-docs.ts from
# docs/features/*.md). Needed before tsc -b runs (typecheck / lint /
# build) because the generated modules are gitignored. The Vite dev
# server / `vite build` also re-emit via the matching vite/*-plugin.ts,
# but the standalone scripts mean a fresh CI checkout can run `make lint`
# without first running `make build`.
codegen:
	node scripts/codegen/changelog.mjs
	node scripts/codegen/feature-docs.mjs

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

# Regenerate the PWA icon set from public/favicon.svg via
# @vite-pwa/assets-generator. Committed to public/ so cold builds
# don't have to regenerate, and so the assets-generator dep can
# stay devDependencies-only.
icons:
	npx pwa-assets-generator

# CI drift guard: regenerate into a temp dir and diff against
# public/. Fails the build if favicon.svg was edited without
# rerunning `make icons`.
icons-check:
	@tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && \
	  cp public/pwa-64x64.png public/pwa-192x192.png \
	     public/pwa-512x512.png public/maskable-icon-512x512.png \
	     public/apple-touch-icon-180x180.png public/favicon.ico \
	     "$$tmp/" && \
	  npx pwa-assets-generator >/dev/null && \
	  for f in pwa-64x64.png pwa-192x192.png pwa-512x512.png \
	           maskable-icon-512x512.png apple-touch-icon-180x180.png \
	           favicon.ico; do \
	    cmp -s "$$tmp/$$f" "public/$$f" || \
	      { echo "icons drift: $$f differs — run 'make icons' and commit"; \
	        cp "$$tmp/$$f" "public/$$f"; exit 1; }; \
	  done

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
