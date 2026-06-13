import { describe, expect, it } from "vitest";

import {
  buildPoints,
  columnLabel,
  mergeImportedPoints,
  readTabularFile,
  resolveDayFirst,
  suggestColumns,
  type ImportedPoint,
  type TabularGrid,
} from "../src/data/import/value-import";

function csv(text: string): Promise<TabularGrid> {
  return readTabularFile("data.csv", new TextEncoder().encode(text).buffer);
}

describe("readTabularFile (csv)", () => {
  it("treats a text first row as a header", async () => {
    const grid = await csv("Date,Value\n2024-01-01,100\n2024-02-01,200");
    expect(grid.headers).toEqual(["Date", "Value"]);
    expect(grid.rows).toHaveLength(2);
  });

  it("synthesises column labels when the first row is data", async () => {
    const grid = await csv("2024-01-01,100\n2024-02-01,200");
    expect(grid.headers).toEqual(["A", "B"]);
    expect(grid.rows).toHaveLength(2);
  });
});

describe("suggestColumns", () => {
  it("picks the date column and a distinct value column", async () => {
    const grid = await csv(
      "Date,Note,Value\n2024-01-01,hello,100\n2024-02-01,world,200",
    );
    expect(suggestColumns(grid)).toEqual({ dateColumn: 0, valueColumn: 2 });
  });

  it("uses header keywords to break ties between numeric columns", async () => {
    const grid = await csv(
      "Date,Shares,Balance\n2024-01-01,10,1000\n2024-02-01,20,2000",
    );
    const { dateColumn, valueColumn } = suggestColumns(grid);
    expect(dateColumn).toBe(0);
    expect(valueColumn).toBe(2); // "Balance" keyword beats "Shares"
  });

  it("returns null columns for an unrecognisable grid", async () => {
    const grid = await csv("Note\nhello\nworld");
    expect(suggestColumns(grid)).toEqual({
      dateColumn: null,
      valueColumn: null,
    });
  });
});

describe("buildPoints", () => {
  it("builds points from the chosen columns and skips unparseable rows", async () => {
    const grid = await csv(
      "Date,Value\n2024-01-01,100\nbad,200\n2024-03-01,oops\n2024-04-01,400",
    );
    const dayFirst = resolveDayFirst(grid, 0, "YYYY-MM-DD");
    const points = buildPoints(grid, {
      dateColumn: 0,
      valueColumn: 1,
      dayFirst,
    });
    expect(points).toEqual([
      { date: "2024-01-01", value: 100 },
      { date: "2024-04-01", value: 400 },
    ]);
  });

  it("applies the sign transform (magnitude by default)", async () => {
    const grid = await csv("Date,Value\n2024-01-01,-100");
    const abs = buildPoints(
      grid,
      { dateColumn: 0, valueColumn: 1, dayFirst: true },
      Math.abs,
    );
    expect(abs[0].value).toBe(100);
    const signed = buildPoints(grid, {
      dateColumn: 0,
      valueColumn: 1,
      dayFirst: true,
    });
    expect(signed[0].value).toBe(-100);
  });
});

describe("mergeImportedPoints", () => {
  const id = () => "mint";
  const make = (p: { id: string; date: string; value: number }) => p;

  it("merges one-per-date, replacing existing points on covered dates and reusing ids", () => {
    const existing = [
      { id: "a", date: "2024-01-01", value: 10 },
      { id: "b", date: "2024-02-01", value: 20 },
    ];
    const incoming: ImportedPoint[] = [
      { date: "2024-02-01", value: 99 },
      { date: "2024-03-01", value: 30 },
    ];
    const merged = mergeImportedPoints(existing, incoming, id, make);
    expect(merged).toEqual([
      { id: "a", date: "2024-01-01", value: 10 }, // untouched
      { id: "b", date: "2024-02-01", value: 99 }, // replaced, id reused
      { id: "mint", date: "2024-03-01", value: 30 }, // new
    ]);
  });

  it("last incoming point on a date wins", () => {
    const incoming: ImportedPoint[] = [
      { date: "2024-01-01", value: 1 },
      { date: "2024-01-01", value: 2 },
    ];
    const merged = mergeImportedPoints([], incoming, id, make);
    expect(merged).toEqual([{ id: "mint", date: "2024-01-01", value: 2 }]);
  });

  it("returns existing unchanged when nothing is imported", () => {
    const existing = [{ id: "a", date: "2024-01-01", value: 10 }];
    expect(mergeImportedPoints(existing, [], id, make)).toEqual(existing);
  });
});

describe("columnLabel", () => {
  it("matches spreadsheet column naming", () => {
    expect(columnLabel(0)).toBe("A");
    expect(columnLabel(25)).toBe("Z");
    expect(columnLabel(26)).toBe("AA");
    expect(columnLabel(27)).toBe("AB");
  });
});
