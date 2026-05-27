import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeftRight, ArrowRight, Building2, Repeat } from "lucide-react";

import type { CellValue, Company, EntryType } from "../../../data/types";
import { type FloatingPlacement, useSelectAllOnFocus } from "../../../hooks";
import { ClearableTextarea } from "../../form";
import { useT } from "../../../i18n";
import { displayTypeName } from "../../../i18n/preset-names";
import { useClaimActiveRow } from "../../useClaimActiveRow";
import { DismissBackdrop } from "../../DismissBackdrop";
import { FloatingPanel } from "../../FloatingPanel";
import { CELL_BASE, INPUT_BASE } from "./constants";

// Enter in an inline description textarea commits the value (by
// blurring — `handleBlur` snapshots and bubbles the commit). Shift +
// Enter still inserts a newline so multi-line descriptions remain
// possible. The IME-composing guard avoids stealing the Enter that
// confirms an Asian-input candidate.
function handleDescriptionCommitKey(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
) {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.nativeEvent.isComposing
  ) {
    event.preventDefault();
    event.currentTarget.blur();
  }
}

// Typed rows reclaim the narrow mobile description column for the
// type's name (plain text in the type's colour) — a clearer
// identifier than the bank's memo at a glance. Desktop keeps the
// description inline since the dedicated type column already
// carries the chip + name there. Both branches render the same
// `DesktopDescriptionEditor` + `DescriptionPopover` tree so that a
// reducer-driven type flip mid-edit (pattern auto-categorisation
// assigning `typeId` after a matching description lands) reconciles
// without unmounting the textarea — otherwise the keystroke that
// completed the match (often a trailing space) is lost along with
// focus.
export function DescriptionCell({
  rowId,
  value,
  isRecurring,
  entryType,
  company,
  placeholder,
  onChange,
  onCommit,
}: {
  rowId: string;
  value: string;
  isRecurring: boolean;
  entryType: EntryType | null;
  // Resolved Company for `row.companyId`. When the cell is in fallback
  // mode (no user-authored description) and a company is set, the
  // trigger renders an outlined pill with the company glyph + name
  // instead of the type-name / bank-text fallback.
  company: Company | null;
  // When set, `value` is a fallback (company / type / bank text) rather
  // than a user-authored description. The trigger renders the
  // appropriate fallback (company pill, type-coloured name, or "…")
  // and the inline editor opens with an empty textarea + this string
  // as the input placeholder. Supplied by `synthesizeHistoryRow` via
  // `Row.descriptionPlaceholder`.
  placeholder?: string;
  onChange: (value: CellValue) => void;
  onCommit?: (value: CellValue) => void;
}) {
  const t = useT();
  const typeLabel = entryType ? displayTypeName(entryType, t) : "";
  const isFallback = placeholder !== undefined;
  return (
    <td
      className={`${CELL_BASE} align-middle hover:bg-surface-2 md:w-full ${
        isRecurring ? "text-flag" : "text-fg"
      }`}
    >
      <DesktopDescriptionEditor
        rowId={rowId}
        value={value}
        isRecurring={isRecurring}
        onChange={onChange}
        onCommit={onCommit}
      />
      <DescriptionPopover
        rowId={rowId}
        value={value}
        editValue={isFallback ? "" : value}
        placeholder={placeholder}
        onChange={onChange}
        onCommit={onCommit}
        renderTrigger={({ ref, onClick, open, displayValue }) => {
          const hasValue = displayValue.length > 0;
          // The fallback rendering applies whenever the cell is showing
          // a calculated value, even when the popover is closed and
          // `displayValue` is non-empty. Without `isFallback`, the
          // trigger reverts to plain description styling as soon as the
          // popover closes — which is misleading because the row still
          // has no user-authored description.
          const fallback = isFallback || !hasValue;
          const showCompanyPill = fallback && !!company;
          const showTypeName = fallback && !company && !!entryType;
          const hasContent = showCompanyPill || showTypeName || hasValue;
          const ariaLabel = showCompanyPill
            ? company!.name
            : showTypeName
              ? typeLabel
              : hasValue
                ? entryType
                  ? `${typeLabel}: ${displayValue}`
                  : t("cell.descriptionWith", { value: displayValue })
                : entryType
                  ? typeLabel
                  : t("cell.addDescription");
          const title = showCompanyPill
            ? company!.name
            : showTypeName
              ? typeLabel
              : hasValue
                ? displayValue
                : undefined;
          return (
            <button
              ref={ref}
              type="button"
              onClick={onClick}
              className={`flex h-full min-h-9 w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-2.5 py-2 font-mono outline-none focus-visible:bg-surface-2 md:hidden ${
                hasContent
                  ? "justify-start text-left"
                  : "justify-center text-center"
              } ${isRecurring ? "text-flag" : hasContent ? "text-fg" : "text-muted"}`}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={ariaLabel}
              title={title}
            >
              {isRecurring && (
                <Repeat
                  size={16}
                  aria-hidden
                  focusable={false}
                  className="shrink-0 text-flag"
                />
              )}
              {showCompanyPill ? (
                <CompanyPill name={company!.name} />
              ) : showTypeName ? (
                <span
                  className="min-w-0 truncate"
                  style={{ color: entryType!.color }}
                >
                  {typeLabel}
                </span>
              ) : hasValue ? (
                <span className="min-w-0 truncate">{displayValue}</span>
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

// Desktop branch of the description cell, shared by the Plain and
// Typed variants. Snapshots the value on focus so blur only emits a
// commit when the text actually changed — avoids prompting after a
// no-op click in.
function DesktopDescriptionEditor({
  rowId,
  value,
  isRecurring,
  onChange,
  onCommit,
}: {
  rowId: string;
  value: string;
  isRecurring: boolean;
  onChange: (value: CellValue) => void;
  onCommit?: (value: CellValue) => void;
}) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusValueRef = useRef<string>(value);
  useClaimActiveRow(rowId, focused, () => textareaRef.current?.blur());
  // In-row description editor: keep tap-to-select-all since the column
  // is too narrow for an inline X clear button.
  const onFocusSelectAll = useSelectAllOnFocus<HTMLTextAreaElement>();

  function handleFocus(e: React.FocusEvent<HTMLTextAreaElement>) {
    setFocused(true);
    focusValueRef.current = value;
    onFocusSelectAll(e);
  }

  function handleBlur() {
    setFocused(false);
    if (!onCommit) return;
    if (value !== focusValueRef.current) onCommit(value);
  }

  return (
    <div
      className={`relative hidden md:flex md:items-start ${
        focused ? "z-[60]" : ""
      }`}
    >
      {focused && (
        <DismissBackdrop onDismiss={() => textareaRef.current?.blur()} />
      )}
      {isRecurring && (
        <span
          aria-label={t("cell.recurring")}
          title={t("cell.recurring")}
          className="flex shrink-0 items-center pt-2 pl-2 text-flag"
        >
          <Repeat size={12} aria-hidden focusable={false} />
        </span>
      )}
      <textarea
        ref={textareaRef}
        className={`${INPUT_BASE} resize-none leading-snug whitespace-pre-wrap break-words [field-sizing:content] min-h-[1.6em] ${
          isRecurring ? "pl-1.5" : ""
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleDescriptionCommitKey}
        rows={1}
        placeholder={t("cell.placeholderEllipsis")}
      />
    </div>
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

// Mobile description popover shared by the Plain and Typed cells.
// The two cells differ only in the trigger button (recurring icon /
// "…" vs the type's name in the type's colour), so callers pass the
// trigger via `renderTrigger` and the popover owns the open state,
// the commit-on-close hook, and the textarea editor.
function DescriptionPopover({
  rowId,
  value,
  editValue,
  placeholder,
  onChange,
  onCommit,
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
  onChange: (value: CellValue) => void;
  onCommit?: (value: CellValue) => void;
  renderTrigger: (ctx: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    open: boolean;
    displayValue: string;
  }) => React.ReactNode;
}) {
  const t = useT();
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
          wrapperClassName="w-full"
          className="field-input block w-full resize-none rounded border-0 bg-transparent px-2 py-1.5 font-mono leading-snug whitespace-pre-wrap break-words text-fg outline-none [field-sizing:content]"
        />
      </FloatingPanel>
    </>
  );
}

// Outlined pill with the company glyph + name, shown inside the
// description cell when the row has a `companyId` but no user-authored
// description. Uses theme tokens so the pill stays high-contrast in
// both dark (white-on-dark) and light (dark-on-light) themes.
function CompanyPill({ name }: { name: string }) {
  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border bg-transparent px-2 py-0.5 font-medium"
      style={{
        borderColor: "var(--fg-bright)",
        color: "var(--fg-bright)",
      }}
    >
      <Building2 size={12} aria-hidden focusable={false} className="shrink-0" />
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
