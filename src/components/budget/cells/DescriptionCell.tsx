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
  BadgeCheck,
  Check,
  Copy,
  Landmark,
  Package,
} from "lucide-react";

import type { CellValue, Company, EntryType } from "../../../data/types";
import { type FloatingPlacement, useLongPress } from "../../../hooks";
import { ClearableTextarea } from "../../form";
import { useT } from "../../../i18n";
import { displayTypeName } from "../../../i18n/preset-names";
import { CompanyPicker } from "../../CompanyPicker";
import {
  EntryDescriptionContent,
  resolveEntryDescriptionDisplay,
} from "../../EntryDescriptionContent";
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

// The check glyph pinned to the trailing edge of a covered / attributed
// row's description cell. Tapping it opens the cover transfer's info modal.
// `stopPropagation` so the tap doesn't also toggle the row's popover /
// selection.
function CoverGlyphButton({ transferId }: { transferId: string }) {
  const t = useT();
  const dispatchModal = useModalDispatch();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        dispatchModal({ kind: "open-cover-info", transferId });
      }}
      aria-label={t("coverTransfer.coveredGlyphTitle")}
      title={t("coverTransfer.coveredGlyphTitle")}
      className="absolute top-1/2 right-1 z-10 inline-flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-surface-3 text-success hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <BadgeCheck size={13} aria-hidden focusable={false} />
    </button>
  );
}

// Read-only description cell for an "attributed" cover itemization injected
// into the covering account's ledger — plain text plus the cover glyph, no
// editable popover (the row mirrors an expense charged to another account).
export function CoverItemDescriptionCell({
  value,
  coveredTransferId,
}: {
  value: string;
  coveredTransferId?: string | null;
}) {
  return (
    <td className={`${CELL_BASE} relative align-middle text-fg md:w-full`}>
      <span className="block truncate pr-6">{value}</span>
      {coveredTransferId && <CoverGlyphButton transferId={coveredTransferId} />}
    </td>
  );
}

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
  coveredTransferId,
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
  // When set, this imported transaction is accounted for by a cover
  // transfer (its id). The cell renders a trailing check glyph that opens
  // that transfer's info modal. Undefined on every non-covered row.
  coveredTransferId?: string | null;
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
  const fireLongPress = useCallback(() => {
    if (longPressKind === "lineItems" && hasLineItems) {
      dispatchModal({ kind: "open-edit-item", itemId: lineItems![0].itemId });
    } else if (longPressKind === "company" && company) {
      dispatchModal({ kind: "open-edit-company", companyId: company.id });
    }
  }, [longPressKind, company, hasLineItems, lineItems, dispatchModal]);

  const longPress = useLongPress({
    enabled: longPressKind !== null,
    onLongPress: fireLongPress,
  });

  return (
    <td
      className={`${CELL_BASE} relative align-middle hover:bg-surface-2 md:w-full ${
        isRecurring ? "text-flag" : "text-fg"
      }`}
    >
      {coveredTransferId && <CoverGlyphButton transferId={coveredTransferId} />}
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
          // Resolve which face the cell renders through the shared helper
          // so the read-only reconciliation modal (which reuses
          // `EntryDescriptionContent`) stays byte-for-byte in step with
          // the ledger. The aria-label / title below read the same flags.
          const display = resolveEntryDescriptionDisplay({
            value: displayValue,
            isFallback,
            entryType,
            company,
            hasLineItems,
            noCompany: !!noCompany,
          });
          const {
            hasValue,
            hasContent,
            showLineItemPill,
            showCompanyPill,
            showTypeName,
            showOmittedGlyph,
          } = display;
          const omittedLabel = t("company.omittedLabel");
          // The pill always shows the first line's item name; the "Line
          // items" prefix only earns its place when there is more than
          // one (so the pill reads as a summary rather than a single
          // mislabelled item).
          const lineItemLabel = manyLineItems
            ? `${t("cell.lineItems")}: ${firstLineItemName}`
            : firstLineItemName;
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
                if (longPress.consumeTriggered()) return;
                onClick();
              }}
              onPointerDown={longPress.onPointerDown}
              onPointerMove={longPress.onPointerMove}
              onPointerUp={longPress.onPointerUp}
              onPointerCancel={longPress.onPointerUp}
              onPointerLeave={longPress.onPointerUp}
              onContextMenu={longPress.onContextMenu}
              className={`flex h-full min-h-9 w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-[var(--table-cell-px)] py-[var(--table-cell-py)] font-mono outline-none focus-visible:bg-surface-2 ${
                hasContent
                  ? "justify-start text-left"
                  : "justify-center text-center md:justify-start md:text-left"
              } ${isRecurring ? "text-flag" : hasContent ? "text-fg" : "text-muted"}`}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={ariaLabel}
              title={title}
            >
              <EntryDescriptionContent
                value={displayValue}
                isRecurring={isRecurring}
                entryType={entryType}
                company={company}
                display={display}
                lineItem={
                  hasLineItems
                    ? { name: firstLineItemName, many: manyLineItems }
                    : undefined
                }
              />
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
  // Transient "copied" tick on the bank-text copy button, cleared after
  // a beat so the glyph reverts to the copy icon.
  const [bankTextCopied, setBankTextCopied] = useState(false);
  // The bank's raw memo for this row, wherever it lives: `bankDescription`
  // when the user has overridden the description, otherwise the
  // `placeholder` (the raw bank text seeded as the empty textarea's
  // placeholder). Either way it's the original statement text the copy
  // glyph next to the input lets the user lift verbatim. Undefined on
  // non-history rows (no bank text), which hides the glyph.
  const bankText = bankDescription ?? placeholder;

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

  async function handleCopyBankText() {
    if (!bankText) return;
    try {
      await navigator.clipboard.writeText(bankText);
      setBankTextCopied(true);
      setTimeout(() => setBankTextCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / denied permission) — leave
      // the glyph untouched rather than flashing a false success.
    }
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
        <div className="flex items-start">
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
            wrapperClassName="min-w-0 flex-1"
            className="field-input block h-full w-full resize-none rounded border-0 bg-transparent px-2 py-1.5 font-mono leading-snug whitespace-pre-wrap break-words text-fg outline-none"
          />
          {/* Lift the bank's original memo verbatim — handy on history
              rows whose description is still the bank text placeholder
              (no override), so there's no bank-memo line below to copy
              from. Mirrors the read-only transfer popover's copy glyph. */}
          {bankText && (
            <button
              type="button"
              onClick={handleCopyBankText}
              aria-label={
                bankTextCopied
                  ? t("cell.copiedBankText")
                  : t("cell.copyBankText")
              }
              title={
                bankTextCopied
                  ? t("cell.copiedBankText")
                  : t("cell.copyBankText")
              }
              className="m-0.5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              {bankTextCopied ? (
                <Check
                  size={12}
                  aria-hidden
                  focusable={false}
                  className="text-success"
                />
              ) : (
                <Copy size={12} aria-hidden focusable={false} />
              )}
            </button>
          )}
        </div>
        {bankDescription && (
          <div className="flex items-start gap-1.5 border-t border-line bg-surface-3 px-2 py-1.5 text-xs text-muted">
            <Landmark
              size={12}
              aria-hidden
              focusable={false}
              className="mt-0.5 shrink-0"
              aria-label={t("cell.originalFromBank")}
            />
            <span className="min-w-0 flex-1 font-mono break-words whitespace-pre-wrap">
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

// Description cell for synthesized transfer rows. Shows a transfer
// arrow leading into the peer account name, then the transfer
// description as plain text. Mirrors the editable description cell's
// desktop / mobile split so the row collapses cleanly on small screens.
//
// The cell is a button that opens a read-only popover showing the full
// transfer (bank) description — the inline text truncates, so on a
// revealed hidden transfer the only way to read a long bank memo is to
// tap it open. Unlike the editable `DescriptionCell` popover there is
// no company picker and no textarea: a transfer's description lives on
// `data.transfers`, not on the row, so the popover is purely for
// reading.
export function TransferDescriptionCell({
  rowId,
  value,
  peerName,
  outgoing,
}: {
  rowId: string;
  value: string;
  peerName: string;
  outgoing: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
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

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / denied permission) — leave
      // the glyph untouched rather than flashing a false success.
    }
  }

  return (
    <td className={`${CELL_BASE} relative align-middle text-flag md:w-full`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("cell.viewTransferDescription")}
        className="flex h-full min-h-9 w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-[var(--table-cell-px)] py-[var(--table-cell-py)] font-mono text-flag outline-none focus-visible:bg-surface-2"
      >
        {/* Desktop: arrow → peer · description. */}
        <span className="hidden min-w-0 items-center gap-1.5 md:flex">
          {arrow}
          <span className="text-muted">{peerName || "—"}</span>
          {value && <span className="text-muted">·</span>}
          <span className="min-w-0 truncate text-fg">{value}</span>
        </span>
        {/* Mobile: arrow → description (falls back to peer name). */}
        <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 md:hidden">
          {arrow}
          <span className="min-w-0 truncate text-fg">
            {value || peerName || "—"}
          </span>
        </span>
      </button>
      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={DESCRIPTION_POPOVER_PLACEMENT}
        rowId={rowId}
        arrow="up"
      >
        <div className="flex items-start gap-1.5 px-2 py-1.5 text-xs">
          <Landmark
            size={12}
            aria-hidden
            focusable={false}
            className="mt-0.5 shrink-0 text-muted"
            aria-label={t("cell.originalFromBank")}
          />
          <span className="min-w-0 flex-1 font-mono break-words whitespace-pre-wrap text-fg">
            {value || "—"}
          </span>
          {value && (
            <button
              type="button"
              onClick={handleCopy}
              aria-label={
                copied ? t("cell.copiedDescription") : t("cell.copyDescription")
              }
              title={
                copied ? t("cell.copiedDescription") : t("cell.copyDescription")
              }
              className="-my-0.5 -mr-0.5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              {copied ? (
                <Check
                  size={12}
                  aria-hidden
                  focusable={false}
                  className="text-success"
                />
              ) : (
                <Copy size={12} aria-hidden focusable={false} />
              )}
            </button>
          )}
        </div>
      </FloatingPanel>
    </td>
  );
}
