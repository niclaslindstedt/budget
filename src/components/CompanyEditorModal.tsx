import { Building2 } from "lucide-react";

import type {
  Category,
  Company,
  CompanyCategory,
  EntryType,
} from "../data/types";
import { useT } from "../i18n";
import { Modal } from "./Modal";
import { CompanyEditor } from "./SettingsModal/CompaniesAdmin";

// Standalone editor for an existing company, reusing the same
// `CompanyEditor` form that Settings → Companies renders inline. Opened
// from the long-press / right-click escape hatch on a budget row's
// company pill (via the `open-edit-company` modal command) so the user
// can rename a merchant or re-pin its associated types without leaving
// the ledger. The editor owns its own Cancel / Save buttons, so the
// modal supplies only the chrome (header + body).
//
// Not `centered`: the editor's name field opens the soft keyboard, so
// the modal keeps the default fullscreen-on-mobile layout whose
// visual-viewport math keeps the form above the keyboard.

type Props = {
  open: boolean;
  // The company to edit. Null while no pill has been long-pressed yet —
  // the modal renders nothing until one resolves.
  company: Company | null;
  companies: readonly Company[];
  types: readonly EntryType[];
  categories: readonly Category[];
  companyCategories: readonly CompanyCategory[];
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompanyCategory: (
    draft: Omit<CompanyCategory, "id">,
  ) => CompanyCategory;
  onSubmit: (companyId: string, patch: Partial<Omit<Company, "id">>) => void;
  onClose: () => void;
};

export function CompanyEditorModal({
  open,
  company,
  companies,
  types,
  categories,
  companyCategories,
  onCreateType,
  onCreateCategory,
  onCreateCompanyCategory,
  onSubmit,
  onClose,
}: Props) {
  const t = useT();
  if (!open || !company) return null;
  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="company-editor-modal-title"
      size="max-w-sm"
    >
      <Modal.Header
        icon={<Building2 size={14} aria-hidden focusable={false} />}
        title={t("company.editCompany")}
        onClose={onClose}
      />
      <Modal.Body>
        <CompanyEditor
          initial={company}
          existing={companies}
          types={types}
          categories={categories}
          companyCategories={companyCategories}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
          onCreateCompanyCategory={onCreateCompanyCategory}
          submitLabel={t("common.save")}
          onCancel={onClose}
          onSubmit={(draft) => {
            onSubmit(company.id, draft);
            onClose();
          }}
        />
      </Modal.Body>
    </Modal>
  );
}
