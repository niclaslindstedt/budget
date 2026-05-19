#!/usr/bin/env node
// Consume .changes/unreleased/*.md fragments, write a new dated
// section in CHANGELOG.md under the [Unreleased] header, delete the
// fragments. The release workflow runs this as the last step before
// committing; contributors can run it locally via `make changelog
// VERSION=X.Y.Z` to preview a release.
//
// Fragment format:
//
//   ---
//   type: Added   # one of Added | Changed | Fixed | Removed | Security | Deprecated
//   ---
//
//   One-line user-facing description.
//
// Filename convention: <unix-ts>-<slug>.md. The timestamp gives a
// deterministic lexical sort that loosely tracks commit order; the
// slug is for human scanning. Fragments without front-matter, with
// an unknown type, or with an empty body fail the script loudly.

import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSION = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(VERSION ?? "")) {
  console.error("usage: collate-changelog.mjs <version>");
  process.exit(2);
}

const TYPES = [
  "Added",
  "Changed",
  "Fixed",
  "Removed",
  "Security",
  "Deprecated",
];
const FRAG_DIR = ".changes/unreleased";
const CHANGELOG = "CHANGELOG.md";
const DATE = new Date().toISOString().slice(0, 10);

const files = readdirSync(FRAG_DIR)
  .filter((n) => n.endsWith(".md") && !n.startsWith("."))
  .sort();

if (files.length === 0) {
  console.error(
    `No fragments found in ${FRAG_DIR}. Refusing to write an empty release.\n` +
      `Add at least one fragment with front-matter \`type: Added|Changed|...\` ` +
      `or, if this release really has no user-visible changes, skip the ` +
      `release workflow until something user-visible lands.`,
  );
  process.exit(1);
}

const grouped = Object.fromEntries(TYPES.map((t) => [t, []]));
for (const file of files) {
  const raw = readFileSync(join(FRAG_DIR, file), "utf8");
  const m = /^---\s*\ntype:\s*([A-Za-z]+)\s*\n---\s*\n([\s\S]*)$/.exec(raw);
  if (!m) {
    console.error(
      `bad fragment ${file}: missing front-matter. ` +
        `Expected:\n---\ntype: Added\n---\n\n<description>`,
    );
    process.exit(1);
  }
  const type = m[1].trim();
  if (!TYPES.includes(type)) {
    console.error(
      `bad fragment ${file}: type "${type}" not in ${TYPES.join(", ")}`,
    );
    process.exit(1);
  }
  const body = m[2].trim();
  if (!body) {
    console.error(`bad fragment ${file}: empty body`);
    process.exit(1);
  }
  // Each fragment becomes one bullet. Multi-line bodies are indented
  // under the bullet so the rendered markdown stays well-formed.
  const lines = body.split("\n");
  const bullet =
    `- ${lines[0]}` +
    (lines.length > 1 ? "\n  " + lines.slice(1).join("\n  ") : "");
  grouped[type].push(bullet);
}

const sectionLines = [`## [${VERSION}] - ${DATE}`, ""];
for (const t of TYPES) {
  if (grouped[t].length === 0) continue;
  sectionLines.push(`### ${t}`, "", ...grouped[t], "");
}
const section = sectionLines.join("\n").trimEnd() + "\n";

const orig = readFileSync(CHANGELOG, "utf8");
// Replace "## [Unreleased]" with "## [Unreleased]\n\n<new section>" so
// the stub stays in place for the next round.
const replaced = orig.replace(
  /## \[Unreleased\]\s*\n/,
  `## [Unreleased]\n\n${section}\n`,
);
if (replaced === orig) {
  console.error("CHANGELOG.md is missing the '## [Unreleased]' anchor");
  process.exit(1);
}
writeFileSync(CHANGELOG, replaced);

for (const file of files) rmSync(join(FRAG_DIR, file));

console.log(
  `Wrote ${VERSION} to CHANGELOG.md from ${files.length} fragment(s).`,
);
