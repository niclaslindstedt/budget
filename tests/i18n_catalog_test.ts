// Defense in depth on top of the TypeScript Catalog type: walk the
// English and Swedish catalogs together and assert they have the same
// shape at every level. The type already enforces this at compile
// time, but a runtime check guards against accidental `as any` casts
// and makes the failure mode visible in CI (`make test`).
//
// Also asserts every leaf is a non-empty string, so a placeholder
// `""` someone left during translation surfaces in the test output.
//
// The catalogs are composed from per-namespace files under
// src/i18n/locales/{en,sv}/; this test walks the assembled objects so
// the shape it sees is identical to what the runtime sees.

import { describe, expect, it } from "vitest";

import { en } from "../src/i18n/locales/en";
import { sv } from "../src/i18n/locales/sv";

type AnyObj = Record<string, unknown>;

function walk(
  a: unknown,
  b: unknown,
  path: string,
  diff: { missingInB: string[]; missingInA: string[]; emptyInB: string[] },
): void {
  if (typeof a === "string") {
    if (typeof b !== "string") {
      diff.missingInB.push(path);
      return;
    }
    if (b.length === 0) diff.emptyInB.push(path);
    return;
  }
  if (a && typeof a === "object" && b && typeof b === "object") {
    const aKeys = Object.keys(a as AnyObj);
    const bKeys = Object.keys(b as AnyObj);
    for (const k of aKeys) {
      if (!(k in (b as AnyObj))) {
        diff.missingInB.push(path ? `${path}.${k}` : k);
      } else {
        walk(
          (a as AnyObj)[k],
          (b as AnyObj)[k],
          path ? `${path}.${k}` : k,
          diff,
        );
      }
    }
    for (const k of bKeys) {
      if (!(k in (a as AnyObj))) {
        diff.missingInA.push(path ? `${path}.${k}` : k);
      }
    }
    return;
  }
  diff.missingInB.push(path);
}

describe("i18n catalogs", () => {
  it("Swedish catalog has every key the English catalog has", () => {
    const diff = { missingInB: [], missingInA: [], emptyInB: [] } as {
      missingInB: string[];
      missingInA: string[];
      emptyInB: string[];
    };
    walk(en, sv, "", diff);
    expect(diff.missingInB).toEqual([]);
    expect(diff.missingInA).toEqual([]);
  });

  it("Swedish catalog has no empty-string translations", () => {
    const diff = { missingInB: [], missingInA: [], emptyInB: [] } as {
      missingInB: string[];
      missingInA: string[];
      emptyInB: string[];
    };
    walk(en, sv, "", diff);
    expect(diff.emptyInB).toEqual([]);
  });
});
