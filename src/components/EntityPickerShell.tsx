import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Tag, X } from "lucide-react";

import { useRovingTabindex, type FloatingPlacement } from "../hooks";
import { FloatingPanel } from "./FloatingPanel";

type Labels = {
  // aria-label for the chip-variant trigger when nothing is selected
  // (the trigger only shows a + icon, so an explicit label is needed).
  addAriaLabel?: string;
  // Placeholder text shown inside the field-variant trigger when no
  // item is selected.
  fieldPlaceholder?: string;
  // Empty-state row shown when `items` is empty.
  empty: string;
  // "Clear category" / "Clear type" footer text. Omit to hide the
  // clear affordance.
  clear?: string;
  // "New category" / "New type" footer text. Required when
  // `renderCreator` is provided.
  create?: string;
};

type Props<T extends { id: string }> = {
  items: readonly T[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;

  // Inner content of the trigger button. Receives the resolved
  // selected item (or null) plus the chip-variant flag so callers can
  // render mobile-glyph-only vs full pill vs placeholder as they see
  // fit. The shell owns the button element, focus, and chevron.
  renderTrigger: (selected: T | null, isChip: boolean) => ReactNode;

  // Inner content of one option row in the dropdown. The shell wraps
  // it in <li><button role="option"> + the optional trailing checkmark.
  renderOption: (item: T) => ReactNode;

  // Plain-text label for an item, used for type-ahead matching (typing
  // characters jumps to the first item whose label starts with them).
  // Omit to disable type-ahead — e.g. when items have no meaningful
  // textual prefix.
  getLabel?: (item: T) => string;

  // Optional inline creator. The shell calls `done()` to exit
  // creating mode and close the picker; the caller wires the actual
  // onCreate + onSelect logic inside the rendered form's submit
  // handler.
  renderCreator?: (done: () => void) => ReactNode;

  // Optional context header rendered above the listbox — e.g. the
  // surrounding row's date + description, so the user keeps that
  // context visible while picking even though the dropdown physically
  // overlaps those columns on mobile. Skipped while the inline
  // creator is open (the form replaces the listbox entirely).
  renderHeader?: () => ReactNode;

  labels: Labels;
  placement: FloatingPlacement;
  variant?: "chip" | "field";
  rowId?: string;
};

// Shared shell for the project's entity pickers (CategoryPicker,
// TypePicker). Owns the open + creating state, the trigger button
// chrome, the FloatingPanel + listbox + clear/create footer, and the
// empty state. Callers stay in charge of filtering / sorting the
// items, rendering the visual chip, and the inline creator's fields.
export function EntityPickerShell<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  renderTrigger,
  renderOption,
  getLabel,
  renderCreator,
  renderHeader,
  labels,
  placement,
  variant = "chip",
  rowId,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Roving-tabindex cursor across the option buttons inside the
  // listbox. On open we seat it on the currently selected item (or
  // 0); ArrowUp / ArrowDown / Home / End move it; Enter / Space is
  // the browser's native button activation.
  const selectedIdx = Math.max(
    0,
    items.findIndex((it) => it.id === selectedId),
  );
  const typeaheadLabels = useMemo(
    () => (getLabel ? items.map(getLabel) : undefined),
    [getLabel, items],
  );
  const { isCursorAt, registerItem, onKeyDown } = useRovingTabindex({
    itemCount: items.length,
    initialIndex: selectedIdx,
    active: open,
    typeaheadLabels,
  });
  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
  }, []);
  // Entering creating mode lifts the form into a top-level <Modal>, so
  // the dropdown itself must close — otherwise the floating panel
  // lingers behind the modal backdrop and reappears the moment the
  // user dismisses the modal.
  const beginCreating = useCallback(() => {
    setOpen(false);
    setCreating(true);
  }, []);

  const selected = items.find((it) => it.id === selectedId) ?? null;

  function handlePick(id: string | null) {
    onSelect(id);
    close();
  }

  const isChip = variant === "chip";
  // Cells are tight on width on mobile — the chevron is decorative
  // there and the chip itself signals tappability, so it's only shown
  // for the form-field variant used inside modals.
  const showChevron = !isChip;

  return (
    <div ref={rootRef} className="relative inline-block w-full">
      <button
        type="button"
        className={
          isChip
            ? "flex h-full min-h-9 w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-2 py-1 text-left font-mono text-xs hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            : "field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm hover:border-accent focus-visible:outline-none"
        }
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={!selected && isChip ? labels.addAriaLabel : undefined}
      >
        {selected ? (
          renderTrigger(selected, isChip)
        ) : isChip ? (
          // Dashed-outlined pill rather than a bare muted Plus. The chip
          // mirrors the shape of a filled TypeChip / CategoryChip, so the
          // empty state reads as "a slot you can fill" instead of an
          // ambient glyph that competes with the read-only +/- icons in
          // adjacent amount / balance cells.
          <span
            className="inline-flex items-center justify-center rounded-full border border-dashed border-muted px-1.5 py-0.5 text-muted"
            aria-hidden
          >
            <Plus size={12} aria-hidden focusable={false} />
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-muted">
            <Tag size={14} aria-hidden focusable={false} />
            <span>{labels.fieldPlaceholder ?? ""}</span>
          </span>
        )}
        {showChevron && (
          <ChevronDown
            size={12}
            className="ml-auto shrink-0 text-muted"
            aria-hidden
            focusable={false}
          />
        )}
      </button>

      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={rootRef}
        placement={placement}
        rowId={rowId}
      >
        {renderHeader?.()}
        <ul role="listbox" className="max-h-72 overflow-auto py-1">
          {items.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">{labels.empty}</li>
          )}
          {items.map((item, idx) => (
            <li key={item.id}>
              <button
                ref={registerItem(idx)}
                type="button"
                role="option"
                aria-selected={item.id === selectedId}
                tabIndex={isCursorAt(idx) ? 0 : -1}
                onClick={() => handlePick(item.id)}
                onKeyDown={onKeyDown}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                {renderOption(item)}
                {item.id === selectedId && (
                  <Check
                    size={14}
                    className="ml-auto text-accent"
                    aria-hidden
                    focusable={false}
                  />
                )}
              </button>
            </li>
          ))}
          {selectedId && labels.clear && (
            <li>
              <button
                type="button"
                onClick={() => handlePick(null)}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-xs text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <X size={12} aria-hidden focusable={false} />
                {labels.clear}
              </button>
            </li>
          )}
          {renderCreator && labels.create && (
            <li className="mt-1 border-t border-line">
              <button
                type="button"
                onClick={beginCreating}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <Plus size={14} aria-hidden focusable={false} />
                {labels.create}
              </button>
            </li>
          )}
        </ul>
      </FloatingPanel>
      {creating && renderCreator?.(close)}
    </div>
  );
}
