import { describe, expect, it } from "vitest";

import {
  buildPropertyFilePath,
  buildReceiptPath,
  buildRepairReceiptPath,
  extensionOf,
  extensionOfPath,
} from "../src/data/items/receipt-name";

const BASE = {
  companyName: "Apple Store",
  entryId: "a1b2c3d4e5",
  entryDate: "2024-01-15",
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
  it("name → just the sanitized company name + extension", () => {
    expect(buildReceiptPath({ ...BASE, pattern: "name" })).toBe(
      "Apple Store.jpg",
    );
  });
  it("name-date → company then transaction date", () => {
    expect(buildReceiptPath({ ...BASE, pattern: "name-date" })).toBe(
      "Apple Store - 2024-01-15.jpg",
    );
  });
  it("date-name → date then company", () => {
    expect(buildReceiptPath({ ...BASE, pattern: "date-name" })).toBe(
      "2024-01-15 - Apple Store.jpg",
    );
  });
  it("type-name-date → files under a type subdirectory", () => {
    expect(buildReceiptPath({ ...BASE, pattern: "type-name-date" })).toBe(
      "Electronics/Apple Store - 2024-01-15.jpg",
    );
  });
});

describe("buildReceiptPath — fallbacks", () => {
  it("falls back to today when no transaction date is set", () => {
    expect(
      buildReceiptPath({
        ...BASE,
        pattern: "name-date",
        entryDate: undefined,
      }),
    ).toBe("Apple Store - 2026-06-01.jpg");
  });
  it("falls back to the literal receipt when the company name is empty", () => {
    expect(
      buildReceiptPath({ ...BASE, pattern: "name", companyName: "" }),
    ).toBe("receipt.jpg");
  });
  it("files an unclassified transaction under the uncategorized label", () => {
    expect(
      buildReceiptPath({
        ...BASE,
        pattern: "type-name-date",
        typeLabel: undefined,
      }),
    ).toBe("Uncategorized/Apple Store - 2024-01-15.jpg");
  });
  it("omits the extension when none is given", () => {
    expect(buildReceiptPath({ ...BASE, pattern: "name", extension: "" })).toBe(
      "Apple Store",
    );
  });
});

describe("buildReceiptPath — sanitization", () => {
  it("strips path separators and illegal characters from the name", () => {
    expect(
      buildReceiptPath({
        ...BASE,
        pattern: "name",
        companyName: 'A/B: weird*name?"<>|',
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
    ).toBe("Home Office/Apple Store - 2024-01-15.jpg");
  });
});

describe("buildReceiptPath — collision", () => {
  it("appends a short id suffix when the name collides with another receipt", () => {
    const usedPaths = new Set(["Apple Store - 2024-01-15.jpg"]);
    expect(buildReceiptPath({ ...BASE, pattern: "name-date", usedPaths })).toBe(
      "Apple Store - 2024-01-15 (a1b2c3).jpg",
    );
  });
  it("keeps the suffix inside the subdirectory for the type pattern", () => {
    const usedPaths = new Set(["Electronics/Apple Store - 2024-01-15.jpg"]);
    expect(
      buildReceiptPath({ ...BASE, pattern: "type-name-date", usedPaths }),
    ).toBe("Electronics/Apple Store - 2024-01-15 (a1b2c3).jpg");
  });
});

describe("extensionOfPath", () => {
  it("reads the extension off the final segment only", () => {
    expect(extensionOfPath("Apt 2.0/2024-01-15 X - Y.pdf")).toBe("pdf");
    // A dot in the folder must not be mistaken for the file's extension.
    expect(extensionOfPath("Apt 2.0/2024-01-15 X - Y")).toBe("");
    expect(extensionOfPath("no-folder.JPG")).toBe("jpg");
  });
});

const REPAIR_BASE = {
  propertyName: "Holiday Cabin",
  fallbackFolder: "Repairs",
  companyName: "Rörmokare Andersson",
  description: "Repainted the kitchen",
  entryDate: "2024-01-15",
  today: "2026-06-01",
  extension: "pdf",
  repairId: "r1a2b3c4d5",
  usedPaths: new Set<string>(),
};

describe("buildRepairReceiptPath", () => {
  it("files under the property folder as <date> <company> - <description>", () => {
    expect(buildRepairReceiptPath(REPAIR_BASE)).toBe(
      "Holiday Cabin/receipts/2024-01-15 Rörmokare Andersson - Repainted the kitchen.pdf",
    );
  });
  it("drops the description segment when there is none", () => {
    expect(buildRepairReceiptPath({ ...REPAIR_BASE, description: "" })).toBe(
      "Holiday Cabin/receipts/2024-01-15 Rörmokare Andersson.pdf",
    );
  });
  it("uses date - description when the company is unresolved", () => {
    expect(buildRepairReceiptPath({ ...REPAIR_BASE, companyName: "" })).toBe(
      "Holiday Cabin/receipts/2024-01-15 - Repainted the kitchen.pdf",
    );
  });
  it("falls back to just the date with neither company nor description", () => {
    expect(
      buildRepairReceiptPath({
        ...REPAIR_BASE,
        companyName: "",
        description: "",
      }),
    ).toBe("Holiday Cabin/receipts/2024-01-15.pdf");
  });
  it("falls back to today and the fallback folder when both are blank", () => {
    expect(
      buildRepairReceiptPath({
        ...REPAIR_BASE,
        propertyName: "  ",
        entryDate: undefined,
      }),
    ).toBe(
      "Repairs/receipts/2026-06-01 Rörmokare Andersson - Repainted the kitchen.pdf",
    );
  });
  it("sanitizes the property folder and the name segments", () => {
    expect(
      buildRepairReceiptPath({
        ...REPAIR_BASE,
        propertyName: "A/B: Cabin",
        companyName: "Boss*Co?",
      }),
    ).toBe("A B Cabin/receipts/2024-01-15 Boss Co - Repainted the kitchen.pdf");
  });
  it("appends a short repair-id suffix on a name collision", () => {
    const usedPaths = new Set([
      "Holiday Cabin/receipts/2024-01-15 Rörmokare Andersson - Repainted the kitchen.pdf",
    ]);
    expect(buildRepairReceiptPath({ ...REPAIR_BASE, usedPaths })).toBe(
      "Holiday Cabin/receipts/2024-01-15 Rörmokare Andersson - Repainted the kitchen (r1a2b3).pdf",
    );
  });
  it("omits the extension when none is given", () => {
    expect(buildRepairReceiptPath({ ...REPAIR_BASE, extension: "" })).toBe(
      "Holiday Cabin/receipts/2024-01-15 Rörmokare Andersson - Repainted the kitchen",
    );
  });
});

const FILE_BASE = {
  propertyName: "Holiday Cabin",
  fallbackFolder: "Repairs",
  description: "Kitchen before renovation",
  originalFilename: "Scan 1.JPG",
  fileId: "f1a2b3c4d5",
  usedPaths: new Set<string>(),
};

describe("buildPropertyFilePath", () => {
  it("files under <property>/files with the description as the name", () => {
    expect(buildPropertyFilePath(FILE_BASE)).toBe(
      "Holiday Cabin/files/Kitchen before renovation.jpg",
    );
  });
  it("nests under a category subfolder when given", () => {
    expect(
      buildPropertyFilePath({ ...FILE_BASE, categoryName: "Insurance" }),
    ).toBe("Holiday Cabin/files/Insurance/Kitchen before renovation.jpg");
  });
  it("falls back to the uploaded filename stem with no description", () => {
    expect(buildPropertyFilePath({ ...FILE_BASE, description: "" })).toBe(
      "Holiday Cabin/files/Scan 1.jpg",
    );
  });
  it("sanitizes the property, category, and name segments", () => {
    expect(
      buildPropertyFilePath({
        ...FILE_BASE,
        propertyName: "A/B: Cabin",
        categoryName: "Tax: 2026",
        description: "Roof*report?",
      }),
    ).toBe("A B Cabin/files/Tax 2026/Roof report.jpg");
  });
  it("falls back to the fallback folder when the property name is blank", () => {
    expect(buildPropertyFilePath({ ...FILE_BASE, propertyName: "  " })).toBe(
      "Repairs/files/Kitchen before renovation.jpg",
    );
  });
  it("appends a short file-id suffix on a name collision", () => {
    const usedPaths = new Set([
      "Holiday Cabin/files/Kitchen before renovation.jpg",
    ]);
    expect(buildPropertyFilePath({ ...FILE_BASE, usedPaths })).toBe(
      "Holiday Cabin/files/Kitchen before renovation (f1a2b3).jpg",
    );
  });
});
