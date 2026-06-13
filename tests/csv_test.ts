import { describe, expect, it } from "vitest";

import { parseCsv } from "../src/utils/csv";

describe("parseCsv", () => {
  it("parses a simple comma-delimited file", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("sniffs a semicolon delimiter", () => {
    expect(parseCsv("date;value\n2024-01-01;100")).toEqual([
      ["date", "value"],
      ["2024-01-01", "100"],
    ]);
  });

  it("sniffs a tab delimiter", () => {
    expect(parseCsv("date\tvalue\n2024-01-01\t100")).toEqual([
      ["date", "value"],
      ["2024-01-01", "100"],
    ]);
  });

  it("handles quoted fields with embedded delimiters and quotes", () => {
    expect(parseCsv('name,note\n"Doe, John","say ""hi"""')).toEqual([
      ["name", "note"],
      ["Doe, John", 'say "hi"'],
    ]);
  });

  it("handles CRLF line endings and a leading BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops fully-blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
