import type {
  Category,
  Company,
  EntryType,
  UserData,
} from "../../../data/types";
import { allCategories, allTypes } from "../../../data/presets/merge";
import { useT } from "../../../i18n";
import { CompaniesAdmin } from "../CompaniesAdmin";
import { Section } from "./shared";

export function CompaniesTab({
  data,
  onCreateCompany,
  onUpdateCompany,
  onDeleteCompany,
  onCreateType,
  onCreateCategory,
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
}) {
  const t = useT();
  return (
    <Section title={t("settings.companiesTab.title")}>
      <CompaniesAdmin
        companies={data.companies}
        types={allTypes(data)}
        categories={allCategories(data)}
        onCreateCompany={onCreateCompany}
        onUpdateCompany={onUpdateCompany}
        onDeleteCompany={onDeleteCompany}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
      />
    </Section>
  );
}
