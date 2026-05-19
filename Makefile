.PHONY: install dev build preview lint typecheck fmt fmt-check test clean changelog

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

preview:
	npm run preview

lint:
	npm run lint
	npm run typecheck

typecheck:
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
