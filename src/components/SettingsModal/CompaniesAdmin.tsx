import { useMemo, useRef, useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";

import type { Company } from "../../data/types";
import { useDesktopAutoFocus } from "../../hooks";
import { useT } from "../../i18n";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button, ClearableInput } from "../form";

// Flat rename-list for `UserData.companies`. Add / edit / delete are
// all the affordances the Companies tab needs today — no presets to
// hide, no per-company analysis surface. Matches the shape of
// `CategoriesAndTypesAdmin` minus the per-row picker chrome.

type Props = {
  companies: readonly Company[];
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  onUpdateCompany: (
    companyId: string,
    patch: Partial<Omit<Company, "id">>,
  ) => void;
  onDeleteCompany: (companyId: string) => void;
};

export function CompaniesAdmin({
  companies,
  onCreateCompany,
  onUpdateCompany,
  onDeleteCompany,
}: Props) {
  const t = useT();
  const sorted = useMemo(
    () => [...companies].sort((a, b) => a.name.localeCompare(b.name)),
    [companies],
  );

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDelete =
    pendingDeleteId !== null
      ? (companies.find((c) => c.id === pendingDeleteId) ?? null)
      : null;

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
                  submitLabel={t("settings.companiesTab.saveSubmit")}
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
                title={t("settings.companiesTab.editLabel")}
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
              >
                <Pencil size={13} aria-hidden focusable={false} />
              </button>
              <button
                type="button"
                onClick={() => setPendingDeleteId(c.id)}
                aria-label={t("settings.companiesTab.deleteCompany")}
                title={t("settings.companiesTab.deleteLabel")}
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
              submitLabel={t("settings.companiesTab.addSubmit")}
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

function CompanyEditor({
  initial,
  existing,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: Company | null;
  existing: readonly Company[];
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: Omit<Company, "id">) => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(inputRef, true);
  const trimmed = name.trim();
  const duplicate = existing.some(
    (c) =>
      c.id !== initial?.id &&
      c.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const canSubmit = trimmed.length > 0 && !duplicate;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({ name: trimmed });
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
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onCancel}>
          {t("settings.companiesTab.cancelSubmit")}
        </Button>
        <Button variant="primary" type="submit" disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
