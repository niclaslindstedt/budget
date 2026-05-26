import type { Company, UserData } from "../../../data/types";
import { useT } from "../../../i18n";
import { CompaniesAdmin } from "../CompaniesAdmin";
import { Section } from "./shared";

export function CompaniesTab({
  data,
  onCreateCompany,
  onUpdateCompany,
  onDeleteCompany,
}: {
  data: UserData;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  onUpdateCompany: (
    companyId: string,
    patch: Partial<Omit<Company, "id">>,
  ) => void;
  onDeleteCompany: (companyId: string) => void;
}) {
  const t = useT();
  return (
    <Section title={t("settings.companiesTab.title")}>
      <CompaniesAdmin
        companies={data.companies}
        onCreateCompany={onCreateCompany}
        onUpdateCompany={onUpdateCompany}
        onDeleteCompany={onDeleteCompany}
      />
    </Section>
  );
}
