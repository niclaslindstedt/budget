import { describe, expect, it } from "vitest";

import { evaluateExpression } from "../src/utils/calc";

describe("evaluateExpression", () => {
  it("adds a list of amounts", () => {
    expect(evaluateExpression("100+30+50")).toBe(180);
  });

  it("tolerates whitespace around operators", () => {
    expect(evaluateExpression("100 + 30 + 50")).toBe(180);
  });

  it("supports subtraction, multiplication and division", () => {
    expect(evaluateExpression("100-30")).toBe(70);
    expect(evaluateExpression("12*3")).toBe(36);
    expect(evaluateExpression("90/3")).toBe(30);
  });

  it("honours operator precedence and parentheses", () => {
    expect(evaluateExpression("2+3*4")).toBe(14);
    expect(evaluateExpression("(2+3)*4")).toBe(20);
  });

  it("handles unary signs", () => {
    expect(evaluateExpression("-50")).toBe(-50);
    expect(evaluateExpression("100+-30")).toBe(70);
  });

  it("treats a comma as a decimal separator", () => {
    expect(evaluateExpression("12,5+2,5")).toBe(15);
  });

  it("accepts a dot as a decimal separator", () => {
    expect(evaluateExpression("12.5+2.5")).toBe(15);
  });

  it("returns null for an empty expression", () => {
    expect(evaluateExpression("")).toBeNull();
    expect(evaluateExpression("   ")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(evaluateExpression("100+")).toBeNull();
    expect(evaluateExpression("100 30")).toBeNull();
    expect(evaluateExpression("*2")).toBeNull();
    expect(evaluateExpression("abc")).toBeNull();
    expect(evaluateExpression("(1+2")).toBeNull();
    expect(evaluateExpression("1.2.3")).toBeNull();
  });

  it("returns null on division by zero", () => {
    expect(evaluateExpression("10/0")).toBeNull();
  });
});
