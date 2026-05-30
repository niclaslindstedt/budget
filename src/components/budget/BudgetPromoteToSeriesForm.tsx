import { useCallback, useMemo, useState } from "react";

import type { RecurrenceRule } from "../../data/recurrence";
import { findColumnByType } from "../../data/sheet";
import type {
  Category,
  Column,
  Company,
  EntryType,
  Row,
} from "../../data/types";
import { useAutoTypeForCompany } from "../../hooks";
import { useT } from "../../i18n";
import { CompanyPicker } from "../CompanyPicker";
import { Modal } from "../Modal";
import { Button } from "../form";
import { BudgetRecurrenceForm } from "./BudgetRecurrenceForm";
import { TypePicker } from "../TypePicker";
import type { HistoryMatchPreview } from "./BudgetPromoteHistoryForm";

type Props = {
  row: Row;
  columns: Column[];
  categories: Category[];
  types: readonly EntryType[];
  companies: readonly Company[];
  // companyId → suggested typeId for the auto-fill. When the user
  // picks a company on a row whose type isn't set and the company has
  // a confident suggestion, the type picker auto-fills behind the
  // CompanyPicker.
  companyTypeSuggestions: ReadonlyMap<string, string>;
  // Past bank-history rows that share this row's merchant key. Shown
  // greyed-out alongside the future preview so the user can see what
  // settled entries will adopt the typed label (those rows aren't
  // re-minted — they're backfilled via the merchant-hint store).
  matches?: ReadonlyArray<HistoryMatchPreview>;
  onClose: () => void;
  onSubmit: (
    rowId: string,
    dates: string[],
    typeId: string | null,
    companyId: string | null,
  ) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
};

export function BudgetPromoteToSeriesForm({
  row,
  columns,
  categories,
  types,
  companies,
  companyTypeSuggestions,
  matches,
  onClose,
  onSubmit,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
}: Props) {
  const t = useT();
  const dateCol = useMemo(() => findColumnByType(columns, "date"), [columns]);

  const initialDate =
    dateCol && typeof row.cells[dateCol.id] === "string"
      ? (row.cells[dateCol.id] as string)
      : "";

  const [typeId, setTypeId] = useState<string | null>(row.typeId ?? null);
  const [companyId, setCompanyId] = useState<string | null>(
    row.companyId ?? null,
  );
  // Wrap the company picker's onSelect so a confident company → type
  // pairing auto-fills the empty type. The user can still override
  // either field afterwards.
  const autoTypeForPickedCompany = useAutoTypeForCompany(
    typeId,
    companyTypeSuggestions,
  );
  const handlePickCompany = useCallback(
    (next: string | null) => {
      setCompanyId(next);
      const auto = autoTypeForPickedCompany(next);
      if (auto !== undefined) setTypeId(auto);
    },
    [autoTypeForPickedCompany],
  );
  const [recurringDates, setRecurringDates] = useState<string[]>([]);

  const handleRuleChange = useCallback(
    (_rule: RecurrenceRule | null, dates: string[]) => {
      setRecurringDates(dates);
    },
    [],
  );

  // Drop the seed date itself if the recurrence includes it — that row
  // already exists, the reducer dedupes anyway, but doing it here keeps
  // the action payload minimal.
  const extras = recurringDates.filter((d) => d !== initialDate);

  function handleSubmit() {
    if (extras.length === 0) return;
    onSubmit(row.id, extras, typeId, companyId);
  }

  return (
    <>
      <Modal.Body>
        <p className="mb-3 text-sm text-muted">{t("editEntry.promoteIntro")}</p>
        <div className="mb-4 flex flex-col gap-1">
          <span className="text-xs text-muted">{t("editEntry.type")}</span>
          <TypePicker
            variant="field"
            types={types}
            categories={categories}
            selectedId={typeId}
            onSelect={setTypeId}
            onCreate={onCreateType}
            onCreateCategory={onCreateCategory}
          />
        </div>
        <div className="mb-4 flex flex-col gap-1">
          <span className="text-xs text-muted">{t("editEntry.company")}</span>
          <CompanyPicker
            variant="field"
            companies={companies}
            selectedId={companyId}
            onSelect={handlePickCompany}
            onCreate={onCreateCompany}
          />
        </div>
        <BudgetRecurrenceForm
          seedDate={initialDate}
          resetKey={row.id}
          includeOnce={false}
          historicDates={matches?.map((m) => m.date)}
          onChange={handleRuleChange}
        />
        {matches && matches.length > 0 && (
          <p className="mt-3 rounded border border-line bg-surface-3 p-2 text-xs text-muted">
            {matches.length === 1
              ? t("editEntry.promoteBackfillOne", { n: matches.length })
              : t("editEntry.promoteBackfillOther", { n: matches.length })}
          </p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={extras.length === 0}
        >
          {(() => {
            const n = extras.length;
            return n === 1
              ? t("editEntry.addFutureEntries", { n })
              : t("editEntry.addFutureEntriesPlural", { n });
          })()}
        </Button>
      </Modal.Footer>
    </>
  );
}
