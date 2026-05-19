#!/usr/bin/env node
// PR-time gate: every PR that touches user-visible code should drop a
// changelog fragment in .changes/unreleased/. This script enforces
// that, with two escape hatches:
//
//   1. Apply the `no-changelog` label to the PR (the workflow passes
//      labels through as $LABELS).
//   2. Touch only files that match the skip-list below (tests, CI,
//      docs, formatter/eslint config, lockfile, etc.).
//
// Otherwise the script exits non-zero with a helpful message.
//
// Env vars provided by the calling workflow:
//   BASE_SHA — sha of the PR base branch (event.pull_request.base.sha)
//   LABELS   — JSON array of label names ($(toJSON(...labels.*.name)))

import { execSync } from "node:child_process";

const BASE_SHA = process.env.BASE_SHA;
const LABELS_RAW = process.env.LABELS ?? "[]";

if (!BASE_SHA) {
  console.error("BASE_SHA env var not set");
  process.exit(2);
}

let labels = [];
try {
  labels = JSON.parse(LABELS_RAW);
} catch {
  // Fall through with an empty list. A malformed labels payload
  // shouldn't gate the PR — that would block on infra problems.
}
if (Array.isArray(labels) && labels.includes("no-changelog")) {
  console.log("`no-changelog` label set — skipping fragment check.");
  process.exit(0);
}

const SKIP_PATTERNS = [
  /^tests\//,
  /^\.github\//,
  /^\.agent\//,
  /^\.claude\//,
  /^\.changes\//,
  /^docs\//,
  /^scripts\//,
  /^vite\//,
  /^Makefile$/,
  /\.md$/,
  /^\.nvmrc$/,
  /^\.prettierrc/,
  /^\.gitignore$/,
  /^\.gitattributes$/,
  /^eslint\.config\.js$/,
  /^tsconfig.*\.json$/,
  /^package-lock\.json$/,
];

const changed = execSync(`git diff --name-only ${BASE_SHA}...HEAD`, {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

if (changed.length === 0) {
  console.log("No files changed — skipping fragment check.");
  process.exit(0);
}

const userVisible = changed.filter(
  (f) => !SKIP_PATTERNS.some((re) => re.test(f)),
);

const fragmentsAdded = changed.some((f) =>
  /^\.changes\/unreleased\/.+\.md$/.test(f),
);

if (userVisible.length === 0) {
  console.log(
    `All ${changed.length} changed file(s) match the skip-list — no fragment required.`,
  );
  process.exit(0);
}

if (fragmentsAdded) {
  console.log(
    `Found changelog fragment(s) under .changes/unreleased/ — fragment check passed.`,
  );
  process.exit(0);
}

console.error(
  `\nThis PR touches user-visible code but has no changelog fragment.\n` +
    `\n` +
    `Add a file under .changes/unreleased/ describing the user-facing\n` +
    `change. Example:\n` +
    `\n` +
    `  .changes/unreleased/$(date +%s)-short-slug.md\n` +
    `\n` +
    `  ---\n` +
    `  type: Added\n` +
    `  ---\n` +
    `\n` +
    `  One-line description users will read in the "What's new" popup.\n` +
    `\n` +
    `Valid \`type\` values: Added | Changed | Fixed | Removed | Security |\n` +
    `Deprecated. If the PR genuinely has no user-visible impact (pure\n` +
    `refactor, CI/build tweak, docs, lockfile bump that doesn't change\n` +
    `behaviour), label the PR \`no-changelog\` to opt out.\n` +
    `\n` +
    `Files that triggered this check:\n` +
    userVisible.map((f) => `  - ${f}`).join("\n") +
    `\n`,
);
process.exit(1);
