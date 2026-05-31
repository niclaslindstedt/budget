import {
  DEFAULT_SHEET_COLOR,
  DEFAULT_SHEET_GLYPH,
} from "../constants/taxonomy";
import { SHEET_TYPE_IDS, descriptorForItemType } from "../sheet-types";
import type { Sheet, SheetItem } from "../types";
import type { SheetItemValidationContext } from "./sheet-items";
import {
  CATEGORY_ICONS,
  fail,
  isObject,
  type Result,
  validateEnum,
} from "./helpers";

// Validate one raw `SheetItem` by dispatching to the descriptor that
// owns its `type` discriminant. The per-flavour leaf validators live in
// `./sheet-items` (cycle-free so the registry descriptors can import
// them); this resolves which one to call via the registry rather than a
// hard-coded if-chain, so a new sheet type's validator arrives with its
// descriptor.
export function validateSheetItem(
  raw: unknown,
  path: string,
  ctx: SheetItemValidationContext,
): Result<SheetItem> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const type = (raw as { type?: unknown }).type;
  const descriptor =
    typeof type === "string" ? descriptorForItemType(type) : undefined;
  if (!descriptor)
    return fail(`${path}.type`, `unknown sheet item type "${String(type)}"`);
  return descriptor.validate(raw, path, ctx);
}

export function validateSheet(
  raw: unknown,
  path: string,
  knownAccountIds: ReadonlySet<string>,
  knownTypeIds: ReadonlySet<string>,
  knownCompanyIds: ReadonlySet<string>,
  knownTagIds: ReadonlySet<string>,
  knownItemIds: ReadonlySet<string>,
): Result<Sheet> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, items } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  if (!Array.isArray(items)) return fail(`${path}.items`, "expected an array");

  const ctx: SheetItemValidationContext = {
    knownAccountIds,
    knownTypeIds,
    knownCompanyIds,
    knownTagIds,
    knownItemIds,
  };

  const validatedItems: SheetItem[] = [];
  const seenItemIds = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const r = validateSheetItem(items[i], `${path}.items[${i}]`, ctx);
    if (!r.ok) return r;
    if (seenItemIds.has(r.value.id))
      return fail(`${path}.items[${i}].id`, `duplicate id "${r.value.id}"`);
    seenItemIds.add(r.value.id);
    validatedItems.push(r.value);
  }

  // Display metadata. Soft-recovers each field to a sane default if
  // missing or bogus — these are cosmetic, so a typo'd glyph name
  // shouldn't lock the user out of an otherwise-valid sheet.
  const type = validateEnum(raw.type, SHEET_TYPE_IDS, "budget");
  const glyph = validateEnum(raw.glyph, CATEGORY_ICONS, DEFAULT_SHEET_GLYPH);
  const color =
    typeof raw.color === "string" && raw.color.length > 0
      ? raw.color
      : DEFAULT_SHEET_COLOR;
  const description =
    typeof raw.description === "string" ? raw.description : "";

  return {
    ok: true,
    value: {
      id,
      name,
      type,
      glyph,
      color,
      description,
      items: validatedItems,
    },
  };
}
