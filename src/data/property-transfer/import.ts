// Parsing + planning for importing a property-export archive into the
// current workspace. `parsePropertyManifest` validates the archive's
// `manifest.json`; `planPropertyImport` turns it into a concrete plan — a
// fresh `Property` plus the companies / tags / file categories / repair
// subtypes that must be created to re-link the denormalized names. The
// byte I/O (reading the ZIP, re-uploading files) lives in the attachment
// hook; this module is pure so it can be unit-tested without an adapter.

import { newId } from "../sheet";
import type {
  Company,
  FileCategory,
  Mortgage,
  MortgagePayment,
  PropertyValuePoint,
  Subtype,
  Tag,
  UserData,
} from "../types";
import {
  PROPERTY_EXPORT_FORMAT,
  PROPERTY_EXPORT_VERSION,
  type ManifestTag,
  type PropertyExportManifest,
} from "./manifest";

export type ParseManifestResult =
  | { ok: true; manifest: PropertyExportManifest }
  | { ok: false; error: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Validate the archive's `manifest.json`. Version-guarded like
// `parseUserData`: a newer-format archive is rejected rather than
// half-read. The body is coerced leniently — a malformed repair / file is
// dropped rather than failing the whole import.
export function parsePropertyManifest(text: string): ParseManifestResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid-json" };
  }
  if (!isObject(raw)) return { ok: false, error: "invalid-manifest" };
  if (raw.format !== PROPERTY_EXPORT_FORMAT)
    return { ok: false, error: "not-a-property-export" };
  if (typeof raw.version !== "number")
    return { ok: false, error: "invalid-manifest" };
  if (raw.version > PROPERTY_EXPORT_VERSION)
    return { ok: false, error: "newer-version" };
  if (!isObject(raw.property) || typeof raw.property.name !== "string")
    return { ok: false, error: "invalid-manifest" };

  const property: PropertyExportManifest["property"] = {
    name: raw.property.name,
  };
  if (
    typeof raw.property.size === "number" &&
    Number.isFinite(raw.property.size)
  )
    property.size = raw.property.size;

  const manifest: PropertyExportManifest = {
    format: PROPERTY_EXPORT_FORMAT,
    version: raw.version,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
    property,
    repairs: Array.isArray(raw.repairs) ? coerceRepairs(raw.repairs) : [],
    files: Array.isArray(raw.files) ? coerceFiles(raw.files) : [],
  };
  if (typeof raw.appVersion === "string") manifest.appVersion = raw.appVersion;
  if (isObject(raw.financials))
    manifest.financials = coerceFinancials(raw.financials);
  return { ok: true, manifest };
}

function coerceTags(raw: unknown): ManifestTag[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ManifestTag[] = [];
  for (const t of raw) {
    if (
      isObject(t) &&
      typeof t.name === "string" &&
      typeof t.color === "string"
    )
      out.push({ name: t.name, color: t.color });
  }
  return out.length > 0 ? out : undefined;
}

function coerceRepairs(raw: unknown[]): PropertyExportManifest["repairs"] {
  const out: PropertyExportManifest["repairs"] = [];
  for (const r of raw) {
    if (!isObject(r)) continue;
    if (typeof r.id !== "string" || typeof r.date !== "string") continue;
    if (typeof r.typeId !== "string") continue;
    const entry: PropertyExportManifest["repairs"][number] = {
      id: r.id,
      date: r.date,
      amount: typeof r.amount === "number" && r.amount >= 0 ? r.amount : 0,
      description: typeof r.description === "string" ? r.description : "",
      typeId: r.typeId,
    };
    if (typeof r.subtypeName === "string") entry.subtypeName = r.subtypeName;
    if (typeof r.companyName === "string") entry.companyName = r.companyName;
    const tags = coerceTags(r.tags);
    if (tags) entry.tags = tags;
    if (typeof r.receiptZipPath === "string")
      entry.receiptZipPath = r.receiptZipPath;
    out.push(entry);
  }
  return out;
}

function coerceFiles(raw: unknown[]): PropertyExportManifest["files"] {
  const out: PropertyExportManifest["files"] = [];
  for (const f of raw) {
    if (!isObject(f)) continue;
    if (typeof f.id !== "string" || typeof f.zipPath !== "string") continue;
    if (typeof f.filename !== "string") continue;
    const entry: PropertyExportManifest["files"][number] = {
      id: f.id,
      zipPath: f.zipPath,
      filename: f.filename,
    };
    if (typeof f.description === "string") entry.description = f.description;
    if (typeof f.categoryName === "string") entry.categoryName = f.categoryName;
    const tags = coerceTags(f.tags);
    if (tags) entry.tags = tags;
    if (f.private === true) entry.private = true;
    out.push(entry);
  }
  return out;
}

function coerceFinancials(
  raw: Record<string, unknown>,
): PropertyExportManifest["financials"] {
  const financials: NonNullable<PropertyExportManifest["financials"]> = {};
  if (typeof raw.purchaseAmount === "number")
    financials.purchaseAmount = raw.purchaseAmount;
  if (typeof raw.purchaseDate === "string")
    financials.purchaseDate = raw.purchaseDate;
  if (Array.isArray(raw.valueHistory)) {
    const points: PropertyValuePoint[] = [];
    for (const p of raw.valueHistory) {
      if (
        isObject(p) &&
        typeof p.id === "string" &&
        typeof p.date === "string" &&
        typeof p.value === "number"
      )
        points.push({ id: p.id, date: p.date, value: p.value });
    }
    if (points.length > 0) financials.valueHistory = points;
  }
  if (Array.isArray(raw.mortgages)) {
    const mortgages: Mortgage[] = [];
    for (const m of raw.mortgages) {
      const mortgage = coerceMortgage(m);
      if (mortgage) mortgages.push(mortgage);
    }
    if (mortgages.length > 0) financials.mortgages = mortgages;
  }
  if (typeof raw.lenderName === "string")
    financials.lenderName = raw.lenderName;
  return financials;
}

function coerceMortgage(raw: unknown): Mortgage | null {
  if (!isObject(raw)) return null;
  if (typeof raw.name !== "string") return null;
  const payments: MortgagePayment[] = [];
  if (Array.isArray(raw.payments)) {
    for (const p of raw.payments) {
      if (
        isObject(p) &&
        typeof p.id === "string" &&
        typeof p.date === "string" &&
        typeof p.amount === "number"
      )
        payments.push({ id: p.id, date: p.date, amount: p.amount });
    }
  }
  const mortgage: Mortgage = {
    id: typeof raw.id === "string" ? raw.id : newId(),
    name: raw.name,
    payments,
  };
  if (typeof raw.loanAmount === "number") mortgage.loanAmount = raw.loanAmount;
  if (typeof raw.currentBalance === "number")
    mortgage.currentBalance = raw.currentBalance;
  if (typeof raw.interestRate === "number")
    mortgage.interestRate = raw.interestRate;
  if (typeof raw.rateChangeMonths === "number")
    mortgage.rateChangeMonths = raw.rateChangeMonths;
  if (typeof raw.nextRateChangeDate === "string")
    mortgage.nextRateChangeDate = raw.nextRateChangeDate;
  if (isObject(raw.amortization)) {
    const a = raw.amortization;
    if (a.mode === "percent" && typeof a.percent === "number")
      mortgage.amortization = { mode: "percent", percent: a.percent };
    else if (a.mode === "fixed" && typeof a.amount === "number")
      mortgage.amortization = { mode: "fixed", amount: a.amount };
  }
  return mortgage;
}

// One uploaded file resolved to importer ids, awaiting its bytes (the hook
// reads `zipPath` from the archive and uploads them to a fresh backend path).
export type PlannedFile = {
  id: string;
  zipPath: string;
  filename: string;
  description?: string;
  categoryId?: string;
  tagIds?: string[];
  private?: boolean;
};

// One repair resolved to importer ids. Lands as a manual repair (no source
// transaction); `receiptZipPath` is consumed by the hook to re-upload the
// receipt and set the final `receiptPath`.
export type PlannedRepair = {
  id: string;
  date: string;
  amount: number;
  description: string;
  typeId: string;
  subtypeId?: string;
  companyId?: string;
  tagIds?: string[];
  receiptZipPath?: string;
};

export type PropertyImportPlan = {
  propertyId: string;
  propertyName: string;
  size?: number;
  purchaseAmount?: number;
  purchaseDate?: string;
  valueHistory: PropertyValuePoint[];
  mortgages: Mortgage[];
  lenderCompanyId?: string;
  // Entities that don't yet exist in the importer's workspace and must be
  // created alongside the property (one atomic `importProperty` action).
  newCompanies: Company[];
  newTags: Tag[];
  newFileCategories: FileCategory[];
  newSubtypes: Subtype[];
  files: PlannedFile[];
  repairs: PlannedRepair[];
};

// Resolve a name against an existing set (case-insensitive), minting a new
// entity through `create` when absent. New entities are accumulated into
// `created` so the caller can append them in one action.
function resolver<T extends { id: string; name: string }>(
  existing: readonly T[],
  created: T[],
  create: (name: string) => T,
) {
  const byName = new Map<string, T>();
  for (const e of existing) byName.set(e.name.toLowerCase(), e);
  return (name: string): string => {
    const key = name.toLowerCase();
    const hit = byName.get(key);
    if (hit) return hit.id;
    const made = create(name);
    byName.set(key, made);
    created.push(made);
    return made.id;
  };
}

// Build the import plan: a fresh property (new ids throughout) plus the
// companies / tags / file categories / subtypes that must be created to
// re-link its denormalized names. Pure apart from `newId()`.
export function planPropertyImport(
  manifest: PropertyExportManifest,
  data: UserData,
): PropertyImportPlan {
  const newCompanies: Company[] = [];
  const newTags: Tag[] = [];
  const newFileCategories: FileCategory[] = [];
  const newSubtypes: Subtype[] = [];

  const resolveCompany = resolver(data.companies, newCompanies, (name) => ({
    id: newId(),
    name,
  }));
  const resolveCategory = resolver(
    data.fileCategories,
    newFileCategories,
    (name) => ({ id: newId(), name }),
  );

  // Tags carry a colour, so they can't use the name-only resolver — match an
  // existing tag by name, else mint one with the archived colour.
  const tagByName = new Map<string, Tag>();
  for (const tag of data.tags) tagByName.set(tag.name.toLowerCase(), tag);
  function resolveTag(t: ManifestTag): string {
    const key = t.name.toLowerCase();
    const hit = tagByName.get(key);
    if (hit) return hit.id;
    const made: Tag = { id: newId(), name: t.name, color: t.color };
    tagByName.set(key, made);
    newTags.push(made);
    return made.id;
  }
  function resolveTags(tags: ManifestTag[] | undefined): string[] | undefined {
    if (!tags || tags.length === 0) return undefined;
    const ids = tags.map(resolveTag);
    return ids.length > 0 ? ids : undefined;
  }

  // Subtypes are scoped to a parent type, so a match must agree on both the
  // name and the `typeId` (the repair's preset type). Keyed `typeId|name`.
  const subtypeByKey = new Map<string, Subtype>();
  for (const s of data.subtypes)
    subtypeByKey.set(`${s.typeId}|${s.name.toLowerCase()}`, s);
  function resolveSubtype(name: string, typeId: string): string {
    const key = `${typeId}|${name.toLowerCase()}`;
    const hit = subtypeByKey.get(key);
    if (hit) return hit.id;
    const made: Subtype = { id: newId(), name, typeId };
    subtypeByKey.set(key, made);
    newSubtypes.push(made);
    return made.id;
  }

  const files: PlannedFile[] = manifest.files.map((f) => {
    const planned: PlannedFile = {
      id: newId(),
      zipPath: f.zipPath,
      filename: f.filename,
    };
    if (f.description) planned.description = f.description;
    if (f.categoryName) planned.categoryId = resolveCategory(f.categoryName);
    const tagIds = resolveTags(f.tags);
    if (tagIds) planned.tagIds = tagIds;
    if (f.private) planned.private = true;
    return planned;
  });

  const repairs: PlannedRepair[] = manifest.repairs.map((r) => {
    const planned: PlannedRepair = {
      id: newId(),
      date: r.date,
      amount: r.amount,
      description: r.description,
      typeId: r.typeId,
    };
    if (r.subtypeName)
      planned.subtypeId = resolveSubtype(r.subtypeName, r.typeId);
    if (r.companyName) planned.companyId = resolveCompany(r.companyName);
    const tagIds = resolveTags(r.tags);
    if (tagIds) planned.tagIds = tagIds;
    if (r.receiptZipPath) planned.receiptZipPath = r.receiptZipPath;
    return planned;
  });

  const fin = manifest.financials;
  const plan: PropertyImportPlan = {
    propertyId: newId(),
    propertyName: manifest.property.name,
    valueHistory: fin?.valueHistory ?? [],
    // Regenerate mortgage + payment ids so an archive produced from the same
    // seed never collides with the importer's own records.
    mortgages: (fin?.mortgages ?? []).map((m) => ({
      ...m,
      id: newId(),
      payments: m.payments.map((p) => ({ ...p, id: newId() })),
    })),
    newCompanies,
    newTags,
    newFileCategories,
    newSubtypes,
    files,
    repairs,
  };
  if (manifest.property.size !== undefined) plan.size = manifest.property.size;
  if (fin?.purchaseAmount !== undefined)
    plan.purchaseAmount = fin.purchaseAmount;
  if (fin?.purchaseDate !== undefined) plan.purchaseDate = fin.purchaseDate;
  if (fin?.lenderName) plan.lenderCompanyId = resolveCompany(fin.lenderName);
  return plan;
}
