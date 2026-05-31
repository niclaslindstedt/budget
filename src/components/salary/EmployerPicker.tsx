import type { Employer } from "../../data/types";
import { useT } from "../../i18n";
import { SelectPicker, type SelectOption } from "../form";

type Props = {
  // The selected employer id, or undefined for "no employer".
  value: string | undefined;
  employers: readonly Employer[];
  onChange: (employerId: string | undefined) => void;
  ariaLabel?: string;
};

// Custom employer dropdown built on the shared SelectPicker (no native
// <select>). The empty-string sentinel maps back to `undefined` so the
// caller stores "no employer" as an absent field. Creating employers
// lives in the dedicated EmployerManageModal, not inline here, so the
// picker stays a flat list.
export function EmployerPicker({
  value,
  employers,
  onChange,
  ariaLabel,
}: Props) {
  const t = useT();
  const options: SelectOption<string>[] = [
    { value: "", label: t("salary.noEmployer") },
    ...employers.map((e) => ({ value: e.id, label: e.name })),
  ];
  return (
    <SelectPicker
      value={value ?? ""}
      options={options}
      onChange={(next) => onChange(next === "" ? undefined : next)}
      ariaLabel={ariaLabel ?? t("salary.pickEmployer")}
      panelClassName="max-h-64 overflow-y-auto"
    />
  );
}
