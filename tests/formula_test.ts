import { describe, expect, it } from "vitest";

import {
  evaluateFormula,
  formulaToDisplay,
  formulaToStored,
  parseFormula,
} from "../src/data/budget/formula";
import type {
  FormulaContext,
  MonthAggregates,
} from "../src/data/budget/formula";
import type { Sheet } from "../src/data/types";

function emptyMonth(
  opening: number,
  overrides: Partial<MonthAggregates> = {},
): MonthAggregates {
  return {
    openingBalance: opening,
    income: 0,
    expenses: 0,
    net: 0,
    uncategorized: 0,
    byCategory: new Map(),
    byType: new Map(),
    ...overrides,
  };
}

function ctx(overrides: Partial<FormulaContext> = {}): FormulaContext {
  return {
    thisMonth: emptyMonth(0),
    prevMonth: emptyMonth(0),
    balanceBefore: 0,
    endOfMonthBalance: 0,
    lookupSheet: () => null,
    ...overrides,
  };
}

function evalOk(src: string, c: FormulaContext): number {
  const p = parseFormula(src);
  if (!p.ok) throw new Error(`parse failed: ${p.error}`);
  const e = evaluateFormula(p.ast, c);
  if (!e.ok) throw new Error(`eval failed: ${e.error}`);
  return e.value;
}

describe("parseFormula", () => {
  it("rejects empty input", () => {
    const r = parseFormula("");
    expect(r.ok).toBe(false);
  });

  it("parses numbers, arithmetic and operator precedence", () => {
    expect(evalOk("1 + 2 * 3", ctx())).toBe(7);
    expect(evalOk("(1 + 2) * 3", ctx())).toBe(9);
    expect(evalOk("10 / 4", ctx())).toBe(2.5);
    expect(evalOk("-5 + 2", ctx())).toBe(-3);
  });

  it("rejects mismatched parens and trailing input", () => {
    expect(parseFormula("(1 + 2").ok).toBe(false);
    expect(parseFormula("1 + 2 3").ok).toBe(false);
  });
});

describe("evaluateFormula — variables", () => {
  it("resolves single-name variables", () => {
    expect(
      evalOk("endOfMonthBalance - 5000", ctx({ endOfMonthBalance: 7000 })),
    ).toBe(2000);
    expect(evalOk("balanceBefore + 100", ctx({ balanceBefore: 250 }))).toBe(
      350,
    );
  });

  it("resolves prevMonth.* properties", () => {
    const c = ctx({
      prevMonth: emptyMonth(1000, { income: 500, expenses: -200, net: 300 }),
    });
    expect(evalOk("prevMonth.endingBalance", c)).toBe(1300);
    expect(evalOk("prevMonth.income + prevMonth.expenses", c)).toBe(300);
  });

  it("errors on unknown variables", () => {
    const p = parseFormula("nope");
    if (!p.ok) throw new Error("expected parse to succeed");
    const r = evaluateFormula(p.ast, ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Unknown variable "nope"/);
  });
});

describe("evaluateFormula — functions", () => {
  it("min/max/clamp/abs/round", () => {
    expect(evalOk("min(3, 5, 1)", ctx())).toBe(1);
    expect(evalOk("max(3, 5, 1)", ctx())).toBe(5);
    expect(evalOk("clamp(7, 0, 5)", ctx())).toBe(5);
    expect(evalOk("clamp(-1, 0, 5)", ctx())).toBe(0);
    expect(evalOk("abs(-3.5)", ctx())).toBe(3.5);
    expect(evalOk("round(1.49)", ctx())).toBe(1);
    expect(evalOk("round(1.555, 2)", ctx())).toBe(1.56);
  });

  it("categoryTotal / typeTotal read the month maps", () => {
    const c = ctx({
      thisMonth: emptyMonth(0, {
        byCategory: new Map([["groc", -1200]]),
        byType: new Map([["sub", -99]]),
      }),
    });
    expect(evalOk('categoryTotal("groc")', c)).toBe(-1200);
    expect(evalOk('typeTotal("sub")', c)).toBe(-99);
    // Missing id returns 0.
    expect(evalOk('categoryTotal("nope")', c)).toBe(0);
  });

  it("sheet(id).<prop> dispatches via the lookupSheet callback", () => {
    const c = ctx({
      lookupSheet: (id, prop) => {
        if (id !== "sht_wife") return null;
        if (prop === "endOfMonthBalance") return 1234;
        return null;
      },
    });
    expect(evalOk('5000 - sheet("sht_wife").endOfMonthBalance', c)).toBe(3766);
  });

  it("sheet(id) errors on unknown id", () => {
    const p = parseFormula('sheet("missing").endOfMonthBalance');
    if (!p.ok) throw new Error("parse");
    const r = evaluateFormula(p.ast, ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Unknown sheet "missing"/);
  });

  it("sheet(id, variable) — new comma form with an identifier arg", () => {
    const c = ctx({
      lookupSheet: (id, prop) =>
        id === "sht_wife" && prop === "endOfMonthBalance" ? 1234 : null,
    });
    expect(evalOk('5000 - sheet("sht_wife", endOfMonthBalance)', c)).toBe(3766);
  });

  it("sheet(id, variable) — comma form accepts a quoted property too", () => {
    const c = ctx({
      lookupSheet: (id, prop) =>
        id === "sht_wife" && prop === "net" ? 42 : null,
    });
    expect(evalOk('sheet("sht_wife", "net")', c)).toBe(42);
  });

  it("division by zero errors", () => {
    const p = parseFormula("1 / 0");
    if (!p.ok) throw new Error("parse");
    const r = evaluateFormula(p.ast, ctx());
    expect(r.ok).toBe(false);
  });
});

describe("formulaToDisplay / formulaToStored", () => {
  const sheets: Sheet[] = [
    {
      id: "sht_a",
      name: "Wife",
      type: "budget",
      glyph: "wallet",
      color: "#000",
      description: "",
      items: [],
    },
    {
      id: "sht_b",
      name: "Vacation",
      type: "budget",
      glyph: "plane",
      color: "#000",
      description: "",
      items: [],
    },
  ];

  it("rewrites stored ids to current names for display", () => {
    expect(
      formulaToDisplay('5000 - sheet("sht_a").endOfMonthBalance', sheets),
    ).toBe('5000 - sheet("Wife").endOfMonthBalance');
  });

  it("rewrites display names to stable ids on submit", () => {
    const r = formulaToStored('5000 - sheet("Wife").endOfMonthBalance', sheets);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.formula).toBe('5000 - sheet("sht_a").endOfMonthBalance');
  });

  it("passes ids through as-is so JSON exports round-trip", () => {
    const r = formulaToStored('sheet("sht_b").net', sheets);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.formula).toBe('sheet("sht_b").net');
  });

  it("rejects unknown sheet names", () => {
    const r = formulaToStored('sheet("Nope").net', sheets);
    expect(r.ok).toBe(false);
  });

  it("rejects ambiguous sheet names", () => {
    const dup: Sheet[] = [
      ...sheets,
      {
        id: "sht_c",
        name: "Wife",
        type: "budget",
        glyph: "wallet",
        color: "#000",
        description: "",
        items: [],
      },
    ];
    const r = formulaToStored('sheet("Wife").net', dup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Multiple sheets named/);
  });

  it("display preserves unknown ids verbatim so broken refs are visible", () => {
    expect(formulaToDisplay('sheet("sht_gone").net', sheets)).toBe(
      'sheet("sht_gone").net',
    );
  });

  it("display rewrites ids in the new comma form too", () => {
    expect(formulaToDisplay('sheet("sht_a", endOfMonthBalance)', sheets)).toBe(
      'sheet("Wife", endOfMonthBalance)',
    );
  });

  it("stored rewrites names in the new comma form too", () => {
    const r = formulaToStored('sheet("Wife", endOfMonthBalance)', sheets);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.formula).toBe('sheet("sht_a", endOfMonthBalance)');
  });
});
