import { describe, expect, it } from "vitest";

import { buildReceiptPath, extensionOf } from "../src/data/items/receipt-name";

const BASE = {
  itemName: "iPhone 15 Pro",
  itemId: "a1b2c3d4e5",
  acquiredAt: "2024-01-15",
  today: "2026-06-01",
  extension: "jpg",
  typeLabel: "Electronics",
  uncategorizedLabel: "Uncategorized",
  usedPaths: new Set<string>(),
};

describe("extensionOf", () => {
  it("lower-cases the extension and drops the dot", () => {
    expect(extensionOf("Scan.JPEG")).toBe("jpeg");
    expect(extensionOf("receipt.pdf")).toBe("pdf");
  });
  it("returns empty for a name with no extension or a dotfile", () => {
    expect(extensionOf("receipt")).toBe("");
    expect(extensionOf(".hidden")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
  });
});

describe("buildReceiptPath — presets", () => {
  it("name → just the sanitized name + extension", () => {
    expect(buildReceiptPath({ ...BASE, pattern: "name" })).toBe(
      "iPhone 15 Pro.jpg",
    );
  });
  it("name-date → name then acquired date", () => {
    expect(buildReceiptPath({ ...BASE, pattern: "name-date" })).toBe(
      "iPhone 15 Pro - 2024-01-15.jpg",
    );
  });
  it("date-name → date then name", () => {
    expect(buildReceiptPath({ ...BASE, pattern: "date-name" })).toBe(
      "2024-01-15 - iPhone 15 Pro.jpg",
    );
  });
  it("type-name-date → files under a type subdirectory", () => {
    expect(buildReceiptPath({ ...BASE, pattern: "type-name-date" })).toBe(
      "Electronics/iPhone 15 Pro - 2024-01-15.jpg",
    );
  });
});

describe("buildReceiptPath — fallbacks", () => {
  it("falls back to today when no acquired date is set", () => {
    expect(
      buildReceiptPath({
        ...BASE,
        pattern: "name-date",
        acquiredAt: undefined,
      }),
    ).toBe("iPhone 15 Pro - 2026-06-01.jpg");
  });
  it("files an unclassified item under the uncategorized label", () => {
    expect(
      buildReceiptPath({
        ...BASE,
        pattern: "type-name-date",
        typeLabel: undefined,
      }),
    ).toBe("Uncategorized/iPhone 15 Pro - 2024-01-15.jpg");
  });
  it("omits the extension when none is given", () => {
    expect(buildReceiptPath({ ...BASE, pattern: "name", extension: "" })).toBe(
      "iPhone 15 Pro",
    );
  });
});

describe("buildReceiptPath — sanitization", () => {
  it("strips path separators and illegal characters from the name", () => {
    expect(
      buildReceiptPath({
        ...BASE,
        pattern: "name",
        itemName: 'A/B: weird*name?"<>|',
      }),
    ).toBe("A B weird name.jpg");
  });
  it("strips separators from the type subdirectory too", () => {
    expect(
      buildReceiptPath({
        ...BASE,
        pattern: "type-name-date",
        typeLabel: "Home/Office",
      }),
    ).toBe("Home Office/iPhone 15 Pro - 2024-01-15.jpg");
  });
});

describe("buildReceiptPath — collision", () => {
  it("appends a short id suffix when the name collides with another item", () => {
    const usedPaths = new Set(["iPhone 15 Pro - 2024-01-15.jpg"]);
    expect(buildReceiptPath({ ...BASE, pattern: "name-date", usedPaths })).toBe(
      "iPhone 15 Pro - 2024-01-15 (a1b2c3).jpg",
    );
  });
  it("keeps the suffix inside the subdirectory for the type pattern", () => {
    const usedPaths = new Set(["Electronics/iPhone 15 Pro - 2024-01-15.jpg"]);
    expect(
      buildReceiptPath({ ...BASE, pattern: "type-name-date", usedPaths }),
    ).toBe("Electronics/iPhone 15 Pro - 2024-01-15 (a1b2c3).jpg");
  });
});
