import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Tag, X } from "lucide-react";

import { CATEGORY_COLORS, CATEGORY_ICON_NAMES } from "../data/constants";
import type { Category, CategoryIcon } from "../data/types";
import { CategoryIconGlyph } from "./icons";

type Props = {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (draft: Omit<Category, "id">) => Category;
  // Render style. "chip" fills a table cell; "field" looks like a form field.
  variant?: "chip" | "field";
  placeholder?: string;
};

export function CategoryPicker({
  categories,
  selectedId,
  onSelect,
  onCreate,
  variant = "chip",
  placeholder = "Add category…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = categories.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
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
  const showChevron = selected !== null || !isChip;

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
          <CategoryChip
            category={selected}
            compact={isChip}
            hideNameOnMobile={isChip}
          />
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

      {open && (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 min-w-[14rem] rounded border border-line bg-surface-2 shadow-lg">
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
        </div>
      )}
    </div>
  );
}

export function CategoryChip({
  category,
  compact = false,
  hideNameOnMobile = false,
}: {
  category: Category;
  compact?: boolean;
  hideNameOnMobile?: boolean;
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
      <span
        className={hideNameOnMobile ? "hidden truncate md:inline" : "truncate"}
      >
        {category.name}
      </span>
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
        <span className="text-flag">--name</span>
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
        <span className="text-flag">--color</span>
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
        <span className="text-flag">--icon</span>
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
