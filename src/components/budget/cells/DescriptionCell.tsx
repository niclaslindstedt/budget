import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Ban,
  Boxes,
  Building2,
  Landmark,
  Package,
  Repeat,
} from "lucide-react";

import type { CellValue, Company, EntryType } from "../../../data/types";
import type { FloatingPlacement } from "../../../hooks";
import { ClearableTextarea } from "../../form";
import { useT } from "../../../i18n";
import { displayTypeName } from "../../../i18n/preset-names";
import { CompanyPicker } from "../../CompanyPicker";
import { FloatingPanel } from "../../FloatingPanel";
import { useModalDispatch } from "../../modal-dispatch";
import { CELL_BASE } from "./constants";

// One owned-item line on a row, resolved + pre-formatted by `BudgetRow`
// (item name looked up against the catalog, amount run through the
// user's currency / number format). The description cell renders the
// first one as a pill (single → Package glyph, many → Boxes glyph) and
// lists the full set at the bottom of the description popover.
export type CellLineItem = {
  id: string;
  // The owned `Item` this line links to. Used to open the edit-item modal
  // from the popover (and the single-item pill long-press).
  itemId: string;
  name: string;
  // Pre-formatted signed amount (e.g. "−1 200 kr"), ready to render.
  amount: string;
};

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_PX = 8;

// Both mobile and desktop drive the description cell through the same
// `DescriptionPopover` trigger: it owns the type-name / company-pill /
// bank-text fallback rendering, surfaces the inline `CompanyPicker`
// for tagging the row's merchant, and shows the read-only bank-memo
// line beneath the textarea so the user can edit the description,
// re-tag the company, and keep sight of the original statement memo
// from one place. The trigger sits inside `<td>` so a reducer-driven
// type flip mid-edit (pattern auto-categorisation assigning `typeId`
// after a matching description lands) reconciles without unmounting
// the popover — otherwise the keystroke that completed the match
// (often a trailing space) is lost along with focus.
export function DescriptionCell({
  rowId,
  value,
  isRecurring,
  entryType,
  company,
  companies,
  placeholder,
  bankDescription,
  lineItems,
  onChange,
  onCommit,
  onSetCompany,
  noCompany,
  onSetNoCompany,
  onCreateCompany,
}: {
  rowId: string;
  value: string;
  isRecurring: boolean;
  entryType: EntryType | null;
  // Resolved Company for `row.companyId`. When the cell is in fallback
  // mode (no user-authored description) and a company is set, the
  // trigger renders an outlined pill with the company glyph + name
  // instead of the type-name / bank-text fallback. When BOTH a
  // user-authored description AND a company are set, the trigger
  // renders a small `Building2` glyph before the description as a
  // low-key indicator that the row is tagged to a merchant.
  company: Company | null;
  // Full company list — surfaced by the description popover's inline
  // `CompanyPicker` so the user can tag (or change) the row's company
  // straight from the description reveal. Optional: when omitted (or
  // `onSetCompany` is missing) the popover renders the textarea alone.
  companies?: readonly Company[];
  // When set, `value` is a fallback (company / type / bank text) rather
  // than a user-authored description. The trigger renders the
  // appropriate fallback (company pill, type-coloured name, or "…")
  // and the popover's textarea opens empty with this string as the
  // input placeholder. Supplied by `synthesizeHistoryRow` via
  // `Row.descriptionPlaceholder`.
  placeholder?: string;
  // Raw bank memo for history rows whose visible description is a
  // user override. The popover surfaces this read-only beneath the
  // textarea so the user keeps a reference to what the statement
  // reported even after relabelling. Supplied by `synthesizeHistoryRow`
  // via `Row.bankDescription`; absent when the bank text is already
  // serving as the cell's display value or on every non-history row.
  bankDescription?: string;
  // The row's resolved line items (`Row.lineItems` → item names +
  // formatted amounts). When non-empty the trigger renders a pill /
  // glyph keyed by the count and the popover lists every line at the
  // bottom. Undefined / empty on rows with no line items.
  lineItems?: readonly CellLineItem[];
  onChange: (value: CellValue) => void;
  onCommit?: (value: CellValue) => void;
  // Pre-bound (no rowId) writer for the row's company. Wired by the
  // parent to dispatch `bulkUpdate` for budget rows and
  // `updateHistoryEntry` (also clearing `noCompany`) for synthesized
  // history rows. Optional — when omitted the popover's CompanyPicker
  // is hidden.
  onSetCompany?: (companyId: string | null) => void;
  // Current omit-company flag. Only meaningful when `onSetNoCompany` is
  // also wired; together they surface the "Omit company" option on the
  // popover's inline picker. Both are undefined for non-history rows.
  noCompany?: boolean;
  onSetNoCompany?: (next: boolean) => void;
  onCreateCompany?: (draft: Omit<Company, "id">) => Company;
}) {
  const t = useT();
  const dispatchModal = useModalDispatch();
  const typeLabel = entryType ? displayTypeName(entryType, t) : "";
  const isFallback = placeholder !== undefined;
  const pickerEnabled = !!companies && !!onSetCompany && !!onCreateCompany;
  const hasLineItems = !!lineItems && lineItems.length > 0;
  const manyLineItems = hasLineItems && lineItems!.length > 1;
  const firstLineItemName = hasLineItems ? lineItems![0].name : "";

  // Long-press / right-click on a pill opens the relevant editor without
  // leaving the ledger: the company pill opens the company editor
  // (`open-edit-company`), the line-item pill opens the edit-item modal
  // (`open-edit-item`) for the linked item. A plain tap still opens the
  // description popover.
  //
  // The line-item shortcut only fires when the row links exactly ONE
  // item — there's a single unambiguous item to edit. A multi-item row's
  // long-press falls through to a plain popover open, where every line
  // item is listed and individually clickable so the user picks which
  // one to edit. The links modal (re-allocating amounts) stays on the
  // row "…" actions menu (`open-line-items`).
  //
  // The company pill only renders (and so only earns a long-press) when
  // the row has no line items — line items always win the cell — so its
  // eligibility mirrors `!hasLineItems`.
  const singleLineItem = hasLineItems && lineItems!.length === 1;
  const companyPillShown =
    !hasLineItems && !!company && (isFallback || value.length === 0);
  const longPressKind: "company" | "lineItems" | null = singleLineItem
    ? "lineItems"
    : companyPillShown
      ? "company"
      : null;
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);
  const longPressStartX = useRef(0);
  const longPressStartY = useRef(0);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const fireLongPress = useCallback(() => {
    if (longPressKind === "lineItems" && hasLineItems) {
      dispatchModal({ kind: "open-edit-item", itemId: lineItems![0].itemId });
    } else if (longPressKind === "company" && company) {
      dispatchModal({ kind: "open-edit-company", companyId: company.id });
    }
  }, [longPressKind, company, hasLineItems, lineItems, dispatchModal]);

  const onPillPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (longPressKind === null || e.button !== 0) return;
      longPressTriggered.current = false;
      longPressStartX.current = e.clientX;
      longPressStartY.current = e.clientY;
      clearLongPress();
      longPressTimer.current = window.setTimeout(() => {
        longPressTriggered.current = true;
        longPressTimer.current = null;
        fireLongPress();
      }, LONG_PRESS_MS);
    },
    [longPressKind, clearLongPress, fireLongPress],
  );

  const onPillPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (longPressTimer.current === null) return;
      const dx = e.clientX - longPressStartX.current;
      const dy = e.clientY - longPressStartY.current;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_PX) clearLongPress();
    },
    [clearLongPress],
  );

  const onPillContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (longPressKind === null) return;
      e.preventDefault();
      clearLongPress();
      longPressTriggered.current = true;
      fireLongPress();
    },
    [longPressKind, clearLongPress, fireLongPress],
  );

  return (
    <td
      className={`${CELL_BASE} align-middle hover:bg-surface-2 md:w-full ${
        isRecurring ? "text-flag" : "text-fg"
      }`}
    >
      <DescriptionPopover
        rowId={rowId}
        value={value}
        editValue={isFallback ? "" : value}
        placeholder={placeholder}
        bankDescription={bankDescription}
        lineItems={lineItems}
        company={company}
        companies={pickerEnabled ? companies : undefined}
        onChange={onChange}
        onCommit={onCommit}
        onSetCompany={pickerEnabled ? onSetCompany : undefined}
        noCompany={pickerEnabled ? noCompany : undefined}
        onSetNoCompany={pickerEnabled ? onSetNoCompany : undefined}
        onCreateCompany={pickerEnabled ? onCreateCompany : undefined}
        renderTrigger={({ ref, onClick, open, displayValue }) => {
          const hasValue = displayValue.length > 0;
          // The fallback rendering applies whenever the cell is showing
          // a calculated value, even when the popover is closed and
          // `displayValue` is non-empty. Without `isFallback`, the
          // trigger reverts to plain description styling as soon as the
          // popover closes — which is misleading because the row still
          // has no user-authored description.
          const fallback = isFallback || !hasValue;
          // Line items are the most specific annotation, so an item pill
          // wins the cell whenever the row has line items — even when a
          // user description is set (the description stays editable in
          // the popover). The pill shows the first line's item name, a
          // Package glyph for one and Boxes for many.
          const showLineItemPill = hasLineItems;
          const showCompanyPill = fallback && !showLineItemPill && !!company;
          const showTypeName =
            fallback && !showLineItemPill && !company && !!entryType;
          // When BOTH a description and a company are set (and no line
          // items, which would take over the cell as a pill), prefix the
          // description text with a low-key Building2 glyph so the
          // tagged-merchant state is visible at a glance.
          const showCompanyGlyph =
            !fallback && hasValue && !!company && !showLineItemPill;
          // Mirror the Building2 prefix with a Ban glyph when the row's
          // company is explicitly omitted, so the skipped state is
          // visible without having to tap the row open. `noCompany` and
          // `company` are mutually exclusive (CompanyPicker clears one
          // when the other is set) so this never overlaps the Building2
          // prefix.
          const showOmittedGlyph = !!noCompany && !company;
          const omittedLabel = t("company.omittedLabel");
          // The pill always shows the first line's item name; the "Line
          // items" prefix only earns its place when there is more than
          // one (so the pill reads as a summary rather than a single
          // mislabelled item).
          const lineItemLabel = manyLineItems
            ? `${t("cell.lineItems")}: ${firstLineItemName}`
            : firstLineItemName;
          const hasContent =
            showLineItemPill || showCompanyPill || showTypeName || hasValue;
          const ariaLabel = showLineItemPill
            ? lineItemLabel
            : showCompanyPill
              ? company!.name
              : showTypeName
                ? showOmittedGlyph
                  ? `${typeLabel} (${omittedLabel})`
                  : typeLabel
                : hasValue
                  ? showOmittedGlyph
                    ? entryType
                      ? `${typeLabel}: ${displayValue} (${omittedLabel})`
                      : `${t("cell.descriptionWith", { value: displayValue })} (${omittedLabel})`
                    : entryType
                      ? `${typeLabel}: ${displayValue}`
                      : t("cell.descriptionWith", { value: displayValue })
                  : entryType
                    ? showOmittedGlyph
                      ? `${typeLabel} (${omittedLabel})`
                      : typeLabel
                    : showOmittedGlyph
                      ? omittedLabel
                      : t("cell.addDescription");
          const title = showLineItemPill
            ? lineItemLabel
            : showCompanyPill
              ? company!.name
              : showTypeName
                ? showOmittedGlyph
                  ? `${typeLabel} — ${omittedLabel}`
                  : typeLabel
                : hasValue
                  ? company
                    ? `${company.name}: ${displayValue}`
                    : showOmittedGlyph
                      ? `${omittedLabel}: ${displayValue}`
                      : displayValue
                  : showOmittedGlyph
                    ? omittedLabel
                    : undefined;
          return (
            <button
              ref={ref}
              type="button"
              onClick={() => {
                // Pointerup fires before click — swallow the click that
                // follows a long-press so the description popover doesn't
                // also open on top of the company editor.
                if (longPressTriggered.current) {
                  longPressTriggered.current = false;
                  return;
                }
                onClick();
              }}
              onPointerDown={onPillPointerDown}
              onPointerMove={onPillPointerMove}
              onPointerUp={clearLongPress}
              onPointerCancel={clearLongPress}
              onPointerLeave={clearLongPress}
              onContextMenu={onPillContextMenu}
              className={`flex h-full min-h-9 w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-2.5 py-2 font-mono outline-none focus-visible:bg-surface-2 ${
                hasContent
                  ? "justify-start text-left"
                  : "justify-center text-center md:justify-start md:text-left"
              } ${isRecurring ? "text-flag" : hasContent ? "text-fg" : "text-muted"}`}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={ariaLabel}
              title={title}
            >
              {isRecurring && !showCompanyPill && (
                <Repeat
                  size={16}
                  aria-hidden
                  focusable={false}
                  className="shrink-0 text-flag"
                />
              )}
              {showLineItemPill ? (
                <LineItemPill name={firstLineItemName} many={manyLineItems} />
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
                  <span className="min-w-0 truncate">{displayValue}</span>
                </span>
              ) : showOmittedGlyph ? (
                <OmittedGlyph />
              ) : !isRecurring ? (
                <span>…</span>
              ) : null}
            </button>
          );
        }}
      />
    </td>
  );
}

// Document-coord position so the popover scrolls with the trigger row
// when iOS shifts the page up to fit the on-screen keyboard. `position:
// fixed` stays anchored to the layout viewport — which iOS moves out
// from under the popover when the keyboard appears, leaving the field
// off screen.
const DESCRIPTION_POPOVER_PLACEMENT: FloatingPlacement = {
  width: { kind: "max", maxPx: 280 },
  anchor: "left",
  coordinateSpace: "document",
};

// Description popover shared by every viewport. The cells differ
// only in the trigger button (recurring icon / "…" vs the type's
// name in the type's colour vs the company pill), so callers pass
// the trigger via `renderTrigger` and the popover owns the open
// state, the commit-on-close hook, the textarea editor, the
// CompanyPicker, and the read-only bank-memo line.
function DescriptionPopover({
  rowId,
  value,
  editValue,
  placeholder,
  bankDescription,
  lineItems,
  company,
  companies,
  onChange,
  onCommit,
  onSetCompany,
  noCompany,
  onSetNoCompany,
  onCreateCompany,
  renderTrigger,
}: {
  rowId: string;
  value: string;
  // The value the editor should start from on open. Defaults to `value`
  // for regular rows, but synthesized history rows whose description is
  // a fallback (no userDescription set) pass `""` here so the textarea
  // opens empty rather than pre-filled with the fallback text the user
  // never authored.
  editValue: string;
  // Optional override for the textarea's placeholder. Synthesized
  // history rows pass the raw bank text so the user sees the statement
  // memo they're about to override; absent, the generic
  // `cell.descriptionPlaceholder` ("Description") is used.
  placeholder?: string;
  // Raw bank memo on history rows whose visible description is a
  // user override. Rendered read-only beneath the textarea with a
  // small Landmark glyph so the user can still see what the bank
  // reported. Absent when the bank text is already the placeholder
  // (no override) or on non-history rows.
  bankDescription?: string;
  // The row's resolved line items, listed read-only at the bottom of
  // the popover so the user can see what an entry's amount was spent on
  // without opening the line-items modal. Undefined / empty on rows
  // with no line items.
  lineItems?: readonly CellLineItem[];
  // Resolved Company for `row.companyId` plus the full list and
  // create/select handlers needed to render the inline CompanyPicker
  // above the textarea. All four are gated together: when any is
  // missing the picker is suppressed and the popover just shows the
  // textarea (matches the pre-picker behaviour).
  company: Company | null;
  companies?: readonly Company[];
  onChange: (value: CellValue) => void;
  onCommit?: (value: CellValue) => void;
  onSetCompany?: (companyId: string | null) => void;
  noCompany?: boolean;
  onSetNoCompany?: (next: boolean) => void;
  onCreateCompany?: (draft: Omit<Company, "id">) => Company;
  renderTrigger: (ctx: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    open: boolean;
    displayValue: string;
  }) => React.ReactNode;
}) {
  const t = useT();
  const dispatchModal = useModalDispatch();
  const [open, setOpen] = useState(false);
  // Local draft so the textarea (and the trigger behind it) stay with
  // what the user typed even when the parent's `value` re-resolves to
  // a fallback — e.g. on history rows, emptying `userDescription`
  // would otherwise refill from the bank's raw description via
  // `resolveEntryLabels`, making the original text "come back" while
  // the user is still editing.
  const [draft, setDraft] = useState<string>(editValue);
  // Snapshot the value at popover-open time so we only emit a commit
  // when the user actually changed the description before closing.
  const openValueRef = useRef<string>(editValue);
  const wasOpenRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep the draft synced from `editValue` while the popover is closed
  // so external updates land cleanly on the next open.
  useEffect(() => {
    if (!open) setDraft(editValue);
  }, [open, editValue]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      openValueRef.current = editValue;
      setDraft(editValue);
    } else if (!open && wasOpenRef.current) {
      if (onCommit && draft !== openValueRef.current) onCommit(draft);
    }
    wasOpenRef.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  function handleDraftChange(next: string) {
    setDraft(next);
    onChange(next);
  }

  return (
    <>
      {renderTrigger({
        ref: triggerRef,
        onClick: () => setOpen((v) => !v),
        open,
        displayValue: open ? draft : value,
      })}
      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={DESCRIPTION_POPOVER_PLACEMENT}
        rowId={rowId}
        arrow="up"
      >
        {companies && onSetCompany && onCreateCompany && (
          <div className="border-b border-line p-1.5">
            <CompanyPicker
              rowId={rowId}
              companies={companies}
              selectedId={company?.id ?? null}
              noCompany={noCompany}
              onSelect={onSetCompany}
              onOmitChange={onSetNoCompany}
              onCreate={onCreateCompany}
              variant="field"
            />
          </div>
        )}
        <ClearableTextarea
          ref={textareaRef}
          value={draft}
          onValueChange={handleDraftChange}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              setOpen(false);
            }
          }}
          placeholder={placeholder ?? t("cell.descriptionPlaceholder")}
          rows={1}
          sizeToContent
          wrapperClassName="w-full"
          className="field-input block h-full w-full resize-none rounded border-0 bg-transparent px-2 py-1.5 font-mono leading-snug whitespace-pre-wrap break-words text-fg outline-none"
        />
        {bankDescription && (
          <div
            className="flex items-start gap-1.5 border-t border-line bg-surface-3 px-2 py-1.5 text-xs text-muted"
            title={t("cell.originalFromBank")}
          >
            <Landmark
              size={12}
              aria-hidden
              focusable={false}
              className="mt-0.5 shrink-0"
            />
            <span className="min-w-0 font-mono break-words whitespace-pre-wrap">
              {bankDescription}
            </span>
          </div>
        )}
        {lineItems && lineItems.length > 0 && (
          <div className="border-t border-line bg-surface-3 px-2 py-1.5">
            <ul className="flex flex-col gap-0.5">
              {lineItems.map((li) => (
                <li key={li.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      dispatchModal({
                        kind: "open-edit-item",
                        itemId: li.itemId,
                      });
                    }}
                    aria-label={t("items.editItemAria", { name: li.name })}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Package
                        size={12}
                        aria-hidden
                        focusable={false}
                        className="shrink-0 text-muted"
                      />
                      <span className="min-w-0 truncate text-fg">
                        {li.name}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-muted">
                      {li.amount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </FloatingPanel>
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
function OmittedGlyph() {
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

// Outlined pill with the company glyph + name, shown inside the
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
// shown inside the description cell whenever the row has line items
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

// Description cell for synthesized transfer rows. Shows a transfer
// arrow leading into the peer account name, then the transfer
// description as plain text. Mirrors the editable description cell's
// desktop / mobile split so the row collapses cleanly on small screens.
export function TransferDescriptionCell({
  value,
  peerName,
  outgoing,
}: {
  value: string;
  peerName: string;
  outgoing: boolean;
}) {
  const arrow = outgoing ? (
    // Outgoing transfer: arrow pointing AWAY from us toward the peer.
    <ArrowRight
      size={12}
      aria-hidden
      focusable={false}
      className="shrink-0 text-flag"
    />
  ) : (
    // Incoming transfer: the bidirectional glyph reads better than a
    // left-pointing arrow at a glance because the row's sign already
    // tells the user where the money came from.
    <ArrowLeftRight
      size={12}
      aria-hidden
      focusable={false}
      className="shrink-0 text-flag"
    />
  );
  return (
    <td className={`${CELL_BASE} text-flag align-middle md:w-full`}>
      <div className="hidden md:flex md:items-center md:gap-1.5 md:px-2.5 md:py-2">
        {arrow}
        <span className="text-muted">{peerName || "—"}</span>
        {value && <span className="text-muted">·</span>}
        <span className="truncate text-fg">{value}</span>
      </div>
      <div className="flex h-full min-h-9 w-full items-center justify-center gap-1.5 px-2.5 py-2 font-mono text-flag md:hidden">
        {arrow}
        <span className="truncate text-fg">{value || peerName || "—"}</span>
      </div>
    </td>
  );
}
