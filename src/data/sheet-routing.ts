import type { Sheet, SheetType } from "./types";
import { SHEET_TYPES } from "./types";

// Sheet ⇄ URL-slug mapping. The URL is a live reflection of the active
// sheet: the address bar reads `/<type>` for the first sheet of a given
// type and `/<type>-<n>` (n ≥ 2) for the nth sheet of that same type in
// sheet order — so `/budget`, `/budget-2`, `/salary`, … each address a
// concrete sheet, while a bare type slug shared with someone opens the
// FIRST sheet of that type (or, when none exists yet, the new-sheet
// modal pre-selected to that type). These are pure string ↔ sheet
// helpers; the browser-history wiring lives in
// `components/AppShell/hooks/useSheetUrlSync.ts`.

const SHEET_TYPE_SET: ReadonlySet<string> = new Set(SHEET_TYPES);

// The canonical slug for a sheet: its type when it is the first sheet of
// that type, else `<type>-<n>` where n is its 1-based ordinal among
// sheets of the same type. Returns null when the id isn't in `sheets`.
export function sheetSlug(
  sheets: readonly Sheet[],
  sheetId: string | null,
): string | null {
  const idx = sheets.findIndex((s) => s.id === sheetId);
  if (idx < 0) return null;
  const type = sheets[idx].type;
  let ordinal = 0;
  for (let i = 0; i < idx; i++) {
    if (sheets[i].type === type) ordinal++;
  }
  return ordinal === 0 ? type : `${type}-${ordinal + 1}`;
}

// Parse a URL slug into a sheet type + zero-based ordinal, or null when
// the slug isn't a valid sheet address. `budget` → ordinal 0,
// `budget-2` → ordinal 1. A `-0`, `-1`, non-numeric, or unknown-type
// slug is rejected so only canonical slugs round-trip.
export function parseSheetSlug(
  slug: string,
): { type: SheetType; ordinal: number } | null {
  const match = /^([a-z]+)(?:-(\d+))?$/.exec(slug);
  if (!match) return null;
  const type = match[1];
  if (!SHEET_TYPE_SET.has(type)) return null;
  if (match[2] === undefined) return { type: type as SheetType, ordinal: 0 };
  // The bare type already spells ordinal 0, so only `-2` and up are
  // canonical suffixes; `-0` / `-1` are non-canonical duplicates.
  const n = Number(match[2]);
  if (!Number.isInteger(n) || n < 2) return null;
  return { type: type as SheetType, ordinal: n - 1 };
}

// Resolve a URL slug against the current sheets. Returns the parsed
// type + ordinal plus the concrete `sheet` it addresses, or `sheet:
// null` when the type is valid but no sheet sits at that ordinal yet
// (the "open the create modal" case). Returns null when the slug isn't
// a valid sheet address at all.
export function resolveSheetSlug(
  sheets: readonly Sheet[],
  slug: string,
): { type: SheetType; ordinal: number; sheet: Sheet | null } | null {
  const parsed = parseSheetSlug(slug);
  if (!parsed) return null;
  const ofType = sheets.filter((s) => s.type === parsed.type);
  return { ...parsed, sheet: ofType[parsed.ordinal] ?? null };
}
