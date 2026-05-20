import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import {
  CATEGORY_COLORS,
  CATEGORY_GLYPH_NAMES,
  DEFAULT_CATEGORY_ID,
  PRESET_CATEGORIES,
  PRESET_CATEGORY_IDS,
  PRESET_ENTRY_TYPES,
  PRESET_ENTRY_TYPE_IDS,
  TYPE_GLYPH_NAMES,
} from "../../data/constants";
import type { Category, CategoryIcon, EntryType } from "../../data/types";
import { useT } from "../../i18n";
import { displayCategoryName } from "../../i18n/preset-names";
import { CategoryChip } from "../CategoryPicker";
import { ColorPalette } from "../ColorPalette";
import { ConfirmDialog } from "../ConfirmDialog";
import { GlyphGrid } from "../GlyphGrid";
import { TypeChip } from "../TypePicker";

// Unified categories + types admin. Categories are the top-level
// list; each one expands to its child types (built-in + user-added).
// Adding a type happens from inside a category section so the
// parent assignment is part of the create flow. Hide-toggles cover
// preset categories and types; user-added entries get full
// edit/delete affordances.

type Props = {
  userCategories: Category[];
  userTypes: EntryType[];
  hiddenPresetCategoryIds: string[];
  hiddenPresetTypeIds: string[];
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onUpdateCategory: (id: string, patch: Partial<Omit<Category, "id">>) => void;
  onDeleteCategory: (id: string) => void;
  onSetPresetCategoryHidden: (presetId: string, hidden: boolean) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onUpdateType: (id: string, patch: Partial<Omit<EntryType, "id">>) => void;
  onDeleteType: (id: string) => void;
  onSetPresetTypeHidden: (presetId: string, hidden: boolean) => void;
};

export function CategoriesAndTypesAdmin({
  userCategories,
  userTypes,
  hiddenPresetCategoryIds,
  hiddenPresetTypeIds,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onSetPresetCategoryHidden,
  onCreateType,
  onUpdateType,
  onDeleteType,
  onSetPresetTypeHidden,
}: Props) {
  const t = useT();
  const hiddenCats = useMemo(
    () => new Set(hiddenPresetCategoryIds),
    [hiddenPresetCategoryIds],
  );
  const hiddenTypes = useMemo(
    () => new Set(hiddenPresetTypeIds),
    [hiddenPresetTypeIds],
  );

  // Combined category list: presets first, then user-added. Each
  // section renders independently so a long list can be collapsed
  // section-by-section.
  const allCategories = useMemo<Category[]>(
    () => [...PRESET_CATEGORIES, ...userCategories],
    [userCategories],
  );

  // Index types by category for quick lookup inside the per-category
  // sections. Both preset and user types share the same map.
  const typesByCategory = useMemo(() => {
    const m = new Map<string, EntryType[]>();
    for (const t of PRESET_ENTRY_TYPES) {
      const list = m.get(t.categoryId) ?? [];
      list.push(t);
      m.set(t.categoryId, list);
    }
    for (const t of userTypes) {
      const list = m.get(t.categoryId) ?? [];
      list.push(t);
      m.set(t.categoryId, list);
    }
    return m;
  }, [userTypes]);

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(allCategories.map((c) => c.id)),
  );
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [pendingDeleteCategoryId, setPendingDeleteCategoryId] = useState<
    string | null
  >(null);
  const pendingDeleteCategory =
    pendingDeleteCategoryId !== null
      ? (userCategories.find((c) => c.id === pendingDeleteCategoryId) ?? null)
      : null;

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{t("settings.categoriesTab.intro")}</p>
      <ul className="flex flex-col gap-2">
        {allCategories.map((cat) => {
          const isPreset = PRESET_CATEGORY_IDS.has(cat.id);
          const isHidden = isPreset && hiddenCats.has(cat.id);
          const isOpen = expanded.has(cat.id);
          const childTypes = typesByCategory.get(cat.id) ?? [];
          if (editingCategoryId === cat.id) {
            return (
              <li
                key={cat.id}
                className="rounded border border-line bg-surface-2 p-2"
              >
                <CategoryEditor
                  initial={cat}
                  submitLabel={t("settings.categoriesTab.saveSubmit")}
                  onCancel={() => setEditingCategoryId(null)}
                  onSubmit={(draft) => {
                    onUpdateCategory(cat.id, draft);
                    setEditingCategoryId(null);
                  }}
                />
              </li>
            );
          }
          return (
            <li
              key={cat.id}
              className="overflow-hidden rounded border border-line bg-surface-2"
            >
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <button
                  type="button"
                  onClick={() => toggleExpanded(cat.id)}
                  aria-expanded={isOpen}
                  aria-label={
                    isOpen
                      ? t("settings.categoriesTab.collapseCategory")
                      : t("settings.categoriesTab.expandCategory")
                  }
                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-fg"
                >
                  {isOpen ? (
                    <ChevronDown size={14} aria-hidden focusable={false} />
                  ) : (
                    <ChevronRight size={14} aria-hidden focusable={false} />
                  )}
                </button>
                <CategoryChip category={cat} compact />
                {isPreset && (
                  <span className="text-xs text-muted">
                    {t("settings.categoriesTab.builtIn")}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted">
                  {childTypes.length === 0
                    ? t("settings.categoriesTab.noTypesShort")
                    : childTypes.length === 1
                      ? t("settings.categoriesTab.typeCountOne")
                      : t("settings.categoriesTab.typeCountOther", {
                          n: childTypes.length,
                        })}
                </span>
                {isPreset ? (
                  <button
                    type="button"
                    onClick={() => onSetPresetCategoryHidden(cat.id, !isHidden)}
                    aria-pressed={!isHidden}
                    aria-label={
                      isHidden
                        ? t("settings.categoriesTab.showCategory")
                        : t("settings.categoriesTab.hideCategory")
                    }
                    title={
                      isHidden
                        ? t("settings.categoriesTab.showInPicker")
                        : t("settings.categoriesTab.hideFromPicker")
                    }
                    className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line ${
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
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingCategoryId(cat.id)}
                      aria-label={t("settings.categoriesTab.editCategory")}
                      title={t("settings.categoriesTab.editLabel")}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                    >
                      <Pencil size={13} aria-hidden focusable={false} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteCategoryId(cat.id)}
                      aria-label={t("settings.categoriesTab.deleteCategory")}
                      title={t("settings.categoriesTab.deleteLabel")}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-danger hover:text-danger"
                    >
                      <Trash2 size={13} aria-hidden focusable={false} />
                    </button>
                  </div>
                )}
              </div>
              {isOpen && (
                <TypesSection
                  category={cat}
                  types={childTypes}
                  hiddenPresetTypeIds={hiddenTypes}
                  allCategories={allCategories}
                  onCreate={onCreateType}
                  onUpdate={onUpdateType}
                  onDelete={onDeleteType}
                  onSetPresetHidden={onSetPresetTypeHidden}
                />
              )}
            </li>
          );
        })}
      </ul>
      {creatingCategory ? (
        <div className="rounded border border-line bg-surface-2 p-2">
          <CategoryEditor
            initial={null}
            submitLabel={t("settings.categoriesTab.addSubmit")}
            onCancel={() => setCreatingCategory(false)}
            onSubmit={(draft) => {
              onCreateCategory(draft);
              setCreatingCategory(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreatingCategory(true)}
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
        >
          <Plus size={14} aria-hidden focusable={false} />
          {t("settings.categoriesTab.addCategory")}
        </button>
      )}
      <ConfirmDialog
        open={pendingDeleteCategory !== null}
        title={t("settings.categoriesTab.deleteCategoryTitle")}
        description={
          pendingDeleteCategory
            ? t("settings.categoriesTab.deleteCategoryHint", {
                name: pendingDeleteCategory.name,
              })
            : null
        }
        actions={[
          {
            label: t("settings.categoriesTab.deleteLabel"),
            tone: "danger",
            onSelect: () => {
              if (pendingDeleteCategoryId) {
                onDeleteCategory(pendingDeleteCategoryId);
              }
              setPendingDeleteCategoryId(null);
            },
          },
        ]}
        onCancel={() => setPendingDeleteCategoryId(null)}
      />
    </div>
  );
}

// Per-category type list. Built-in types get a hide-toggle; user
// types get edit / delete. An "Add type" button at the bottom mints
// a new EntryType inside this category.
function TypesSection({
  category,
  types,
  hiddenPresetTypeIds,
  allCategories,
  onCreate,
  onUpdate,
  onDelete,
  onSetPresetHidden,
}: {
  category: Category;
  types: EntryType[];
  hiddenPresetTypeIds: ReadonlySet<string>;
  allCategories: readonly Category[];
  onCreate: (draft: Omit<EntryType, "id">) => EntryType;
  onUpdate: (id: string, patch: Partial<Omit<EntryType, "id">>) => void;
  onDelete: (id: string) => void;
  onSetPresetHidden: (presetId: string, hidden: boolean) => void;
}) {
  const t = useT();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDelete =
    pendingDeleteId !== null
      ? (types.find((ty) => ty.id === pendingDeleteId) ?? null)
      : null;

  return (
    <div className="flex flex-col gap-2 border-t border-line bg-surface-3 p-2 pl-8">
      {types.length === 0 ? (
        <p className="text-xs text-muted">
          {t("settings.categoriesTab.noTypesYet")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded border border-line bg-surface-2">
          {types.map((ty) => {
            const isPreset = PRESET_ENTRY_TYPE_IDS.has(ty.id);
            const isHidden = isPreset && hiddenPresetTypeIds.has(ty.id);
            if (editingId === ty.id) {
              return (
                <li key={ty.id} className="px-2 py-2">
                  <TypeEditor
                    initial={ty}
                    categories={allCategories}
                    submitLabel={t("settings.categoriesTab.saveSubmit")}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(draft) => {
                      onUpdate(ty.id, draft);
                      setEditingId(null);
                    }}
                  />
                </li>
              );
            }
            return (
              <li
                key={ty.id}
                className="flex items-center gap-2 px-2 py-1.5 text-sm"
              >
                <TypeChip type={ty} compact />
                {isPreset && (
                  <span className="text-xs text-muted">
                    {t("settings.categoriesTab.builtIn")}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  {isPreset ? (
                    <button
                      type="button"
                      onClick={() => onSetPresetHidden(ty.id, !isHidden)}
                      aria-pressed={!isHidden}
                      aria-label={
                        isHidden
                          ? t("settings.categoriesTab.showType")
                          : t("settings.categoriesTab.hideType")
                      }
                      title={
                        isHidden
                          ? t("settings.categoriesTab.showInPicker")
                          : t("settings.categoriesTab.hideFromPicker")
                      }
                      className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line ${
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
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingId(ty.id)}
                        aria-label={t("settings.categoriesTab.editType")}
                        title={t("settings.categoriesTab.editLabel")}
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                      >
                        <Pencil size={13} aria-hidden focusable={false} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(ty.id)}
                        aria-label={t("settings.categoriesTab.deleteType")}
                        title={t("settings.categoriesTab.deleteLabel")}
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-danger hover:text-danger"
                      >
                        <Trash2 size={13} aria-hidden focusable={false} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {creating ? (
        <div className="rounded border border-line bg-surface-2 p-2">
          <TypeEditor
            initial={null}
            initialCategoryId={category.id}
            categories={allCategories}
            submitLabel={t("settings.categoriesTab.addSubmit")}
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
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-2 px-3 py-1.5 text-xs text-fg hover:border-accent hover:text-accent"
        >
          <Plus size={12} aria-hidden focusable={false} />
          {t("settings.categoriesTab.addTypeTo", {
            name: displayCategoryName(category, t),
          })}
        </button>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("settings.categoriesTab.deleteTypeTitle")}
        description={
          pendingDelete
            ? t("settings.categoriesTab.deleteTypeHint", {
                name: pendingDelete.name,
              })
            : null
        }
        actions={[
          {
            label: t("settings.categoriesTab.deleteLabel"),
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
  const t = useT();
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
        <span>{t("settings.categoriesTab.name")}</span>
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
          placeholder={t("settings.categoriesTab.categoryNamePlaceholder")}
        />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>{t("settings.categoriesTab.color")}</span>
        <ColorPalette
          colors={CATEGORY_COLORS}
          value={color}
          onChange={setColor}
          size={5}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>{t("settings.categoriesTab.icon")}</span>
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
  initialCategoryId,
  categories,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: EntryType | null;
  initialCategoryId?: string;
  categories: readonly Category[];
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: Omit<EntryType, "id">) => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string>(
    initial?.color ?? CATEGORY_COLORS[0],
  );
  const [glyph, setGlyph] = useState<CategoryIcon>(initial?.glyph ?? "tag");
  const [categoryId, setCategoryId] = useState<string>(
    initial?.categoryId ?? initialCategoryId ?? DEFAULT_CATEGORY_ID,
  );

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, color, glyph, categoryId });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        <span>{t("settings.categoriesTab.name")}</span>
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
          placeholder={t("settings.categoriesTab.typeNamePlaceholder")}
        />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>{t("type.category")}</span>
        <CategoryDropdown
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>{t("settings.categoriesTab.color")}</span>
        <ColorPalette
          colors={CATEGORY_COLORS}
          value={color}
          onChange={setColor}
          size={5}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>{t("type.glyph")}</span>
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

// Compact custom dropdown for picking a category inside the type
// editor. Avoids the native `<select>` so the editor stays in the
// project's monospaced look (see the "Always use custom dropdowns"
// rule in CLAUDE.md).
function CategoryDropdown({
  categories,
  value,
  onChange,
}: {
  categories: readonly Category[];
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === value) ?? null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1 text-left text-sm hover:border-accent focus-visible:outline-none"
      >
        {selected ? (
          <CategoryChip category={selected} compact />
        ) : (
          <span className="text-muted">
            {t("settings.categoriesTab.pickCategoryEllipsis")}
          </span>
        )}
        <ChevronDown
          size={12}
          className="ml-auto shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded border border-line bg-surface-2 py-1 shadow-lg"
        >
          {categories.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={c.id === value}
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-2 py-1 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <CategoryChip category={c} compact />
                {c.id === value && (
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
        </ul>
      )}
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
  const t = useT();
  return (
    <div className="mt-1 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex cursor-pointer items-center gap-1 rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
      >
        <X size={12} aria-hidden focusable={false} />
        {t("settings.categoriesTab.cancelSubmit")}
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
