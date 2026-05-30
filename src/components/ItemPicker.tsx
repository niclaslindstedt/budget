import { useCallback, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Package, Plus, X } from "lucide-react";

import type { Category, EntryType, Item, Subtype } from "../data/types";
import {
  useDesktopAutoFocus,
  useRovingTabindex,
  type FloatingPlacement,
} from "../hooks";
import { useT } from "../i18n";
import { FloatingPanel } from "./FloatingPanel";
import { Button, ClearableInput } from "./form";
import { Modal } from "./Modal";
import { SubtypePicker } from "./SubtypePicker";

// Single-tier picker for owned `Item`s. Items are a flat sorted list with a
// "New item" footer that opens a creator modal (name + optional subtype).
// Mirrors `CompanyPicker`; the creator embeds `SubtypePicker` so an item
// can be classified at creation time.

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "right",
  coordinateSpace: "viewport",
};

type Props = {
  items: readonly Item[];
  subtypes: readonly Subtype[];
  types: readonly EntryType[];
  categories: readonly Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreateItem: (draft: Omit<Item, "id">) => Item;
  onCreateSubtype: (draft: Omit<Subtype, "id">) => Subtype;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  placeholder?: string;
};

export function ItemPicker({
  items,
  subtypes,
  types,
  categories,
  selectedId,
  onSelect,
  onCreateItem,
  onCreateSubtype,
  onCreateType,
  onCreateCategory,
  placeholder,
}: Props) {
  const t = useT();
  const placeholderText = placeholder ?? t("items.pickItemEllipsis");

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  const selected = useMemo(
    () => items.find((it) => it.id === selectedId) ?? null,
    [items, selectedId],
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
      close();
    },
    [onSelect, close],
  );

  const handleClear = useCallback(() => {
    if (selectedId !== null) onSelect(null);
    close();
  }, [selectedId, onSelect, close]);

  const beginCreating = useCallback(() => {
    setOpen(false);
    setCreating(true);
  }, []);

  const initialIdx = Math.max(
    0,
    sorted.findIndex((it) => it.id === selectedId),
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
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm hover:border-accent focus-visible:outline-none"
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <span className="inline-flex min-w-0 items-center gap-2 text-fg">
            <Package size={14} aria-hidden focusable={false} />
            <span className="min-w-0 truncate">{selected.name}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-muted">
            <Package size={14} aria-hidden focusable={false} />
            <span>{placeholderText}</span>
          </span>
        )}
        <ChevronDown
          size={12}
          className="ml-auto shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>

      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={rootRef}
        placement={PLACEMENT}
      >
        <ul role="listbox" className="max-h-72 overflow-auto py-1">
          {sorted.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">
              {t("items.noItemsYet")}
            </li>
          )}
          {sorted.map((it, idx) => (
            <li key={it.id}>
              <button
                ref={registerItem(idx)}
                type="button"
                role="option"
                aria-selected={it.id === selectedId}
                tabIndex={isCursorAt(idx) ? 0 : -1}
                onClick={() => handlePick(it.id)}
                onKeyDown={onKeyDown}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <Package
                  size={14}
                  aria-hidden
                  focusable={false}
                  className="shrink-0 text-muted"
                />
                <span className="min-w-0 truncate">{it.name}</span>
                {it.id === selectedId && (
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
                onClick={handleClear}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-xs text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <X size={12} aria-hidden focusable={false} />
                {t("items.clearItem")}
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
              {t("items.newItem")}
            </button>
          </li>
        </ul>
      </FloatingPanel>
      {creating && (
        <ItemCreator
          subtypes={subtypes}
          types={types}
          categories={categories}
          onCreateSubtype={onCreateSubtype}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
          onCancel={close}
          onSubmit={(draft) => {
            const created = onCreateItem(draft);
            onSelect(created.id);
            close();
          }}
        />
      )}
    </div>
  );
}

// Focused creator modal — a name input plus an optional `SubtypePicker`
// for classification. Subtype is optional; an item with no subtype is
// "unclassified". OK / Cancel.
function ItemCreator({
  subtypes,
  types,
  categories,
  onCreateSubtype,
  onCreateType,
  onCreateCategory,
  onCancel,
  onSubmit,
}: {
  subtypes: readonly Subtype[];
  types: readonly EntryType[];
  categories: readonly Category[];
  onCreateSubtype: (draft: Omit<Subtype, "id">) => Subtype;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCancel: () => void;
  onSubmit: (draft: Omit<Item, "id">) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [subtypeId, setSubtypeId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(inputRef, true);
  const trimmed = name.trim();
  // Two physical units can share a name (two iPhones = two items), so a
  // duplicate name is allowed — no duplicate guard here.
  const canSubmit = trimmed.length > 0;

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="item-creator-title"
      size="max-w-sm"
      centered
    >
      <Modal.Header
        icon={<Package size={14} aria-hidden focusable={false} />}
        title={t("items.newItem")}
        onClose={onCancel}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("items.itemName")}</span>
            <ClearableInput
              ref={inputRef}
              value={name}
              onValueChange={setName}
              placeholder={t("items.itemNamePlaceholder")}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("items.subtypeOptional")}
            </span>
            <SubtypePicker
              subtypes={subtypes}
              types={types}
              categories={categories}
              selectedId={subtypeId}
              onSelect={setSubtypeId}
              onCreate={onCreateSubtype}
              onCreateType={onCreateType}
              onCreateCategory={onCreateCategory}
            />
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (!canSubmit) return;
            const draft: Omit<Item, "id"> = { name: trimmed };
            if (subtypeId !== null) draft.subtypeId = subtypeId;
            onSubmit(draft);
          }}
          disabled={!canSubmit}
        >
          {t("items.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
