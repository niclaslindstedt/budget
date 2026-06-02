import { useMemo, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Package,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import {
  COMPANY_CATEGORY_GLYPH_NAMES,
  CATEGORY_COLORS,
} from "../../data/constants/taxonomy";
import {
  PRESET_COMPANY_CATEGORIES,
  PRESET_COMPANY_CATEGORY_IDS,
} from "../../data/presets/company-categories";
import type { CategoryIcon, CompanyCategory } from "../../data/types";
import { useCrudAdminState } from "../../hooks";
import { useT } from "../../i18n";
import { ColorPalette } from "../ColorPalette";
import { CompanyCategoryChip } from "../CompanyCategoryPicker";
import { ConfirmDialog } from "../ConfirmDialog";
import { ClearableInput } from "../form";
import { GlyphGrid } from "../GlyphGrid";

// Flat admin list for company categories. Built-in presets render first
// with a hide-toggle; user-added entries get full edit / delete. Mirrors
// the affordances in the unified categories/types admin (`admin.tsx`),
// minus the nested type sections — company categories are a single
// flat tier.

type Props = {
  companyCategories: CompanyCategory[];
  hiddenPresetCompanyCategoryIds: string[];
  onCreateCompanyCategory: (
    draft: Omit<CompanyCategory, "id">,
  ) => CompanyCategory;
  onUpdateCompanyCategory: (
    id: string,
    patch: Partial<Omit<CompanyCategory, "id">>,
  ) => void;
  onDeleteCompanyCategory: (id: string) => void;
  onSetPresetCompanyCategoryHidden: (presetId: string, hidden: boolean) => void;
};

export function CompanyCategoriesAdmin({
  companyCategories,
  hiddenPresetCompanyCategoryIds,
  onCreateCompanyCategory,
  onUpdateCompanyCategory,
  onDeleteCompanyCategory,
  onSetPresetCompanyCategoryHidden,
}: Props) {
  const t = useT();
  const hidden = useMemo(
    () => new Set(hiddenPresetCompanyCategoryIds),
    [hiddenPresetCompanyCategoryIds],
  );
  const all = useMemo<CompanyCategory[]>(
    () => [...PRESET_COMPANY_CATEGORIES, ...companyCategories],
    [companyCategories],
  );

  const {
    creating,
    setCreating,
    editingId,
    setEditingId,
    pendingDeleteId,
    setPendingDeleteId,
    pendingDelete,
  } = useCrudAdminState(companyCategories);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        {t("settings.companiesTab.companyCategoriesIntro")}
      </p>
      <ul className="flex flex-col gap-2">
        {all.map((cat) => {
          const isPreset = PRESET_COMPANY_CATEGORY_IDS.has(cat.id);
          const isHidden = isPreset && hidden.has(cat.id);
          if (editingId === cat.id) {
            return (
              <li
                key={cat.id}
                className="rounded border border-line bg-surface-2 p-2"
              >
                <CompanyCategoryEditor
                  initial={cat}
                  submitLabel={t("common.save")}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(draft) => {
                    onUpdateCompanyCategory(cat.id, draft);
                    setEditingId(null);
                  }}
                />
              </li>
            );
          }
          return (
            <li
              key={cat.id}
              className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
            >
              <CompanyCategoryChip companyCategory={cat} compact />
              {isPreset && (
                <span
                  className="inline-flex items-center text-muted"
                  aria-label={t("settings.companiesTab.builtIn")}
                  title={t("settings.companiesTab.builtIn")}
                >
                  <Package size={12} aria-hidden focusable={false} />
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                {isPreset ? (
                  <button
                    type="button"
                    onClick={() =>
                      onSetPresetCompanyCategoryHidden(cat.id, !isHidden)
                    }
                    aria-pressed={!isHidden}
                    aria-label={
                      isHidden
                        ? t("settings.companiesTab.showCompanyCategory")
                        : t("settings.companiesTab.hideCompanyCategory")
                    }
                    title={
                      isHidden
                        ? t("settings.companiesTab.showInPicker")
                        : t("settings.companiesTab.hideFromPicker")
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
                      onClick={() => setEditingId(cat.id)}
                      aria-label={t(
                        "settings.companiesTab.editCompanyCategory",
                      )}
                      title={t("common.edit")}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                    >
                      <Pencil size={13} aria-hidden focusable={false} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(cat.id)}
                      aria-label={t(
                        "settings.companiesTab.deleteCompanyCategory",
                      )}
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
      {creating ? (
        <div className="rounded border border-line bg-surface-2 p-2">
          <CompanyCategoryEditor
            initial={null}
            submitLabel={t("common.add")}
            onCancel={() => setCreating(false)}
            onSubmit={(draft) => {
              onCreateCompanyCategory(draft);
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
          {t("settings.companiesTab.addCompanyCategory")}
        </button>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("settings.companiesTab.deleteCompanyCategoryTitle")}
        description={
          pendingDelete
            ? t("settings.companiesTab.deleteCompanyCategoryHint", {
                name: pendingDelete.name,
              })
            : null
        }
        actions={[
          {
            label: t("common.delete"),
            tone: "danger",
            onSelect: () => {
              if (pendingDeleteId) onDeleteCompanyCategory(pendingDeleteId);
              setPendingDeleteId(null);
            },
          },
        ]}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

// Inline name + color + glyph editor for user-added company categories.
// Built-in presets are immutable, so this only ever edits / creates
// user entries.
function CompanyCategoryEditor({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: CompanyCategory | null;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: Omit<CompanyCategory, "id">) => void;
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
        <span>{t("settings.companiesTab.name")}</span>
        <ClearableInput
          // Dedicated single-purpose editor — landing focus on the name
          // field is the expected UX in this modal context.
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
          placeholder={t(
            "settings.companiesTab.companyCategoryNamePlaceholder",
          )}
        />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>{t("settings.companiesTab.color")}</span>
        <ColorPalette
          colors={CATEGORY_COLORS}
          value={color}
          onChange={setColor}
          size={5}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>{t("settings.companiesTab.icon")}</span>
        <GlyphGrid
          icons={COMPANY_CATEGORY_GLYPH_NAMES}
          value={icon}
          onChange={setIcon}
          tintColor={color}
        />
      </div>
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
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="inline-flex cursor-pointer items-center gap-1 rounded border border-accent bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check size={12} aria-hidden focusable={false} />
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
