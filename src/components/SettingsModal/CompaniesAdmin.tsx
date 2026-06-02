import { useMemo, useRef, useState } from "react";
import { Building2, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";

import type {
  Category,
  Company,
  CompanyCategory,
  EntryType,
} from "../../data/types";
import {
  useCrudAdminState,
  useDesktopAutoFocus,
  useDragReorder,
} from "../../hooks";
import { useT } from "../../i18n";
import { arrayMove } from "../../utils/reorder";
import { CompanyCategoryPicker } from "../CompanyCategoryPicker";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button, ClearableInput } from "../form";
import { TypeChip, TypePicker } from "../TypePicker";

// Flat rename-list for `UserData.companies`. Add / edit / delete plus a
// per-company "associated types" sub-section — the user pins the types
// a company is typically paired with, drag-ordered by priority, which
// seed the company → type hints (see `computeCompanyTypeHints`).

type Props = {
  companies: readonly Company[];
  types: readonly EntryType[];
  categories: readonly Category[];
  companyCategories: readonly CompanyCategory[];
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  onUpdateCompany: (
    companyId: string,
    patch: Partial<Omit<Company, "id">>,
  ) => void;
  onDeleteCompany: (companyId: string) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompanyCategory: (
    draft: Omit<CompanyCategory, "id">,
  ) => CompanyCategory;
};

export function CompaniesAdmin({
  companies,
  types,
  categories,
  companyCategories,
  onCreateCompany,
  onUpdateCompany,
  onDeleteCompany,
  onCreateType,
  onCreateCategory,
  onCreateCompanyCategory,
}: Props) {
  const t = useT();
  const sorted = useMemo(
    () => [...companies].sort((a, b) => a.name.localeCompare(b.name)),
    [companies],
  );

  const {
    creating,
    setCreating,
    editingId,
    setEditingId,
    setPendingDeleteId,
    pendingDelete,
  } = useCrudAdminState(companies);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{t("settings.companiesTab.intro")}</p>
      {sorted.length === 0 && !creating && (
        <p className="rounded border border-line bg-surface-2 px-3 py-3 text-center text-xs text-muted">
          {t("settings.companiesTab.empty")}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {sorted.map((c) => {
          if (editingId === c.id) {
            return (
              <li
                key={c.id}
                className="rounded border border-line bg-surface-2 p-2"
              >
                <CompanyEditor
                  initial={c}
                  existing={companies}
                  types={types}
                  categories={categories}
                  companyCategories={companyCategories}
                  onCreateType={onCreateType}
                  onCreateCategory={onCreateCategory}
                  onCreateCompanyCategory={onCreateCompanyCategory}
                  submitLabel={t("common.save")}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(draft) => {
                    onUpdateCompany(c.id, draft);
                    setEditingId(null);
                  }}
                />
              </li>
            );
          }
          return (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
            >
              <Building2
                size={14}
                aria-hidden
                focusable={false}
                className="shrink-0 text-muted"
              />
              <span className="min-w-0 flex-1 truncate text-fg">{c.name}</span>
              <button
                type="button"
                onClick={() => setEditingId(c.id)}
                aria-label={t("settings.companiesTab.editCompany")}
                title={t("common.edit")}
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
              >
                <Pencil size={13} aria-hidden focusable={false} />
              </button>
              <button
                type="button"
                onClick={() => setPendingDeleteId(c.id)}
                aria-label={t("settings.companiesTab.deleteCompany")}
                title={t("common.delete")}
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-danger hover:text-danger"
              >
                <Trash2 size={13} aria-hidden focusable={false} />
              </button>
            </li>
          );
        })}
        {creating && (
          <li className="rounded border border-line bg-surface-2 p-2">
            <CompanyEditor
              initial={null}
              existing={companies}
              types={types}
              categories={categories}
              companyCategories={companyCategories}
              onCreateType={onCreateType}
              onCreateCategory={onCreateCategory}
              onCreateCompanyCategory={onCreateCompanyCategory}
              submitLabel={t("common.add")}
              onCancel={() => setCreating(false)}
              onSubmit={(draft) => {
                onCreateCompany(draft);
                setCreating(false);
              }}
            />
          </li>
        )}
      </ul>
      {!creating && (
        <Button
          variant="secondary"
          withIcon
          onClick={() => setCreating(true)}
          className="self-start"
        >
          <Plus size={14} aria-hidden focusable={false} />
          {t("settings.companiesTab.addCompany")}
        </Button>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("settings.companiesTab.deleteCompanyTitle")}
        description={t("settings.companiesTab.deleteCompanyHint", {
          name: pendingDelete?.name ?? "",
        })}
        actions={[
          {
            label: t("common.delete"),
            tone: "danger",
            onSelect: () => {
              if (pendingDelete) onDeleteCompany(pendingDelete.id);
              setPendingDeleteId(null);
            },
          },
        ]}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

export function CompanyEditor({
  initial,
  existing,
  types,
  categories,
  companyCategories,
  onCreateType,
  onCreateCategory,
  onCreateCompanyCategory,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: Company | null;
  existing: readonly Company[];
  types: readonly EntryType[];
  categories: readonly Category[];
  companyCategories: readonly CompanyCategory[];
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompanyCategory: (
    draft: Omit<CompanyCategory, "id">,
  ) => CompanyCategory;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: Omit<Company, "id">) => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [companyCategoryId, setCompanyCategoryId] = useState<string | null>(
    initial?.companyCategoryId ?? null,
  );
  const [typeIds, setTypeIds] = useState<string[]>(() =>
    initial?.typeIds ? [...initial.typeIds] : [],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(inputRef, true);
  const trimmed = name.trim();
  const duplicate = existing.some(
    (c) =>
      c.id !== initial?.id &&
      c.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const canSubmit = trimmed.length > 0 && !duplicate;

  const typesById = useMemo(
    () => new Map(types.map((ty) => [ty.id, ty])),
    [types],
  );
  // Resolve to EntryType objects, dropping any id whose type was
  // deleted while the editor is open.
  const selectedTypes = useMemo(
    () =>
      typeIds
        .map((id) => typesById.get(id))
        .filter((ty): ty is EntryType => ty !== undefined),
    [typeIds, typesById],
  );

  const reorder = useDragReorder({
    onReorder: (fromId, toId) =>
      setTypeIds((ids) => {
        const from = ids.indexOf(fromId);
        const to = ids.indexOf(toId);
        return [...arrayMove(ids, from, to)];
      }),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          name: trimmed,
          ...(typeIds.length > 0 ? { typeIds } : {}),
          ...(companyCategoryId ? { companyCategoryId } : {}),
        });
      }}
      className="flex flex-col gap-2"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">
          {t("settings.companiesTab.name")}
        </span>
        <ClearableInput
          ref={inputRef}
          value={name}
          onValueChange={setName}
          placeholder={t("settings.companiesTab.namePlaceholder")}
          className="field-input w-full min-w-0 rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
        />
        {duplicate && (
          <span className="text-xs text-danger">
            {t("settings.companiesTab.duplicateName")}
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">
          {t("settings.companiesTab.companyCategoryLabel")}
        </span>
        <CompanyCategoryPicker
          variant="field"
          companyCategories={companyCategories}
          selectedId={companyCategoryId}
          onSelect={setCompanyCategoryId}
          onCreate={onCreateCompanyCategory}
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">
          {t("settings.companiesTab.typesLabel")}
        </span>
        {selectedTypes.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {selectedTypes.map((ty) => (
              <li
                key={ty.id}
                {...reorder.getItemProps(ty.id)}
                className={`flex cursor-grab items-center gap-1 rounded-full border bg-surface py-0.5 pr-1 pl-1.5 select-none active:cursor-grabbing ${
                  reorder.overId === ty.id ? "border-accent" : "border-line"
                } ${reorder.draggingId === ty.id ? "opacity-50" : ""}`}
              >
                <GripVertical
                  size={12}
                  className="shrink-0 text-muted"
                  aria-hidden
                  focusable={false}
                />
                <TypeChip type={ty} compact />
                <button
                  type="button"
                  draggable={false}
                  onClick={() =>
                    setTypeIds((ids) => ids.filter((id) => id !== ty.id))
                  }
                  aria-label={t("settings.companiesTab.removeType")}
                  className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <X size={12} aria-hidden focusable={false} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <TypePicker
          variant="field"
          types={types}
          categories={categories}
          selectedId={null}
          placeholder={t("settings.companiesTab.addType")}
          onSelect={(id) => {
            if (id === null) return;
            setTypeIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
          }}
          onCreate={onCreateType}
          onCreateCategory={onCreateCategory}
        />
        <span className="text-xs text-muted">
          {t("settings.companiesTab.typesHint")}
        </span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" type="submit" disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
