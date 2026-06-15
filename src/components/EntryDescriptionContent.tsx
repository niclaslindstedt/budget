import { Ban, Building2, Repeat } from "lucide-react";

import type { Company, EntryType } from "../data/types";
import { useT } from "../i18n";
import { displayTypeName } from "../i18n/preset-names";
import { CompanyPill, LineItemPill } from "./Pills";

// The resolved set of booleans that decide which face a row's
// description renders as. Computed once by `resolveEntryDescriptionDisplay`
// and shared between the budget table's editable `DescriptionCell` (which
// also reads them to build the trigger's aria-label / title) and any
// read-only surface that wants the row to read the way the ledger shows
// it (the post-import reconciliation modal).
export type EntryDescriptionDisplay = {
  // True when the visible value is a calculated fallback (company / type /
  // bank text) rather than a user-authored description.
  fallback: boolean;
  hasValue: boolean;
  // True when the cell renders anything other than the empty "…" / omitted
  // affordance — drives layout (justify-start vs centered) on the budget
  // trigger.
  hasContent: boolean;
  showLineItemPill: boolean;
  showCompanyPill: boolean;
  showTypeName: boolean;
  // The low-key Building2 prefix shown when BOTH a description and a
  // company are set (line items excepted, since a line-item pill takes
  // over the cell).
  showCompanyGlyph: boolean;
  showOmittedGlyph: boolean;
};

// Resolve the description display flags from a row's parts. The boolean
// chain mirrors the budget table exactly: line items win the cell, then
// (in fallback mode) a company pill, then a type-coloured name; a
// user-authored description renders as plain text with an optional
// company / omitted glyph prefix.
export function resolveEntryDescriptionDisplay(input: {
  // The text currently shown — the live draft while the budget popover is
  // open, otherwise the row's description.
  value: string;
  // True only for synthesized history rows whose `value` is a fallback
  // (bank text) rather than a typed description. Plain budget rows pass
  // false.
  isFallback: boolean;
  entryType: EntryType | null;
  company: Company | null;
  hasLineItems: boolean;
  noCompany: boolean;
}): EntryDescriptionDisplay {
  const hasValue = input.value.length > 0;
  const fallback = input.isFallback || !hasValue;
  const showLineItemPill = input.hasLineItems;
  const showCompanyPill = fallback && !showLineItemPill && !!input.company;
  const showTypeName =
    fallback && !showLineItemPill && !input.company && !!input.entryType;
  const showCompanyGlyph =
    !fallback && hasValue && !!input.company && !showLineItemPill;
  const showOmittedGlyph = !!input.noCompany && !input.company;
  const hasContent =
    showLineItemPill || showCompanyPill || showTypeName || hasValue;
  return {
    fallback,
    hasValue,
    hasContent,
    showLineItemPill,
    showCompanyPill,
    showTypeName,
    showCompanyGlyph,
    showOmittedGlyph,
  };
}

// The first line item resolved to the bits the pill needs (name +
// whether the row links more than one). Built by the caller from the
// row's `lineItems` against the owned-items catalog.
export type EntryDescriptionLineItem = { name: string; many: boolean };

// The inner content of a row's description — the same pills, glyphs, and
// text the budget table's `DescriptionCell` renders, with no wrapping
// element so the caller controls the container (a `<button>` in the
// budget cell, a plain `<span>` in the reconciliation modal). Pass the
// `display` flags from `resolveEntryDescriptionDisplay` so both surfaces
// resolve identically.
export function EntryDescriptionContent({
  value,
  isRecurring,
  entryType,
  company,
  display,
  lineItem,
}: {
  value: string;
  isRecurring: boolean;
  entryType: EntryType | null;
  company: Company | null;
  display: EntryDescriptionDisplay;
  lineItem?: EntryDescriptionLineItem;
}) {
  const t = useT();
  const typeLabel = entryType ? displayTypeName(entryType, t) : "";
  const {
    showLineItemPill,
    showCompanyPill,
    showTypeName,
    showCompanyGlyph,
    showOmittedGlyph,
    hasValue,
  } = display;
  return (
    <>
      {isRecurring && !showCompanyPill && (
        <Repeat
          size={16}
          aria-hidden
          focusable={false}
          className="shrink-0 text-flag"
        />
      )}
      {showLineItemPill && lineItem ? (
        <LineItemPill name={lineItem.name} many={lineItem.many} />
      ) : showCompanyPill ? (
        <CompanyPill name={company!.name} recurring={isRecurring} />
      ) : showTypeName ? (
        <span className="inline-flex min-w-0 items-center gap-1">
          {showOmittedGlyph && <OmittedGlyph />}
          <span
            className="min-w-0 truncate"
            style={{ color: entryType!.color }}
          >
            {typeLabel}
          </span>
        </span>
      ) : hasValue ? (
        <span className="inline-flex min-w-0 items-center gap-1">
          {showCompanyGlyph && (
            <Building2
              size={12}
              aria-hidden
              focusable={false}
              className="shrink-0"
            />
          )}
          {showOmittedGlyph && <OmittedGlyph />}
          <span className="min-w-0 truncate">{value}</span>
        </span>
      ) : showOmittedGlyph ? (
        <OmittedGlyph />
      ) : !isRecurring ? (
        <span>…</span>
      ) : null}
    </>
  );
}

// Composite "company banned" glyph: a Building2 with a Ban circle
// overlaid on top, so the omitted state reads as "company, but
// excluded" rather than a generic prohibition mark. Mirrors the role
// of the Building2 prefix used when a company IS tagged — the two
// states are mutually exclusive (CompanyPicker clears one when the
// other is set), so this never co-exists with the bare Building2.
//
// Rendered in `text-muted` with thinned strokes so the mark stays
// quieter than the description text it precedes — the omitted state
// is meta-information, not the primary content of the cell.
export function OmittedGlyph() {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center text-muted"
      style={{ width: 12, height: 12 }}
      aria-hidden
    >
      <Building2 size={8} focusable={false} strokeWidth={1.5} />
      <Ban
        size={12}
        focusable={false}
        className="absolute inset-0"
        strokeWidth={1.25}
      />
    </span>
  );
}
