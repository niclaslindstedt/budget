import { describe, expect, it } from "vitest";

import {
  buildPropertyExport,
  type PropertyExportLookups,
} from "../src/data/property-transfer/export";
import {
  parsePropertyManifest,
  planPropertyImport,
} from "../src/data/property-transfer/import";
import {
  PROPERTY_EXPORT_FORMAT,
  type PropertyExportManifest,
} from "../src/data/property-transfer/manifest";
import { serializePropertyManifest } from "../src/data/property-transfer/export";
import { freshUserData } from "../src/storage/local";
import type {
  Company,
  FileCategory,
  Property,
  Subtype,
  Tag,
  UserData,
} from "../src/data/types";

const PUBLIC_PATH = "Cabin/files/manual.pdf";
const PRIVATE_PATH = "Cabin/files/Insurance/policy.pdf";
const RECEIPT_PATH = "Cabin/receipts/2026-01-20 Snickaren - Kitchen.pdf";

// A property exercising every export branch: a public + a private file, a
// transaction-backed repair with a receipt + subtype + tags, mortgages with
// payment history, a lender, a purchase price and a value point.
function sampleProperty(): Property {
  return {
    id: "p1",
    name: "Cabin",
    companyId: "co-lender",
    size: 64,
    purchaseAmount: 1_500_000,
    purchaseDate: "2020-06-01",
    valueHistory: [{ id: "v1", date: "2026-01-01", value: 2_100_000 }],
    mortgages: [
      {
        id: "m1",
        name: "SBAB loan",
        loanAmount: 1_000_000,
        payments: [
          {
            id: "pay1",
            date: "2026-01-25",
            amount: 4200,
            sourceHistoryId: "h9",
          },
        ],
      },
    ],
    repairs: [
      {
        id: "r1",
        date: "2026-01-20",
        amount: 6800,
        description: "Kitchen invoice",
        typeId: "preset-type-repairs",
        subtypeId: "sub-paint",
        accountId: "a1",
        sourceHistoryId: "h1",
        receipts: [{ id: "rc1", path: RECEIPT_PATH, date: "2026-01-20" }],
      },
    ],
    files: [
      { id: "f1", path: PUBLIC_PATH },
      { id: "f2", path: PRIVATE_PATH, private: true },
    ],
  };
}

function sampleLookups(): PropertyExportLookups {
  return {
    lenderName: "SBAB",
    repairMeta: new Map([
      [
        "r1",
        {
          companyName: "Snickaren",
          tags: [{ name: "Deductible", color: "#0a0" }],
        },
      ],
    ]),
    categoriesById: new Map<string, FileCategory>([
      ["cat-ins", { id: "cat-ins", name: "Insurance" }],
    ]),
    tagsById: new Map<string, Tag>(),
    subtypesById: new Map<string, Subtype>([
      [
        "sub-paint",
        { id: "sub-paint", name: "Painting", typeId: "preset-type-repairs" },
      ],
    ]),
  };
}

const ALL_PATHS = new Set([PUBLIC_PATH, PRIVATE_PATH, RECEIPT_PATH]);

describe("buildPropertyExport", () => {
  it("excludes private files and includes receipts by default", () => {
    const { manifest, binaryEntries } = buildPropertyExport(
      sampleProperty(),
      sampleLookups(),
      {
        includePrivate: false,
        includeReceipts: true,
        includeFinancials: false,
      },
      ALL_PATHS,
      "2026-06-07T00:00:00.000Z",
    );

    expect(manifest.format).toBe(PROPERTY_EXPORT_FORMAT);
    // Only the public file; the private one is held back.
    expect(manifest.files.map((f) => f.id)).toEqual(["f1"]);
    // The repair carries its resolved company / subtype / tags + a receipt.
    expect(manifest.repairs[0].companyName).toBe("Snickaren");
    expect(manifest.repairs[0].subtypeName).toBe("Painting");
    expect(manifest.repairs[0].receipts).toHaveLength(1);
    expect(manifest.repairs[0].receipts?.[0].date).toBe("2026-01-20");
    // Financials stay out by default.
    expect(manifest.financials).toBeUndefined();
    // The public file + the receipt are the bundled bytes.
    expect(binaryEntries.map((e) => e.sourcePath).sort()).toEqual(
      [PUBLIC_PATH, RECEIPT_PATH].sort(),
    );
  });

  it("includes private files when opted in", () => {
    const { manifest } = buildPropertyExport(
      sampleProperty(),
      sampleLookups(),
      { includePrivate: true, includeReceipts: true, includeFinancials: false },
      ALL_PATHS,
      "2026-06-07T00:00:00.000Z",
    );
    expect(manifest.files.map((f) => f.id).sort()).toEqual(["f1", "f2"]);
    expect(manifest.files.find((f) => f.id === "f2")?.private).toBe(true);
  });

  it("drops receipt bytes when receipts are excluded", () => {
    const { manifest, binaryEntries } = buildPropertyExport(
      sampleProperty(),
      sampleLookups(),
      {
        includePrivate: false,
        includeReceipts: false,
        includeFinancials: false,
      },
      ALL_PATHS,
      "2026-06-07T00:00:00.000Z",
    );
    expect(manifest.repairs[0].receipts).toBeUndefined();
    expect(binaryEntries.some((e) => e.sourcePath === RECEIPT_PATH)).toBe(
      false,
    );
  });

  it("includes mortgages + financials when opted in, stripping payment source ids", () => {
    const { manifest } = buildPropertyExport(
      sampleProperty(),
      sampleLookups(),
      { includePrivate: false, includeReceipts: true, includeFinancials: true },
      ALL_PATHS,
      "2026-06-07T00:00:00.000Z",
    );
    expect(manifest.financials?.lenderName).toBe("SBAB");
    expect(manifest.financials?.purchaseAmount).toBe(1_500_000);
    expect(manifest.financials?.valueHistory?.length).toBe(1);
    expect(manifest.financials?.mortgages?.length).toBe(1);
    // The payment's bank-import id must not leak into the archive.
    expect(manifest.financials?.mortgages?.[0].payments[0]).not.toHaveProperty(
      "sourceHistoryId",
    );
  });

  it("drops a file whose bytes weren't fetched", () => {
    const { manifest, binaryEntries } = buildPropertyExport(
      sampleProperty(),
      sampleLookups(),
      { includePrivate: true, includeReceipts: true, includeFinancials: false },
      new Set([PRIVATE_PATH, RECEIPT_PATH]), // PUBLIC_PATH missing
      "2026-06-07T00:00:00.000Z",
    );
    expect(manifest.files.map((f) => f.id)).toEqual(["f2"]);
    expect(binaryEntries.some((e) => e.sourcePath === PUBLIC_PATH)).toBe(false);
  });
});

describe("parsePropertyManifest", () => {
  it("round-trips a serialized manifest", () => {
    const { manifest } = buildPropertyExport(
      sampleProperty(),
      sampleLookups(),
      { includePrivate: true, includeReceipts: true, includeFinancials: true },
      ALL_PATHS,
      "2026-06-07T00:00:00.000Z",
    );
    const parsed = parsePropertyManifest(serializePropertyManifest(manifest));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.manifest.property.name).toBe("Cabin");
  });

  it("rejects a non-property-export file", () => {
    const parsed = parsePropertyManifest('{"foo":1}');
    expect(parsed).toEqual({ ok: false, error: "not-a-property-export" });
  });

  it("rejects a newer-format archive", () => {
    const parsed = parsePropertyManifest(
      JSON.stringify({
        format: PROPERTY_EXPORT_FORMAT,
        version: 999,
        property: { name: "X" },
      }),
    );
    expect(parsed).toEqual({ ok: false, error: "newer-version" });
  });
});

describe("planPropertyImport", () => {
  function manifestWith(companyName: string): PropertyExportManifest {
    return {
      format: PROPERTY_EXPORT_FORMAT,
      version: 1,
      exportedAt: "2026-06-07T00:00:00.000Z",
      property: { name: "Cabin" },
      repairs: [
        {
          id: "r1",
          date: "2026-01-20",
          amount: 6800,
          description: "Kitchen invoice",
          typeId: "preset-type-repairs",
          companyName,
          tags: [{ name: "Deductible", color: "#0a0" }],
        },
      ],
      files: [],
    };
  }

  it("re-links a contractor that already exists by name (case-insensitive)", () => {
    const existing: Company = { id: "co-existing", name: "Snickaren" };
    const data: UserData = { ...freshUserData(), companies: [existing] };
    const plan = planPropertyImport(manifestWith("snickaren"), data);
    expect(plan.newCompanies).toHaveLength(0);
    expect(plan.repairs[0].companyId).toBe("co-existing");
    // The tag didn't exist, so it's scheduled for creation.
    expect(plan.newTags).toHaveLength(1);
    expect(plan.repairs[0].tagIds).toEqual([plan.newTags[0].id]);
  });

  it("creates a contractor company when none matches", () => {
    const plan = planPropertyImport(manifestWith("Måleri AB"), freshUserData());
    expect(plan.newCompanies).toHaveLength(1);
    expect(plan.newCompanies[0].name).toBe("Måleri AB");
    expect(plan.repairs[0].companyId).toBe(plan.newCompanies[0].id);
    // A fresh property id is minted (not the archive's "p1"-style id).
    expect(plan.propertyId).toBeTruthy();
    expect(plan.propertyName).toBe("Cabin");
  });
});
