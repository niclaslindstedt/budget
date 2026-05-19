#!/usr/bin/env node
// Print the lines of CHANGELOG.md that belong to a single version's
// section. Used by the release workflow to feed the GitHub Release
// body without dragging the whole history along.
//
// Usage: node scripts/release/extract-section.mjs <version>
//
// Slices everything from `## [<version>]` up to (but not including)
// the next `## [` heading. Leading and trailing whitespace inside the
// slice are stripped so the output drops cleanly into `gh release
// create --notes-file`.

import { readFileSync } from "node:fs";

const VERSION = process.argv[2];
if (!VERSION) {
  console.error("usage: extract-section.mjs <version>");
  process.exit(2);
}

const md = readFileSync("CHANGELOG.md", "utf8");
const lines = md.split("\n");
const out = [];
let inSection = false;
for (const line of lines) {
  if (line.startsWith(`## [${VERSION}]`)) {
    inSection = true;
    continue; // drop the heading itself — the release page already shows it
  }
  if (inSection && /^## \[/.test(line)) break;
  if (inSection) out.push(line);
}
if (out.length === 0) {
  console.error(`No section found in CHANGELOG.md for version ${VERSION}`);
  process.exit(1);
}
process.stdout.write(out.join("\n").trim() + "\n");
