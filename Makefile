.PHONY: install dev build preview lint typecheck fmt fmt-check test clean

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
	rm -rf dist node_modules/.vite
