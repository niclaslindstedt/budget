import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Tag, X } from "lucide-react";

import { CATEGORY_COLORS, TYPE_GLYPH_NAMES } from "../data/constants";
import type { CategoryIcon, EntryType } from "../data/types";
import type { FloatingPlacement } from "../hooks";
import { ColorPalette } from "./ColorPalette";
import { FloatingPanel } from "./FloatingPanel";
import { GlyphGrid } from "./GlyphGrid";
import { CategoryIconGlyph } from "./icons";

// Mirrors CategoryPicker: prefer aligning the dropdown's right edge
// with the trigger so it opens "down and to the left" of a narrow
// chip, but the hook clamps into the viewport so it never goes off
// screen.
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
  types: readonly EntryType[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (draft: Omit<EntryType, "id">) => EntryType;
  // Usage map (typeId → count) used to sort the dropdown so the most-
  // used entries float to the top, like a country picker's "common"
  // section. Optional — pickers without a known usage map fall back
  // to insertion order.
  usageById?: ReadonlyMap<string, number>;
  // Render style. "chip" fills a table cell; "field" looks like a form field.
  variant?: "chip" | "field";
  placeholder?: string;
};

export function TypePicker({
  rowId,
  types,
  selectedId,
  onSelect,
  onCreate,
  usageById,
  variant = "field",
  placeholder = "Pick a type…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
  }, []);

  const selected = types.find((t) => t.id === selectedId) ?? null;

  // Pre-sort the list: most-used first (descending count), then
  // alphabetical by name as a stable tiebreaker. When `usageById` is
  // absent we fall back to insertion order so callers without usage
  // data still render predictably.
  const sortedTypes = useMemo(() => {
    if (!usageById) return [...types];
    return [...types].sort((a, b) => {
      const ua = usageById.get(a.id) ?? 0;
      const ub = usageById.get(b.id) ?? 0;
      if (ua !== ub) return ub - ua;
      return a.name.localeCompare(b.name);
    });
  }, [types, usageById]);

  function handlePick(id: string | null) {
    onSelect(id);
    setOpen(false);
    setCreating(false);
  }

  function handleCreated(draft: Omit<EntryType, "id">) {
    const created = onCreate(draft);
    onSelect(created.id);
    setOpen(false);
    setCreating(false);
  }

  const isChip = variant === "chip";
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
        aria-label={!selected && isChip ? "Add type" : undefined}
      >
        {selected ? (
          <TypeChip type={selected} compact={isChip} />
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

      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={rootRef}
        placement={PLACEMENT}
        rowId={rowId}
      >
        {creating ? (
          <TypeCreator
            onCancel={() => setCreating(false)}
            onSubmit={handleCreated}
          />
        ) : (
          <ul role="listbox" className="max-h-72 overflow-auto py-1">
            {sortedTypes.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted">No types yet.</li>
            )}
            {sortedTypes.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={t.id === selectedId}
                  onClick={() => handlePick(t.id)}
                  className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <TypeChip type={t} compact />
                  {t.id === selectedId && (
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
                  Clear type
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
                New type
              </button>
            </li>
          </ul>
        )}
      </FloatingPanel>
    </div>
  );
}

export function TypeChip({
  type,
  compact = false,
}: {
  type: EntryType;
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
        backgroundColor: `color-mix(in srgb, ${type.color} 18%, transparent)`,
        borderColor: `color-mix(in srgb, ${type.color} 55%, transparent)`,
        color: type.color,
      }}
    >
      <CategoryIconGlyph name={type.glyph} size={compact ? 12 : 13} />
      <span className="truncate">{type.name}</span>
    </span>
  );
}

function TypeCreator({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (draft: Omit<EntryType, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [glyph, setGlyph] = useState<CategoryIcon>("tag");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, color, glyph });
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
          placeholder="Mortgage"
        />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>Color</span>
        <ColorPalette
          colors={CATEGORY_COLORS}
          value={color}
          onChange={setColor}
          size={5}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>Glyph</span>
        <GlyphGrid icons={TYPE_GLYPH_NAMES} value={glyph} onChange={setGlyph} />
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
