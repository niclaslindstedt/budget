import { useState } from "react";
import { Check, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  CATEGORY_COLORS,
  CATEGORY_GLYPH_NAMES,
  PRESET_CATEGORIES,
  PRESET_ENTRY_TYPES,
  TYPE_GLYPH_NAMES,
} from "../../data/constants";
import type { Category, CategoryIcon, EntryType } from "../../data/types";
import { CategoryChip } from "../CategoryPicker";
import { ColorPalette } from "../ColorPalette";
import { ConfirmDialog } from "../ConfirmDialog";
import { GlyphGrid } from "../GlyphGrid";
import { TypeChip } from "../TypePicker";

// Shared list/edit shell for categories and types. The two admin
// surfaces are structurally identical — list presets with a hide
// toggle, list user-added entries with edit + delete, plus an "Add"
// button at the bottom that swaps the row into an inline editor — so
// the loop, the editor, and the confirm-delete plumbing all live in
// these two components instead of being duplicated per shape.
//
// We deliberately don't try to abstract into a single generic admin
// for both shapes: `Category.icon` vs `EntryType.glyph` field name,
// the chip components, and the glyph allowlists differ enough that
// the extra plumbing reads worse than two parallel components.

export function CategoriesAdmin({
  userCategories,
  hiddenPresetIds,
  onCreate,
  onUpdate,
  onDelete,
  onSetPresetHidden,
}: {
  userCategories: Category[];
  hiddenPresetIds: string[];
  onCreate: (draft: Omit<Category, "id">) => Category;
  onUpdate: (id: string, patch: Partial<Omit<Category, "id">>) => void;
  onDelete: (id: string) => void;
  onSetPresetHidden: (presetId: string, hidden: boolean) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const hidden = new Set(hiddenPresetIds);
  const pendingDelete =
    pendingDeleteId !== null
      ? (userCategories.find((c) => c.id === pendingDeleteId) ?? null)
      : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        Built-in categories can be hidden to declutter the picker; your own
        categories can be edited or removed. Removing one clears the tag on any
        rows or transactions it labelled.
      </p>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded border border-line bg-surface-2">
        {PRESET_CATEGORIES.map((cat) => {
          const isHidden = hidden.has(cat.id);
          return (
            <li
              key={cat.id}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
            >
              <CategoryChip category={cat} compact />
              <span className="text-xs text-muted">Built-in</span>
              <button
                type="button"
                onClick={() => onSetPresetHidden(cat.id, !isHidden)}
                aria-pressed={!isHidden}
                aria-label={isHidden ? "Show category" : "Hide category"}
                title={isHidden ? "Show in picker" : "Hide from picker"}
                className={`ml-auto inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line ${
                  isHidden
                    ? "bg-surface text-muted hover:text-fg"
                    : "bg-accent/10 text-accent hover:bg-accent/20"
                }`}
              >
                {isHidden ? (
                  <EyeOff size={14} aria-hidden focusable={false} />
                ) : (
                  <Eye size={14} aria-hidden focusable={false} />
                )}
              </button>
            </li>
          );
        })}
        {userCategories.map((cat) => {
          if (editingId === cat.id) {
            return (
              <li key={cat.id} className="px-2 py-2">
                <CategoryEditor
                  initial={cat}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(draft) => {
                    onUpdate(cat.id, draft);
                    setEditingId(null);
                  }}
                />
              </li>
            );
          }
          return (
            <li
              key={cat.id}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
            >
              <CategoryChip category={cat} compact />
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingId(cat.id)}
                  aria-label="Edit category"
                  title="Edit"
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                >
                  <Pencil size={13} aria-hidden focusable={false} />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(cat.id)}
                  aria-label="Delete category"
                  title="Delete"
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-danger hover:text-danger"
                >
                  <Trash2 size={13} aria-hidden focusable={false} />
                </button>
              </div>
            </li>
          );
        })}
        {userCategories.length === 0 && hiddenPresetIds.length === 0 && (
          <li className="px-2 py-1.5 text-xs text-muted">
            Add your own categories below for buckets the built-in list doesn't
            cover.
          </li>
        )}
      </ul>
      {creating ? (
        <div className="rounded border border-line bg-surface-2 p-2">
          <CategoryEditor
            initial={null}
            submitLabel="Add"
            onCancel={() => setCreating(false)}
            onSubmit={(draft) => {
              onCreate(draft);
              setCreating(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
        >
          <Plus size={14} aria-hidden focusable={false} />
          Add category
        </button>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete category"
        description={
          pendingDelete
            ? `Remove "${pendingDelete.name}"? Any rows or transactions tagged with it will lose their category.`
            : null
        }
        actions={[
          {
            label: "Delete",
            tone: "danger",
            onSelect: () => {
              if (pendingDeleteId) onDelete(pendingDeleteId);
              setPendingDeleteId(null);
            },
          },
        ]}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

export function TypesAdmin({
  userTypes,
  hiddenPresetIds,
  onCreate,
  onUpdate,
  onDelete,
  onSetPresetHidden,
}: {
  userTypes: EntryType[];
  hiddenPresetIds: string[];
  onCreate: (draft: Omit<EntryType, "id">) => EntryType;
  onUpdate: (id: string, patch: Partial<Omit<EntryType, "id">>) => void;
  onDelete: (id: string) => void;
  onSetPresetHidden: (presetId: string, hidden: boolean) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const hidden = new Set(hiddenPresetIds);
  const pendingDelete =
    pendingDeleteId !== null
      ? (userTypes.find((t) => t.id === pendingDeleteId) ?? null)
      : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        Built-in types cover typical Swedish household lines — rent, mortgage,
        electricity, A-kassa, SL/public transport. Hide the ones you don't need;
        add your own for anything else.
      </p>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded border border-line bg-surface-2">
        {PRESET_ENTRY_TYPES.map((t) => {
          const isHidden = hidden.has(t.id);
          return (
            <li
              key={t.id}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
            >
              <TypeChip type={t} compact />
              <span className="text-xs text-muted">Built-in</span>
              <button
                type="button"
                onClick={() => onSetPresetHidden(t.id, !isHidden)}
                aria-pressed={!isHidden}
                aria-label={isHidden ? "Show type" : "Hide type"}
                title={isHidden ? "Show in picker" : "Hide from picker"}
                className={`ml-auto inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line ${
                  isHidden
                    ? "bg-surface text-muted hover:text-fg"
                    : "bg-accent/10 text-accent hover:bg-accent/20"
                }`}
              >
                {isHidden ? (
                  <EyeOff size={14} aria-hidden focusable={false} />
                ) : (
                  <Eye size={14} aria-hidden focusable={false} />
                )}
              </button>
            </li>
          );
        })}
        {userTypes.map((t) => {
          if (editingId === t.id) {
            return (
              <li key={t.id} className="px-2 py-2">
                <TypeEditor
                  initial={t}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(draft) => {
                    onUpdate(t.id, draft);
                    setEditingId(null);
                  }}
                />
              </li>
            );
          }
          return (
            <li
              key={t.id}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
            >
              <TypeChip type={t} compact />
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingId(t.id)}
                  aria-label="Edit type"
                  title="Edit"
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                >
                  <Pencil size={13} aria-hidden focusable={false} />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(t.id)}
                  aria-label="Delete type"
                  title="Delete"
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-danger hover:text-danger"
                >
                  <Trash2 size={13} aria-hidden focusable={false} />
                </button>
              </div>
            </li>
          );
        })}
        {userTypes.length === 0 && hiddenPresetIds.length === 0 && (
          <li className="px-2 py-1.5 text-xs text-muted">
            Add your own types below for entries the built-in list doesn't
            cover.
          </li>
        )}
      </ul>
      {creating ? (
        <div className="rounded border border-line bg-surface-2 p-2">
          <TypeEditor
            initial={null}
            submitLabel="Add"
            onCancel={() => setCreating(false)}
            onSubmit={(draft) => {
              onCreate(draft);
              setCreating(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
        >
          <Plus size={14} aria-hidden focusable={false} />
          Add type
        </button>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete type"
        description={
          pendingDelete
            ? `Remove "${pendingDelete.name}"? Any rows labelled with it lose the chip; their description and category stay intact.`
            : null
        }
        actions={[
          {
            label: "Delete",
            tone: "danger",
            onSelect: () => {
              if (pendingDeleteId) onDelete(pendingDeleteId);
              setPendingDeleteId(null);
            },
          },
        ]}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

function CategoryEditor({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: Category | null;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: Omit<Category, "id">) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string>(
    initial?.color ?? CATEGORY_COLORS[0],
  );
  const [icon, setIcon] = useState<CategoryIcon>(initial?.icon ?? "tag");

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, color, icon });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        <span>Name</span>
        <input
          type="text"
          autoFocus
          className="field-input rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Bills"
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
        <span>Icon</span>
        <GlyphGrid
          icons={CATEGORY_GLYPH_NAMES}
          value={icon}
          onChange={setIcon}
          tintColor={color}
        />
      </div>
      <EditorButtons
        submitLabel={submitLabel}
        disabled={!name.trim()}
        onCancel={onCancel}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function TypeEditor({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: EntryType | null;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: Omit<EntryType, "id">) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string>(
    initial?.color ?? CATEGORY_COLORS[0],
  );
  const [glyph, setGlyph] = useState<CategoryIcon>(initial?.glyph ?? "tag");

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, color, glyph });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        <span>Name</span>
        <input
          type="text"
          autoFocus
          className="field-input rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Padel"
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
        <GlyphGrid
          icons={TYPE_GLYPH_NAMES}
          value={glyph}
          onChange={setGlyph}
          tintColor={color}
        />
      </div>
      <EditorButtons
        submitLabel={submitLabel}
        disabled={!name.trim()}
        onCancel={onCancel}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function EditorButtons({
  submitLabel,
  disabled,
  onCancel,
  onSubmit,
}: {
  submitLabel: string;
  disabled: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mt-1 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex cursor-pointer items-center gap-1 rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
      >
        <X size={12} aria-hidden focusable={false} />
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="inline-flex cursor-pointer items-center gap-1 rounded border border-accent bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Check size={12} aria-hidden focusable={false} />
        {submitLabel}
      </button>
    </div>
  );
}
