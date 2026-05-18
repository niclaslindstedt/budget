import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Tag, X } from "lucide-react";

import { CATEGORY_COLORS, CATEGORY_ICON_NAMES } from "../data/constants";
import type { Category, CategoryIcon } from "../data/types";
import { useActiveRow } from "./useActiveRow";
import { CategoryIconGlyph } from "./icons";

const DROPDOWN_MIN_WIDTH = 224; // matches min-w-[14rem]
const VIEWPORT_MARGIN = 8;

type Position = { top: number; left: number; minWidth: number };

function computePosition(rect: DOMRect): Position {
  // Prefer aligning the dropdown's right edge with the trigger's right
  // edge so it opens "down and to the left" of narrow chip cells, but
  // clamp into the viewport so it never goes off-screen.
  const minWidth = Math.max(DROPDOWN_MIN_WIDTH, rect.width);
  let left = rect.right - minWidth;
  const maxLeft = window.innerWidth - VIEWPORT_MARGIN - minWidth;
  if (left > maxLeft) left = maxLeft;
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
  return { top: rect.bottom + 4, left, minWidth };
}

type Props = {
  // When rendered inside a sheet row, the row's id wires the picker
  // into the active-row coordinator so outside clicks dismiss it
  // without also firing whatever was clicked. Modals (BulkEdit,
  // SheetModal, ComplexEntry) leave it undefined.
  rowId?: string;
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (draft: Omit<Category, "id">) => Category;
  // Render style. "chip" fills a table cell; "field" looks like a form field.
  variant?: "chip" | "field";
  placeholder?: string;
};

export function CategoryPicker({
  rowId,
  categories,
  selectedId,
  onSelect,
  onCreate,
  variant = "chip",
  placeholder = "Add category…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeRow = useActiveRow();

  const selected = categories.find((c) => c.id === selectedId) ?? null;

  // Register with the active-row coordinator while the dropdown is open
  // so outside clicks dismiss it without firing the underlying button.
  // Only applies inside a sheet row — modals do not provide a context.
  useEffect(() => {
    if (!open || !activeRow || !rowId) return;
    const token = activeRow.activate(rowId, () => {
      setOpen(false);
      setCreating(false);
    });
    return () => activeRow.deactivate(token);
  }, [open, activeRow, rowId]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    setPosition(computePosition(rootRef.current.getBoundingClientRect()));
  }, [open, creating]);

  useEffect(() => {
    if (!open) return;
    function updatePosition() {
      if (!rootRef.current) return;
      setPosition(computePosition(rootRef.current.getBoundingClientRect()));
    }
    function handlePointer(e: PointerEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setCreating(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", updatePosition);
    // Capture phase catches scrolls on any ancestor (e.g. the page).
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function handlePick(id: string | null) {
    onSelect(id);
    setOpen(false);
    setCreating(false);
  }

  function handleCreated(draft: Omit<Category, "id">) {
    const created = onCreate(draft);
    onSelect(created.id);
    setOpen(false);
    setCreating(false);
  }

  const isChip = variant === "chip";
  // Cells are tight on width on mobile — the chevron is decorative there
  // and the chip itself signals tappability, so it's only shown for the
  // form-field variant used inside modals.
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
        aria-label={!selected && isChip ? "Add category" : undefined}
      >
        {selected ? (
          isChip ? (
            <>
              {/* Mobile: glyph only, in the category's colour, prominent.
                 The cell is 40px wide on mobile — a chip with a tinted
                 background fades into the row, so render the bare icon
                 instead and let the colour carry the identity. */}
              <span
                className="inline-flex items-center justify-center md:hidden"
                style={{ color: selected.color }}
                aria-hidden
              >
                <CategoryIconGlyph name={selected.icon} size={18} />
              </span>
              {/* Desktop: full chip with glyph + name. */}
              <span className="hidden md:inline-flex">
                <CategoryChip category={selected} compact />
              </span>
            </>
          ) : (
            <CategoryChip category={selected} />
          )
        ) : isChip ? (
          <Plus
            size={16}
            className="text-muted"
            aria-hidden
            focusable={false}
          />
        ) : (
          <span className="inline-flex items-center gap-2 text-muted">
            <Tag size={14} aria-hidden focusable={false} />
            <span>{placeholder}</span>
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

      {open &&
        position &&
        createPortal(
          <div
            ref={dropdownRef}
            data-active-portal
            className="fixed z-50 rounded border border-line bg-surface-2 shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              minWidth: position.minWidth,
            }}
          >
            {creating ? (
              <CategoryCreator
                onCancel={() => setCreating(false)}
                onSubmit={handleCreated}
              />
            ) : (
              <ul role="listbox" className="max-h-72 overflow-auto py-1">
                {categories.length === 0 && (
                  <li className="px-3 py-2 text-xs text-muted">
                    No categories yet.
                  </li>
                )}
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={cat.id === selectedId}
                      onClick={() => handlePick(cat.id)}
                      className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    >
                      <CategoryChip category={cat} compact />
                      {cat.id === selectedId && (
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
                {selectedId && (
                  <li>
                    <button
                      type="button"
                      onClick={() => handlePick(null)}
                      className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-xs text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    >
                      <X size={12} aria-hidden focusable={false} />
                      Clear category
                    </button>
                  </li>
                )}
                <li className="mt-1 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <Plus size={14} aria-hidden focusable={false} />
                    New category
                  </button>
                </li>
              </ul>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function CategoryChip({
  category,
  compact = false,
}: {
  category: Category;
  compact?: boolean;
}) {
  return (
    <span
      className={
        compact
          ? "inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium"
          : "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-sm font-medium"
      }
      style={{
        backgroundColor: `color-mix(in srgb, ${category.color} 18%, transparent)`,
        borderColor: `color-mix(in srgb, ${category.color} 55%, transparent)`,
        color: category.color,
      }}
    >
      <CategoryIconGlyph name={category.icon} size={compact ? 12 : 13} />
      <span className="truncate">{category.name}</span>
    </span>
  );
}

function CategoryCreator({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (draft: Omit<Category, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState<CategoryIcon>("tag");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, color, icon });
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        <span>Name</span>
        <input
          ref={nameRef}
          type="text"
          className="field-input rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Rent"
        />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>Color</span>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              aria-pressed={c === color}
              onClick={() => setColor(c)}
              className={`h-5 w-5 cursor-pointer rounded-full border-2 ${
                c === color ? "border-fg-bright" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>Icon</span>
        <div className="grid grid-cols-8 gap-1">
          {CATEGORY_ICON_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              aria-label={`Icon ${name}`}
              aria-pressed={name === icon}
              onClick={() => setIcon(name)}
              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded border ${
                name === icon
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:border-fg"
              }`}
            >
              <CategoryIconGlyph name={name} size={14} />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="cursor-pointer rounded border border-accent bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create
        </button>
      </div>
    </div>
  );
}
