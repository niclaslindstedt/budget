.PHONY: install dev build preview lint typecheck fmt fmt-check test clean changelog codegen

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
