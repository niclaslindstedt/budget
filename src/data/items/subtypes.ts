import {
  PRESET_TYPE_RENOVATIONS_ID,
  PRESET_TYPE_REPAIRS_ID,
} from "../presets/types";
import type { Subtype } from "../types";

// The Repairs / Renovations preset types own subtypes too, but those are
// created exclusively by the property repairs editor to classify a
// property's repairs — they are not item taxonomy. Every item-facing
// subtype picker (the item editor, the line-items modal, the item picker)
// filters them out so the Items sheet only offers item subtypes; the
// taxonomy admin lists them under their own heading instead.
export const PROPERTY_REPAIR_TYPE_IDS: ReadonlySet<string> = new Set([
  PRESET_TYPE_REPAIRS_ID,
  PRESET_TYPE_RENOVATIONS_ID,
]);

// Subtypes that belong on an item — everything except the ones parented to
// the Repairs / Renovations property types.
export function itemSubtypes(subtypes: readonly Subtype[]): readonly Subtype[] {
  return subtypes.filter((s) => !PROPERTY_REPAIR_TYPE_IDS.has(s.typeId));
}
