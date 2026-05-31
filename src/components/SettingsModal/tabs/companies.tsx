import type {
  Category,
  Company,
  CompanyCategory,
  EntryType,
  UserData,
} from "../../../data/types";
import {
  allCategories,
  allCompanyCategories,
  allTypes,
} from "../../../data/presets/merge";
import { useT } from "../../../i18n";
import { CompaniesAdmin } from "../CompaniesAdmin";
import { CompanyCategoriesAdmin } from "../CompanyCategoriesAdmin";
import { Section } from "./shared";

export function CompaniesTab({
  data,
  onCreateCompany,
  onUpdateCompany,
  onDeleteCompany,
  onCreateType,
  onCreateCategory,
  onCreateCompanyCategory,
  onUpdateCompanyCategory,
  onDeleteCompanyCategory,
  onSetPresetCompanyCategoryHidden,
}: {
  data: UserData;
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
  onUpdateCompanyCategory: (
    id: string,
    patch: Partial<Omit<CompanyCategory, "id">>,
  ) => void;
  onDeleteCompanyCategory: (id: string) => void;
  onSetPresetCompanyCategoryHidden: (presetId: string, hidden: boolean) => void;
}) {
  const t = useT();
  return (
    <>
      <Section title={t("settings.companiesTab.title")}>
        <CompaniesAdmin
          companies={data.companies}
          types={allTypes(data)}
          categories={allCategories(data)}
          companyCategories={allCompanyCategories(data)}
          onCreateCompany={onCreateCompany}
          onUpdateCompany={onUpdateCompany}
          onDeleteCompany={onDeleteCompany}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
          onCreateCompanyCategory={onCreateCompanyCategory}
        />
      </Section>
      <Section title={t("settings.companiesTab.companyCategoriesTitle")}>
        <CompanyCategoriesAdmin
          companyCategories={data.companyCategories}
          hiddenPresetCompanyCategoryIds={data.hiddenPresetCompanyCategoryIds}
          onCreateCompanyCategory={onCreateCompanyCategory}
          onUpdateCompanyCategory={onUpdateCompanyCategory}
          onDeleteCompanyCategory={onDeleteCompanyCategory}
          onSetPresetCompanyCategoryHidden={onSetPresetCompanyCategoryHidden}
        />
      </Section>
    </>
  );
}
