import { useCallback, useMemo, useRef, useState } from "react";
import { Ban, Building2, Check, ChevronDown, Plus, X } from "lucide-react";

import type { Company } from "../data/types";
import {
  useDesktopAutoFocus,
  useRovingTabindex,
  type FloatingPlacement,
} from "../hooks";
import { useT } from "../i18n";
import { FloatingPanel } from "./FloatingPanel";
import { Button, ClearableInput } from "./form";
import { Modal } from "./Modal";

// Single-tier picker for `Company`. Companies are name-only (no
// preset list, no color, no glyph) so the dropdown is a flat sorted
// list with a "New company" footer row that opens a focused creator
// modal — mirrors the shape of `TypePicker` minus the category /
// glyph / colour scaffolding.

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "right",
  coordinateSpace: "viewport",
};

type Props = {
  // When rendered inside a sheet row, the row's id wires the picker
  // into the active-row coordinator so outside clicks dismiss it
  // without firing whatever was clicked. Modals leave it undefined.
  rowId?: string;
  companies: readonly Company[];
  selectedId: string | null;
  // Current per-entry opt-out state. When true the trigger renders an
  // "omitted" pill and the dropdown shows the "Omit company" item as
  // already-checked. Ignored unless `onOmitChange` is also wired.
  noCompany?: boolean;
  onSelect: (id: string | null) => void;
  // Toggle the per-entry omit flag. When provided, the dropdown grows
  // an "Omit company" row at the top — picking it sets the flag and
  // clears any selected company; picking a real company afterwards
  // auto-clears the flag (they're mutually exclusive). Only history-
  // entry editors wire this; rule / new-entry surfaces leave it off
  // and the row stays hidden.
  onOmitChange?: (next: boolean) => void;
  onCreate: (draft: Omit<Company, "id">) => Company;
  // Render style — kept for parity with `TypePicker`. Today every
  // call site uses "field", but the chip variant is here so a
  // future inline cell uses the same component.
  variant?: "chip" | "field";
  placeholder?: string;
};

export function CompanyPicker({
  rowId,
  companies,
  selectedId,
  noCompany,
  onSelect,
  onOmitChange,
  onCreate,
  variant = "field",
  placeholder,
}: Props) {
  const t = useT();
  const placeholderText = placeholder ?? t("company.pickCompanyEllipsis");

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...companies].sort((a, b) => a.name.localeCompare(b.name)),
    [companies],
  );

  const selected = useMemo(
    () => companies.find((c) => c.id === selectedId) ?? null,
    [companies, selectedId],
  );

  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
  }, []);

  const handleOpen = useCallback(() => {
    if (open) {
      close();
      return;
    }
    setOpen(true);
  }, [open, close]);

  const handlePick = useCallback(
    (id: string | null) => {
      onSelect(id);
      // Picking a real company contradicts an active omit — clear it
      // so the two states never disagree on screen.
      if (id !== null && noCompany && onOmitChange) onOmitChange(false);
      close();
    },
    [onSelect, close, noCompany, onOmitChange],
  );

  const handleToggleOmit = useCallback(() => {
    if (!onOmitChange) return;
    const next = !noCompany;
    onOmitChange(next);
    // Enabling omit clears any currently selected company; toggling it
    // back off leaves the picker empty (the user can pick or clear next).
    if (next && selectedId !== null) onSelect(null);
    close();
  }, [onOmitChange, noCompany, selectedId, onSelect, close]);

  const beginCreating = useCallback(() => {
    setOpen(false);
    setCreating(true);
  }, []);

  const isChip = variant === "chip";
  const showChevron = !isChip;

  const initialIdx = Math.max(
    0,
    sorted.findIndex((c) => c.id === selectedId),
  );
  const { isCursorAt, registerItem, onKeyDown } = useRovingTabindex({
    itemCount: sorted.length,
    initialIndex: initialIdx,
    active: open && !creating,
  });

  return (
    <div ref={rootRef} className="relative inline-block w-full">
      <button
        type="button"
        className={
          isChip
            ? "flex h-full min-h-9 w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-2 py-1 text-left font-mono text-xs hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:justify-start"
            : "field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm hover:border-accent focus-visible:outline-none"
        }
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={!selected && isChip ? t("company.addCompany") : undefined}
      >
        {selected ? (
          <span className="inline-flex min-w-0 items-center gap-2 text-fg">
            <Building2 size={14} aria-hidden focusable={false} />
            <span className="min-w-0 truncate">{selected.name}</span>
          </span>
        ) : noCompany && onOmitChange ? (
          <span className="inline-flex min-w-0 items-center gap-2 text-muted">
            <Ban size={14} aria-hidden focusable={false} />
            <span className="min-w-0 truncate">
              {t("company.omittedLabel")}
            </span>
          </span>
        ) : isChip ? (
          <span
            className="inline-flex items-center justify-center rounded-full border border-dashed border-muted px-1.5 py-0.5 text-muted"
            aria-hidden
          >
            <Plus size={12} aria-hidden focusable={false} />
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-muted">
            <Building2 size={14} aria-hidden focusable={false} />
            <span>{placeholderText}</span>
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
        placement={PLACEMENT}
        rowId={rowId}
      >
        <ul role="listbox" className="max-h-72 overflow-auto py-1">
          {onOmitChange && (
            <li className="border-b border-line">
              <button
                type="button"
                role="option"
                aria-selected={noCompany === true}
                onClick={handleToggleOmit}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <Ban
                  size={14}
                  aria-hidden
                  focusable={false}
                  className="shrink-0 text-muted"
                />
                <span className="min-w-0 truncate">
                  {t("company.omitCompany")}
                </span>
                {noCompany && (
                  <Check
                    size={14}
                    className="ml-auto text-accent"
                    aria-hidden
                    focusable={false}
                  />
                )}
              </button>
            </li>
          )}
          {sorted.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">
              {t("company.noCompaniesYet")}
            </li>
          )}
          {sorted.map((c, idx) => (
            <li key={c.id}>
              <button
                ref={registerItem(idx)}
                type="button"
                role="option"
                aria-selected={c.id === selectedId}
                tabIndex={isCursorAt(idx) ? 0 : -1}
                onClick={() => handlePick(c.id)}
                onKeyDown={onKeyDown}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <Building2
                  size={14}
                  aria-hidden
                  focusable={false}
                  className="shrink-0 text-muted"
                />
                <span className="min-w-0 truncate">{c.name}</span>
                {c.id === selectedId && (
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
          {selected && (
            <li>
              <button
                type="button"
                onClick={() => handlePick(null)}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-xs text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <X size={12} aria-hidden focusable={false} />
                {t("company.clearCompany")}
              </button>
            </li>
          )}
          <li className="mt-1 border-t border-line">
            <button
              type="button"
              onClick={beginCreating}
              className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <Plus size={14} aria-hidden focusable={false} />
              {t("company.newCompany")}
            </button>
          </li>
        </ul>
      </FloatingPanel>
      {creating && (
        <CompanyCreator
          existing={companies}
          onCancel={close}
          onSubmit={(draft) => {
            const created = onCreate(draft);
            onSelect(created.id);
            close();
          }}
        />
      )}
    </div>
  );
}

// Focused creator modal — single text input, OK / Cancel. Matches the
// shape of `CategoryCreator` minus the colour / glyph pickers.
function CompanyCreator({
  existing,
  onCancel,
  onSubmit,
}: {
  existing: readonly Company[];
  onCancel: () => void;
  onSubmit: (draft: Omit<Company, "id">) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(inputRef, true);
  const trimmed = name.trim();
  const duplicate = existing.some(
    (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const canSubmit = trimmed.length > 0 && !duplicate;

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="company-creator-title"
      size="max-w-sm"
      centered
    >
      <Modal.Header
        icon={<Building2 size={14} aria-hidden focusable={false} />}
        title={t("company.newCompany")}
        onClose={onCancel}
      />
      <Modal.Body>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">{t("company.name")}</span>
          <ClearableInput
            ref={inputRef}
            value={name}
            onValueChange={setName}
            placeholder={t("company.namePlaceholder")}
            className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
          />
          {duplicate && (
            <span className="text-xs text-danger">
              {t("company.duplicateName")}
            </span>
          )}
        </label>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (!canSubmit) return;
            onSubmit({ name: trimmed });
          }}
          disabled={!canSubmit}
        >
          {t("company.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
