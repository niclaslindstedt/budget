import { useCallback, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Layers, Plus, X } from "lucide-react";

import type { Category, EntryType, Subtype } from "../data/types";
import {
  useDesktopAutoFocus,
  useRovingTabindex,
  type FloatingPlacement,
} from "../hooks";
import { useT } from "../i18n";
import { FloatingPanel } from "./FloatingPanel";
import { Button, ClearableInput } from "./form";
import { Modal } from "./Modal";
import { TypePicker } from "./TypePicker";

// Single-tier picker for `Subtype`, the third taxonomy tier. Subtypes are
// name-only records that hang off exactly one `EntryType` via `typeId`, so
// the dropdown is a flat sorted list (each row showing its parent type for
// disambiguation) with a "New subtype" footer that opens a creator modal —
// the creator reuses `TypePicker` to choose the parent type. Mirrors
// `CompanyPicker` plus the parent-type scaffolding.

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "right",
  coordinateSpace: "viewport",
};

type Props = {
  subtypes: readonly Subtype[];
  types: readonly EntryType[];
  categories: readonly Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (draft: Omit<Subtype, "id">) => Subtype;
  // Threaded into the creator's parent-type `TypePicker` so the user can
  // spawn a brand-new type / category without leaving the subtype flow.
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  // When set, the parent type is fixed: the creator skips its `TypePicker`
  // and files a new subtype under this type id. Used by scoped callers (the
  // repairs editor pins it to Repairs / Renovations) where the parent is
  // never the user's choice. Callers also pass an already-filtered `subtypes`
  // list so the dropdown only offers subtypes under the same type.
  fixedParentTypeId?: string;
  placeholder?: string;
};

export function SubtypePicker({
  subtypes,
  types,
  categories,
  selectedId,
  onSelect,
  onCreate,
  onCreateType,
  onCreateCategory,
  fixedParentTypeId,
  placeholder,
}: Props) {
  const t = useT();
  const placeholderText = placeholder ?? t("items.pickSubtypeEllipsis");

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const typeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const ty of types) m.set(ty.id, ty.name);
    return m;
  }, [types]);

  const sorted = useMemo(
    () => [...subtypes].sort((a, b) => a.name.localeCompare(b.name)),
    [subtypes],
  );

  const selected = useMemo(
    () => subtypes.find((s) => s.id === selectedId) ?? null,
    [subtypes, selectedId],
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
    sorted.findIndex((s) => s.id === selectedId),
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
            <Layers size={14} aria-hidden focusable={false} />
            <span className="min-w-0 truncate">{selected.name}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-muted">
            <Layers size={14} aria-hidden focusable={false} />
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
              {t("items.noSubtypesYet")}
            </li>
          )}
          {sorted.map((s, idx) => {
            const parent = typeNameById.get(s.typeId);
            return (
              <li key={s.id}>
                <button
                  ref={registerItem(idx)}
                  type="button"
                  role="option"
                  aria-selected={s.id === selectedId}
                  tabIndex={isCursorAt(idx) ? 0 : -1}
                  onClick={() => handlePick(s.id)}
                  onKeyDown={onKeyDown}
                  className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <Layers
                    size={14}
                    aria-hidden
                    focusable={false}
                    className="shrink-0 text-muted"
                  />
                  <span className="min-w-0 truncate">{s.name}</span>
                  {parent && (
                    <span className="ml-1 min-w-0 truncate text-xs text-muted">
                      {parent}
                    </span>
                  )}
                  {s.id === selectedId && (
                    <Check
                      size={14}
                      className="ml-auto text-accent"
                      aria-hidden
                      focusable={false}
                    />
                  )}
                </button>
              </li>
            );
          })}
          {selected && (
            <li>
              <button
                type="button"
                onClick={handleClear}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-xs text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <X size={12} aria-hidden focusable={false} />
                {t("items.clearSubtype")}
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
              {t("items.newSubtype")}
            </button>
          </li>
        </ul>
      </FloatingPanel>
      {creating && (
        <SubtypeCreator
          existing={subtypes}
          types={types}
          categories={categories}
          fixedParentTypeId={fixedParentTypeId}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
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

// Focused creator modal — a name input plus a `TypePicker` to pick the
// parent type (every subtype belongs to exactly one type). OK / Cancel.
function SubtypeCreator({
  existing,
  types,
  categories,
  fixedParentTypeId,
  onCreateType,
  onCreateCategory,
  onCancel,
  onSubmit,
}: {
  existing: readonly Subtype[];
  types: readonly EntryType[];
  categories: readonly Category[];
  fixedParentTypeId?: string;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCancel: () => void;
  onSubmit: (draft: Omit<Subtype, "id">) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  // With a pinned parent type the picker is skipped and the type is fixed;
  // otherwise the user chooses it through the `TypePicker` below.
  const [typeId, setTypeId] = useState<string | null>(
    fixedParentTypeId ?? null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(inputRef, true);
  const trimmed = name.trim();
  // A subtype name is only required to be unique within its parent type, so
  // "Laptop" under Electronics and "Laptop" under Insurance can coexist.
  const duplicate = existing.some(
    (s) =>
      s.typeId === typeId &&
      s.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const canSubmit = trimmed.length > 0 && typeId !== null && !duplicate;

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="subtype-creator-title"
      size="max-w-sm"
      centered
    >
      <Modal.Header
        icon={<Layers size={14} aria-hidden focusable={false} />}
        title={t("items.newSubtype")}
        onClose={onCancel}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("items.subtypeName")}</span>
            <ClearableInput
              ref={inputRef}
              value={name}
              onValueChange={setName}
              placeholder={t("items.subtypeNamePlaceholder")}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
            {duplicate && (
              <span className="text-xs text-danger">
                {t("items.subtypeDuplicateName")}
              </span>
            )}
          </label>
          {fixedParentTypeId === undefined && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("items.parentType")}
              </span>
              <TypePicker
                types={types}
                categories={categories}
                selectedId={typeId}
                onSelect={setTypeId}
                onCreate={onCreateType}
                onCreateCategory={onCreateCategory}
                placeholder={t("items.parentTypePlaceholder")}
              />
            </label>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (!canSubmit || typeId === null) return;
            onSubmit({ name: trimmed, typeId });
          }}
          disabled={!canSubmit}
        >
          {t("items.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
