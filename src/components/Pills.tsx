import { Boxes, Building2, Package, Repeat } from "lucide-react";

import type { EntryType } from "../data/types";
import { useT } from "../i18n";
import { displayTypeName } from "../i18n/preset-names";
import { tintBorder, tintFill } from "../utils/tint";
import { CategoryIconGlyph } from "./icons";

// Universal row-annotation pills shared by every sheet that renders
// budget-shaped rows (the budget table, the budget viewer modal, the
// scenarios table). Each pill is a pure display primitive — no row
// plumbing, no editing — so pages can compose them into their own
// cells without importing a sibling page's directory.

// Outlined pill with the company glyph + name, shown inside a
// description cell when the row has a `companyId` but no user-authored
// description. Uses theme tokens so the pill stays high-contrast in
// both dark (white-on-dark) and light (dark-on-light) themes. When the
// row is recurring the leading glyph becomes the orange recurring
// symbol instead of the company glyph — it stands in for the external
// Repeat icon (suppressed at the call site) so the pill saves the
// horizontal space the separate icon would have cost.
export function CompanyPill({
  name,
  recurring,
}: {
  name: string;
  recurring: boolean;
}) {
  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border bg-transparent px-2 py-0.5 font-medium"
      style={{
        borderColor: "var(--fg-bright)",
        color: "var(--fg-bright)",
      }}
    >
      {recurring ? (
        <Repeat
          size={12}
          aria-hidden
          focusable={false}
          className="shrink-0 text-flag"
        />
      ) : (
        <Building2
          size={12}
          aria-hidden
          focusable={false}
          className="shrink-0"
        />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

// Outlined pill with the item glyph + the first line's item name,
// shown inside a description cell whenever the row has line items
// (the user description, if any, stays editable in the popover).
// Mirrors `CompanyPill`'s outlined shape but reads in the blue `--link`
// token so item pills are visually distinct from the bright company
// pill at a glance. The leading glyph encodes the count: a `Package`
// for a single line item, `Boxes` for many (the name shown is the
// first added line item).
export function LineItemPill({ name, many }: { name: string; many: boolean }) {
  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border bg-transparent px-2 py-0.5 font-medium"
      style={{
        borderColor: "var(--link)",
        color: "var(--link)",
      }}
    >
      {many ? (
        <Boxes size={12} aria-hidden focusable={false} className="shrink-0" />
      ) : (
        <Package size={12} aria-hidden focusable={false} className="shrink-0" />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

// Read-only type badge: the type's glyph alone on mobile, a tinted
// glyph + name pill on desktop — the same responsive split the budget
// table's type column uses. Renders a muted em dash when the row has
// no type so the column keeps its track without looking broken.
export function TypeBadge({ entryType }: { entryType: EntryType | null }) {
  const t = useT();
  if (!entryType) return <span className="text-muted">—</span>;
  return (
    <>
      <span
        className="inline-flex items-center justify-center md:hidden"
        style={{ color: entryType.color }}
        aria-hidden
      >
        <CategoryIconGlyph name={entryType.glyph} size={18} />
      </span>
      <span
        className="hidden min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium md:inline-flex"
        style={{
          backgroundColor: tintFill(entryType.color),
          borderColor: tintBorder(entryType.color),
          color: entryType.color,
        }}
      >
        <CategoryIconGlyph name={entryType.glyph} size={12} />
        <span className="truncate">{displayTypeName(entryType, t)}</span>
      </span>
    </>
  );
}
