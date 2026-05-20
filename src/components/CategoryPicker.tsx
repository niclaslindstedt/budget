import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Tag, X } from "lucide-react";

import { CATEGORY_COLORS, CATEGORY_GLYPH_NAMES } from "../data/constants";
import type { Category, CategoryIcon } from "../data/types";
import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { displayCategoryName } from "../i18n/preset-names";
import { ColorPalette } from "./ColorPalette";
import { ClearableTextInput } from "./form";
import { FloatingPanel } from "./FloatingPanel";
import { GlyphGrid } from "./GlyphGrid";
import { CategoryIconGlyph } from "./icons";

// Right-aligned with the trigger so the dropdown opens "down and to the
// left" of narrow chip cells; the hook clamps to the viewport so it
// never goes off-screen.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 224 }, // matches min-w-[14rem]
  anchor: "right",
  coordinateSpace: "viewport",
};

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
  placeholder,
}: Props) {
  const t = useT();
  const placeholderText = placeholder ?? t("category.addCategoryEllipsis");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
  }, []);

  const selected = categories.find((c) => c.id === selectedId) ?? null;

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
        aria-label={!selected && isChip ? t("category.addCategory") : undefined}
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
        {creating ? (
          <CategoryCreator
            onCancel={() => setCreating(false)}
            onSubmit={handleCreated}
          />
        ) : (
          <ul role="listbox" className="max-h-72 overflow-auto py-1">
            {categories.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted">
                {t("category.noCategoriesYet")}
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
                  {t("category.clearCategory")}
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
                {t("category.newCategory")}
              </button>
            </li>
          </ul>
        )}
      </FloatingPanel>
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
  const t = useT();
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
      <span className="truncate">{displayCategoryName(category, t)}</span>
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
  const t = useT();
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
        <span>{t("category.name")}</span>
        <ClearableTextInput
          ref={nameRef}
          className="field-input w-full min-w-0 rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
          value={name}
          onValueChange={setName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={t("category.namePlaceholder")}
        />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>{t("category.color")}</span>
        <ColorPalette
          colors={CATEGORY_COLORS}
          value={color}
          onChange={setColor}
          size={5}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>{t("category.icon")}</span>
        <GlyphGrid
          icons={CATEGORY_GLYPH_NAMES}
          value={icon}
          onChange={setIcon}
          tintColor={color}
        />
      </div>
      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="cursor-pointer rounded border border-accent bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("category.create")}
        </button>
      </div>
    </div>
  );
}
