import { type ReactNode, useMemo, useRef, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Minus,
  Package,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import {
  CATEGORY_COLORS,
  CATEGORY_GLYPH_NAMES,
  TYPE_GLYPH_NAMES,
} from "../../data/constants/taxonomy";
import {
  DEFAULT_CATEGORY_ID,
  PRESET_CATEGORIES,
  PRESET_CATEGORY_IDS,
} from "../../data/presets/categories";
import {
  effectivePresetKind,
  PRESET_ENTRY_TYPES,
  PRESET_ENTRY_TYPE_IDS,
} from "../../data/presets/types";
import type {
  Category,
  CategoryIcon,
  EntryType,
  EntryTypeKind,
} from "../../data/types";
import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { displayCategoryName } from "../../i18n/preset-names";
import { CategoryChip, CategoryCreator } from "../CategoryPicker";
import { ColorPalette } from "../ColorPalette";
import { ConfirmDialog } from "../ConfirmDialog";
import { FloatingPanel } from "../FloatingPanel";
import { ClearableInput } from "../form";
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
  presetTypeKindOverrides: Record<string, EntryTypeKind>;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onUpdateCategory: (id: string, patch: Partial<Omit<Category, "id">>) => void;
  onDeleteCategory: (id: string) => void;
  onSetPresetCategoryHidden: (presetId: string, hidden: boolean) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onUpdateType: (id: string, patch: Partial<Omit<EntryType, "id">>) => void;
  onDeleteType: (id: string) => void;
  onSetPresetTypeHidden: (presetId: string, hidden: boolean) => void;
  onSetPresetTypeKind: (presetId: string, kind: EntryTypeKind) => void;
};

export function CategoriesAndTypesAdmin({
  userCategories,
  userTypes,
  hiddenPresetCategoryIds,
  hiddenPresetTypeIds,
  presetTypeKindOverrides,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onSetPresetCategoryHidden,
  onCreateType,
  onUpdateType,
  onDeleteType,
  onSetPresetTypeHidden,
  onSetPresetTypeKind,
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
                  submitLabel={t("common.save")}
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
                  <span
                    className="inline-flex items-center text-muted"
                    aria-label={t("settings.categoriesTab.builtIn")}
                    title={t("settings.categoriesTab.builtIn")}
                  >
                    <Package size={12} aria-hidden focusable={false} />
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
                      title={t("common.edit")}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                    >
                      <Pencil size={13} aria-hidden focusable={false} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteCategoryId(cat.id)}
                      aria-label={t("settings.categoriesTab.deleteCategory")}
                      title={t("common.delete")}
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
                  presetTypeKindOverrides={presetTypeKindOverrides}
                  allCategories={allCategories}
                  onCreate={onCreateType}
                  onCreateCategory={onCreateCategory}
                  onUpdate={onUpdateType}
                  onDelete={onDeleteType}
                  onSetPresetHidden={onSetPresetTypeHidden}
                  onSetPresetKind={onSetPresetTypeKind}
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
            submitLabel={t("common.add")}
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
            label: t("common.delete"),
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
  presetTypeKindOverrides,
  allCategories,
  onCreate,
  onCreateCategory,
  onUpdate,
  onDelete,
  onSetPresetHidden,
  onSetPresetKind,
}: {
  category: Category;
  types: EntryType[];
  hiddenPresetTypeIds: ReadonlySet<string>;
  presetTypeKindOverrides: Record<string, EntryTypeKind>;
  allCategories: readonly Category[];
  onCreate: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onUpdate: (id: string, patch: Partial<Omit<EntryType, "id">>) => void;
  onDelete: (id: string) => void;
  onSetPresetHidden: (presetId: string, hidden: boolean) => void;
  onSetPresetKind: (presetId: string, kind: EntryTypeKind) => void;
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
    <div className="flex flex-col gap-2 border-t border-line bg-surface-3 p-2 sm:pl-8">
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
                    onCreateCategory={onCreateCategory}
                    submitLabel={t("common.save")}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(draft) => {
                      onUpdate(ty.id, draft);
                      setEditingId(null);
                    }}
                  />
                </li>
              );
            }
            const effectiveKind: EntryTypeKind = isPreset
              ? effectivePresetKind(ty, presetTypeKindOverrides)
              : (ty.kind ?? "any");
            return (
              <li
                key={ty.id}
                className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm"
              >
                <TypeChip type={ty} compact />
                {isPreset && (
                  <span
                    className="inline-flex items-center text-muted"
                    aria-label={t("settings.categoriesTab.builtIn")}
                    title={t("settings.categoriesTab.builtIn")}
                  >
                    <Package size={12} aria-hidden focusable={false} />
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <KindToggle
                    value={effectiveKind}
                    onChange={(next) => {
                      if (isPreset) onSetPresetKind(ty.id, next);
                      else
                        onUpdate(ty.id, {
                          kind: next === "any" ? undefined : next,
                        });
                    }}
                  />
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
                        title={t("common.edit")}
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                      >
                        <Pencil size={13} aria-hidden focusable={false} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(ty.id)}
                        aria-label={t("settings.categoriesTab.deleteType")}
                        title={t("common.delete")}
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
            onCreateCategory={onCreateCategory}
            submitLabel={t("common.add")}
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
            label: t("common.delete"),
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
  return (
    <EntityForm
      initial={initial}
      glyphNames={CATEGORY_GLYPH_NAMES}
      namePlaceholder={t("settings.categoriesTab.categoryNamePlaceholder")}
      iconLabel={t("settings.categoriesTab.icon")}
      submitLabel={submitLabel}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );
}

function TypeEditor({
  initial,
  initialCategoryId,
  categories,
  onCreateCategory,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: EntryType | null;
  initialCategoryId?: string;
  categories: readonly Category[];
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: Omit<EntryType, "id">) => void;
}) {
  const t = useT();
  const [categoryId, setCategoryId] = useState<string>(
    initial?.categoryId ?? initialCategoryId ?? DEFAULT_CATEGORY_ID,
  );
  const [kind, setKind] = useState<EntryTypeKind>(initial?.kind ?? "any");

  return (
    <EntityForm
      initial={
        initial
          ? { name: initial.name, color: initial.color, icon: initial.glyph }
          : null
      }
      glyphNames={TYPE_GLYPH_NAMES}
      namePlaceholder={t("settings.categoriesTab.typeNamePlaceholder")}
      iconLabel={t("type.glyph")}
      submitLabel={submitLabel}
      onCancel={onCancel}
      onSubmit={({ name, color, icon }) =>
        onSubmit({
          name,
          color,
          glyph: icon,
          categoryId,
          ...(kind === "any" ? {} : { kind }),
        })
      }
    >
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>{t("type.category")}</span>
        <CategoryDropdown
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          onCreate={onCreateCategory}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>{t("settings.categoriesTab.kind")}</span>
        <KindToggle value={kind} onChange={setKind} expanded />
        <span className="text-xs text-muted">
          {t("settings.categoriesTab.kindHint")}
        </span>
      </div>
    </EntityForm>
  );
}

// Shared form chrome for the category and type editors. Both share a
// "name + colour + icon" trio with EditorButtons; the type editor
// inserts a category dropdown and kind toggle between the name and
// colour fields via `children`. New preset admins (loan types, savings
// goals, …) compose around this same trio rather than duplicating the
// field-state plumbing.
function EntityForm({
  initial,
  glyphNames,
  namePlaceholder,
  iconLabel,
  submitLabel,
  onCancel,
  onSubmit,
  children,
}: {
  initial: { name?: string; color?: string; icon?: CategoryIcon } | null;
  glyphNames: readonly CategoryIcon[];
  namePlaceholder: string;
  iconLabel: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: {
    name: string;
    color: string;
    icon: CategoryIcon;
  }) => void;
  children?: ReactNode;
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
        <ClearableInput
          // Dedicated single-purpose editor — landing focus on the
          // name field is the expected UX in this modal context.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="field-input w-full min-w-0 rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
          value={name}
          onValueChange={setName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={namePlaceholder}
        />
      </label>
      {children}
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
        <span>{iconLabel}</span>
        <GlyphGrid
          icons={glyphNames}
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

// Three-way segmented control for the income/expense filter. Renders
// compactly (icon-only) in list rows and expanded (icon + label) when
// hosted inside the type editor where there's room. Mirrors the
// "Always use custom dropdowns" rule — no native <select>.
function KindToggle({
  value,
  onChange,
  expanded = false,
}: {
  value: EntryTypeKind;
  onChange: (next: EntryTypeKind) => void;
  expanded?: boolean;
}) {
  const t = useT();
  const options: Array<{
    kind: EntryTypeKind;
    icon: typeof Minus;
    label: string;
    short: string;
    title: string;
  }> = [
    {
      kind: "income",
      icon: ArrowUpCircle,
      label: t("settings.categoriesTab.kindIncome"),
      short: t("settings.categoriesTab.kindIncomeShort"),
      title: t("settings.categoriesTab.kindIncomeTitle"),
    },
    {
      kind: "any",
      icon: Minus,
      label: t("settings.categoriesTab.kindAny"),
      short: t("settings.categoriesTab.kindAnyShort"),
      title: t("settings.categoriesTab.kindAnyTitle"),
    },
    {
      kind: "expense",
      icon: ArrowDownCircle,
      label: t("settings.categoriesTab.kindExpense"),
      short: t("settings.categoriesTab.kindExpenseShort"),
      title: t("settings.categoriesTab.kindExpenseTitle"),
    },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t("settings.categoriesTab.kind")}
      className="inline-flex shrink-0 overflow-hidden rounded border border-line"
    >
      {options.map((opt) => {
        const selected = value === opt.kind;
        const Icon = opt.icon;
        return (
          <button
            key={opt.kind}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.kind)}
            title={opt.title}
            className={`inline-flex h-7 cursor-pointer items-center gap-1 border-0 ${
              expanded ? "px-2 text-xs" : "w-7 justify-center"
            } ${
              selected
                ? "bg-accent/15 text-accent"
                : "bg-surface text-muted hover:bg-surface-3 hover:text-fg"
            }`}
          >
            <Icon size={13} aria-hidden focusable={false} />
            {expanded && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Same-width-as-trigger dropdown anchored to the left edge. Routed
// through `FloatingPanel` (not an inline `absolute` div) because this
// dropdown lives inside the SettingsModal, whose z-50 stacking context
// would otherwise cap the menu's z-index against the dismiss backdrop
// and swallow every tap on a category option.
const CATEGORY_DROPDOWN_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "left",
  coordinateSpace: "viewport",
};

// Compact custom dropdown for picking a category inside the type
// editor. Avoids the native `<select>` so the editor stays in the
// project's monospaced look (see the "Always use custom dropdowns"
// rule in CLAUDE.md).
function CategoryDropdown({
  categories,
  value,
  onChange,
  onCreate,
}: {
  categories: readonly Category[];
  value: string;
  onChange: (id: string) => void;
  // Optional. When provided, the dropdown appends a "New category"
  // footer row that opens the shared category-creator modal; the new
  // category becomes the selected value once it lands in the store.
  onCreate?: (draft: Omit<Category, "id">) => Category;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const selected = categories.find((c) => c.id === value) ?? null;
  return (
    <div ref={triggerRef} className="relative">
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
      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={CATEGORY_DROPDOWN_PLACEMENT}
      >
        <ul role="listbox" className="max-h-60 overflow-auto py-1">
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
          {onCreate && (
            <li className="mt-1 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCreating(true);
                }}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-2 py-2 text-left text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <Plus size={14} aria-hidden focusable={false} />
                {t("category.newCategory")}
              </button>
            </li>
          )}
        </ul>
      </FloatingPanel>
      {creating && onCreate && (
        <CategoryCreator
          onCancel={() => setCreating(false)}
          onSubmit={(draft) => {
            const created = onCreate(draft);
            onChange(created.id);
            setCreating(false);
          }}
        />
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
        {t("common.cancel")}
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
