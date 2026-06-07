import { describe, expect, it } from "vitest";

import {
  buildPropertyFilePath,
  buildRepairReceiptPath,
  extensionOfPath,
} from "../src/data/items/receipt-name";
import {
  buildPropertyExport,
  type PropertyExportLookups,
} from "../src/data/property-transfer/export";
import {
  parsePropertyManifest,
  planPropertyImport,
} from "../src/data/property-transfer/import";
import { freshUserData } from "../src/storage/local";
import type {
  Company,
  Property,
  PropertyFile,
  PropertyRepair,
  RepairReceipt,
  UserData,
} from "../src/data/types";
import { buildZip, type ZipEntry } from "../src/utils/zip";
import { unzip } from "../src/utils/unzip";

// End-to-end of the data path the `usePropertyAttachments` hook drives, with
// the React + adapter layers replaced by a `Map` byte store: export a
// property to a real ZIP (buildPropertyExport → buildZip), read it back
// (unzip → parsePropertyManifest → planPropertyImport), and re-upload its
// bytes the way the import does. Proves the file / receipt bytes survive the
// archive byte-for-byte and the rebuilt property re-links its references —
// the integration the per-function unit tests can't see on their own.

const SELLER_PUBLIC = "Cabin/files/Manuals/boiler.pdf";
const SELLER_PRIVATE = "Cabin/files/Insurance/policy.pdf";
const SELLER_RECEIPT = "Cabin/receipts/2026-01-20 Snickaren - Kitchen.pdf";

const PUBLIC_BYTES = new Uint8Array([10, 20, 30, 255, 0, 128]);
const PRIVATE_BYTES = new Uint8Array([1, 2, 3]);
const RECEIPT_BYTES = new Uint8Array([200, 150, 100, 50, 0]);

function sellerProperty(): Property {
  return {
    id: "p1",
    name: "Cabin",
    valueHistory: [],
    mortgages: [],
    repairs: [
      {
        id: "r1",
        date: "2026-01-20",
        amount: 6800,
        description: "Kitchen invoice",
        typeId: "preset-type-repairs",
        accountId: "a1",
        sourceHistoryId: "h1",
        receipts: [{ id: "rc1", path: SELLER_RECEIPT, date: "2026-01-20" }],
      },
    ],
    files: [
      { id: "f1", path: SELLER_PUBLIC, description: "Boiler manual" },
      { id: "f2", path: SELLER_PRIVATE, private: true },
    ],
  };
}

function sellerLookups(): PropertyExportLookups {
  return {
    repairMeta: new Map([["r1", { companyName: "Snickaren", tags: [] }]]),
    categoriesById: new Map([
      ["cat-man", { id: "cat-man", name: "Manuals" }],
      ["cat-ins", { id: "cat-ins", name: "Insurance" }],
    ]),
    tagsById: new Map(),
    subtypesById: new Map(),
  };
}

// Mirror `usePropertyAttachments.exportProperty`: fetch the chosen bytes,
// build the manifest, and assemble the ZIP.
function exportToZip(
  property: Property,
  store: ReadonlyMap<string, Uint8Array>,
  options: {
    includePrivate: boolean;
    includeReceipts: boolean;
    includeFinancials: boolean;
  },
): Uint8Array {
  const candidates = new Set<string>();
  for (const f of property.files) {
    if (f.private && !options.includePrivate) continue;
    candidates.add(f.path);
  }
  if (options.includeReceipts)
    for (const r of property.repairs)
      for (const rc of r.receipts ?? []) candidates.add(rc.path);

  const bytesBySource = new Map<string, Uint8Array>();
  for (const path of candidates) {
    const bytes = store.get(path);
    if (bytes) bytesBySource.set(path, bytes);
  }
  const { manifest, binaryEntries } = buildPropertyExport(
    property,
    sellerLookups(),
    options,
    new Set(bytesBySource.keys()),
    "2026-06-07T00:00:00.000Z",
  );
  const entries: ZipEntry[] = [
    { name: "manifest.json", data: `${JSON.stringify(manifest)}\n` },
    ...binaryEntries.map((e) => ({
      name: e.zipPath,
      data: bytesBySource.get(e.sourcePath) as Uint8Array,
    })),
  ];
  return buildZip(entries);
}

// Mirror `usePropertyAttachments.importProperty`: plan, re-upload bytes, and
// rebuild the property. Writes into `targetStore`, returns the new property.
async function importFromZip(
  archive: Uint8Array,
  data: UserData,
  targetStore: Map<string, Uint8Array>,
): Promise<{ property: Property; newCompanies: Company[] }> {
  const zip = await unzip(archive);
  const parsed = parsePropertyManifest(
    new TextDecoder().decode(zip.get("manifest.json")),
  );
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.error}`);
  const plan = planPropertyImport(parsed.manifest, data);

  const categoryNameById = new Map<string, string>();
  for (const c of data.fileCategories) categoryNameById.set(c.id, c.name);
  for (const c of plan.newFileCategories) categoryNameById.set(c.id, c.name);

  const used = new Set<string>();
  const files: PropertyFile[] = [];
  for (const pf of plan.files) {
    const bytes = zip.get(pf.zipPath);
    if (!bytes) continue;
    const path = buildPropertyFilePath({
      propertyName: plan.propertyName,
      fallbackFolder: "Property",
      categoryName: pf.categoryId
        ? categoryNameById.get(pf.categoryId)
        : undefined,
      description: pf.description,
      originalFilename: pf.filename,
      fileId: pf.id,
      usedPaths: used,
    });
    used.add(path);
    targetStore.set(path, bytes);
    const rec: PropertyFile = { id: pf.id, path };
    if (pf.description) rec.description = pf.description;
    if (pf.categoryId) rec.categoryId = pf.categoryId;
    if (pf.private) rec.private = true;
    files.push(rec);
  }

  const repairs: PropertyRepair[] = [];
  for (const pr of plan.repairs) {
    const repair: PropertyRepair = {
      id: pr.id,
      date: pr.date,
      amount: pr.amount,
      description: pr.description,
      typeId: pr.typeId,
    };
    if (pr.companyId) repair.companyId = pr.companyId;
    const receipts: RepairReceipt[] = [];
    for (const mr of pr.receipts ?? []) {
      const bytes = zip.get(mr.zipPath);
      if (!bytes) continue;
      const receiptId = `${pr.id}-${receipts.length}`;
      const path = buildRepairReceiptPath({
        propertyName: plan.propertyName,
        fallbackFolder: "Repairs",
        companyName: "",
        description: pr.description,
        entryDate: mr.date,
        today: "2026-06-07",
        extension: extensionOfPath(mr.zipPath),
        disambiguatorId: receiptId,
        usedPaths: used,
      });
      used.add(path);
      targetStore.set(path, bytes);
      receipts.push({ id: receiptId, path, date: mr.date });
    }
    if (receipts.length > 0) repair.receipts = receipts;
    repairs.push(repair);
  }

  const property: Property = {
    id: plan.propertyId,
    name: plan.propertyName,
    valueHistory: plan.valueHistory,
    mortgages: plan.mortgages,
    repairs,
    files,
  };
  if (plan.lenderCompanyId) property.companyId = plan.lenderCompanyId;
  return { property, newCompanies: plan.newCompanies };
}

describe("property export → import round trip", () => {
  const sellerStore = new Map<string, Uint8Array>([
    [SELLER_PUBLIC, PUBLIC_BYTES],
    [SELLER_PRIVATE, PRIVATE_BYTES],
    [SELLER_RECEIPT, RECEIPT_BYTES],
  ]);

  it("carries non-private files + receipts byte-for-byte to a new owner", async () => {
    const archive = exportToZip(sellerProperty(), sellerStore, {
      includePrivate: false,
      includeReceipts: true,
      includeFinancials: false,
    });

    // Fresh workspace already has a "Snickaren" company — import must re-link
    // it rather than create a duplicate.
    const existing: Company = { id: "co-x", name: "Snickaren" };
    const target: UserData = { ...freshUserData(), companies: [existing] };
    const targetStore = new Map<string, Uint8Array>();
    const { property, newCompanies } = await importFromZip(
      archive,
      target,
      targetStore,
    );

    // Private file stayed home; the public file + receipt came across.
    expect(property.files).toHaveLength(1);
    const importedFile = property.files[0];
    expect(importedFile.description).toBe("Boiler manual");
    expect(targetStore.get(importedFile.path)).toEqual(PUBLIC_BYTES);

    // The receipt's bytes survived and the repair re-linked the contractor.
    const importedRepair = property.repairs[0];
    expect(importedRepair.receipts).toHaveLength(1);
    const importedReceipt = importedRepair.receipts![0];
    expect(importedReceipt.date).toBe("2026-01-20");
    expect(targetStore.get(importedReceipt.path)).toEqual(RECEIPT_BYTES);
    expect(importedRepair.companyId).toBe("co-x");
    expect(newCompanies).toHaveLength(0);

    // The new property got a fresh id; nothing leaked the seller's bytes for
    // the private file.
    expect(property.id).not.toBe("p1");
    expect([...targetStore.values()].some((b) => b === PRIVATE_BYTES)).toBe(
      false,
    );
  });

  it("carries the private file too when opted in", async () => {
    const archive = exportToZip(sellerProperty(), sellerStore, {
      includePrivate: true,
      includeReceipts: true,
      includeFinancials: false,
    });
    const targetStore = new Map<string, Uint8Array>();
    const { property } = await importFromZip(
      archive,
      freshUserData(),
      targetStore,
    );
    expect(property.files).toHaveLength(2);
    const privateFile = property.files.find((f) => f.private);
    expect(privateFile).toBeDefined();
    expect(targetStore.get(privateFile!.path)).toEqual(PRIVATE_BYTES);
  });
});
