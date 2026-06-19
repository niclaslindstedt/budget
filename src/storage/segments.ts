import type { UserData } from "../data/types";
import { stableStringify } from "./file";

// Segmentation core — the single source of truth for how the persisted
// `UserData` blob is split into files grouped by "vector of change", so
// a save can re-write only the segments that actually changed instead
// of the whole budget. Pure data + pure functions: no I/O, no React,
// no adapter knowledge. The storage wrapper that drives these (reads /
// writes the segment files, tracks per-segment revisions) lives
// elsewhere; this module only knows the map and the split / merge / hash
// algebra.
//
// IMPORTANT — segmentation is a transport concern only. The in-memory
// shape stays one `UserData`, and migration / validation always run on
// the fully-merged whole (`mergeSegments`), never on an isolated
// segment. That is what keeps the reducer, migrations, and validators
// untouched: cross-segment id references (a `history` entry pointing at
// a `taxonomy` company) are reassembled before anything inspects them.

// On-disk layout version, independent of `UserData.version`. Bumped when
// the *grouping* changes (e.g. sharding history per-account), which the
// driving wrapper handles by re-reading the old layout and re-writing
// the new one — never a `UserData` migration. Start at 1.
export const SEGMENT_FORMAT = 1;

export type SegmentId = "core" | "taxonomy" | "sheets" | "learned" | "history";

// Stable order so the manifest and any iteration are deterministic.
export const SEGMENT_IDS: readonly SegmentId[] = [
  "core",
  "taxonomy",
  "sheets",
  "learned",
  "history",
];

// The map: which `UserData` fields live in which segment, grouped by how
// often they mutate. `history` is the very-high-churn bulk (every bank
// import); `learned` is the silent learning memory; `sheets` is row
// edits; `taxonomy` is the slow-moving id-definition tables; `core` is
// the slow entity records plus `version`. `satisfies` enforces that
// every listed key is a real `UserData` field; the compile-time
// exhaustiveness assertions below enforce that EVERY field is listed
// exactly once, so a new field added to `UserData` fails the build until
// it is placed in a segment (a missing field would otherwise silently
// drop on every split / merge round-trip).
export const SEGMENT_FIELDS = {
  core: [
    "version",
    "settings",
    "accounts",
    "taxProfiles",
    "salaries",
    "employers",
    "properties",
    "savings",
    "loans",
    "investmentHoldings",
    "investmentStocks",
    "items",
  ],
  taxonomy: [
    "companies",
    "categories",
    "types",
    "subtypes",
    "tags",
    "companyCategories",
    "fileCategories",
    "hiddenPresetTypeIds",
    "hiddenPresetCategoryIds",
    "hiddenPresetCompanyCategoryIds",
    "presetTypeKindOverrides",
  ],
  sheets: ["sheets", "activeSheetId", "transfers"],
  learned: [
    "merchantHints",
    "renamePatterns",
    "seriesMatchRules",
    "seriesMetadata",
    "matchRules",
    "primaryIncomeMerchants",
    "recurringDismissals",
    "transferCollapseDismissals",
    "ignoredItemEntryIds",
    "itemFindExclusionPatterns",
  ],
  history: ["history", "historyImports"],
} satisfies Record<SegmentId, (keyof UserData)[]>;

// Compile-time exhaustiveness: the union of every segment's fields must
// equal `keyof UserData` exactly — no field unassigned, none assigned to
// two segments or naming a field that doesn't exist. Either direction
// failing is a type error at build time.
type MappedKeys = (typeof SEGMENT_FIELDS)[SegmentId][number];
type MissingKeys = Exclude<keyof UserData, MappedKeys>;
type ExtraKeys = Exclude<MappedKeys, keyof UserData>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AllFieldsMapped = MissingKeys extends never
  ? ExtraKeys extends never
    ? true
    : ["segment map names a non-UserData field", ExtraKeys]
  : ["UserData field missing from the segment map", MissingKeys];
// A `true` value only assigns when `_AllFieldsMapped` is `true`.
const _allFieldsMapped: _AllFieldsMapped = true;
void _allFieldsMapped;

// One segment's payload: the subset of `UserData` fields it owns. A
// `Partial<UserData>` whose present keys are exactly that segment's.
export type SegmentParts = Partial<UserData>;

// Split a `UserData` into its segments. The field values are referenced,
// NOT copied — `split(d).history.history === d.history` — so two splits
// of the same object yield reference-equal fields. `dirtySegments` below
// relies on this to detect, in O(fields), which segments a reducer
// action touched (the reducer rebuilds only the slices it changed and
// preserves references to the rest).
export function splitUserData(data: UserData): Record<SegmentId, SegmentParts> {
  const out = {} as Record<SegmentId, SegmentParts>;
  for (const id of SEGMENT_IDS) {
    const part: SegmentParts = {};
    for (const key of SEGMENT_FIELDS[id]) {
      // Index across the heterogeneous field set; the map guarantees the
      // key belongs to this segment, so a single assignment is sound.
      (part as Record<string, unknown>)[key] = data[key];
    }
    out[id] = part;
  }
  return out;
}

// Reassemble segment payloads into one `UserData`. The caller is
// responsible for handing in every segment (a partial load must be
// resolved before merge); a missing segment yields a `UserData` missing
// those fields, which the downstream validator would reject. The merged
// object is plain — downstream migrate / validate run on it unchanged.
export function mergeSegments(
  parts: Record<SegmentId, SegmentParts>,
): UserData {
  const merged = {} as Record<string, unknown>;
  for (const id of SEGMENT_IDS) {
    Object.assign(merged, parts[id]);
  }
  return merged as unknown as UserData;
}

// Which segments differ between two `UserData` states, by per-field
// reference comparison. Cheap (O(fields), no serialization) and exact
// given the reducer's reference-preserving updates: a history import
// flags only `history` (and `learned` if it also learned a rule), never
// `core` / `taxonomy`. Used by the save path to write only changed
// segment files.
export function dirtySegments(prev: UserData, next: UserData): Set<SegmentId> {
  const dirty = new Set<SegmentId>();
  for (const id of SEGMENT_IDS) {
    for (const key of SEGMENT_FIELDS[id]) {
      if (prev[key] !== next[key]) {
        dirty.add(id);
        break;
      }
    }
  }
  return dirty;
}

// Serialize one segment's payload with the same stable, sorted-key,
// pretty-printed encoding `serializeUserData` uses, so a concatenation
// of segment texts is comparable to the whole-blob serialization and a
// segment's bytes are deterministic (stable content hash, clean diffs).
export function serializeSegment(part: SegmentParts): string {
  return stableStringify(part, 2) + "\n";
}

// SHA-256 of a serialized segment, hex-encoded. The manifest stores this
// per segment so the save path can skip writing an unchanged segment and
// a remote-moved manifest can be diffed to find which segments actually
// differ. Async (WebCrypto digest); callers that only need dirty
// detection use `dirtySegments` instead.
export async function hashSegment(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// One segment's entry in the manifest.
export type SegmentDescriptor = {
  // Filename the segment body lives at, relative to the budget file's
  // folder (e.g. `history.json`).
  file: string;
  // Opaque adapter revision token (Dropbox `rev`, Drive ETag, FSA
  // mtime) for this segment's file, used for per-segment optimistic
  // concurrency. Absent until the segment has been written once.
  revision?: string;
  // SHA-256 of the segment's serialized body (`hashSegment`). Lets the
  // driver skip an unchanged write and locate divergent segments on a
  // remote-moved manifest.
  hash: string;
};

// The manifest that ties the segment files together. Written LAST on
// every save (after every dirty body), so a crash mid-write leaves the
// old manifest pointing at a consistent older set rather than a
// half-updated one. `userDataVersion` mirrors `UserData.version` for a
// fast stale-build rejection without reading every segment.
export type SegmentManifest = {
  segmentFormat: number;
  userDataVersion: number;
  segments: Record<SegmentId, SegmentDescriptor>;
};

// Default filename for a segment's body.
export function segmentFile(id: SegmentId): string {
  return `${id}.json`;
}
