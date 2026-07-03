import { Pencil, Plus, ReceiptText, Search } from "lucide-react";

import type { Car, CarExpense, EntryType, Settings } from "../../data/types";
import { useLang, useT } from "../../i18n";
import { displayTypeName } from "../../i18n/preset-names";
import {
  formatBalance,
  formatDistance,
  formatMonthYearShort,
  formatShortDate,
} from "../../utils/format";
import { Button } from "../form";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";

// The transportation costs attributed to one car, newest first and
// grouped by month with a subtotal per group. Removing an expense
// leaves the bank entry untouched — it becomes a "Find car expenses"
// candidate again, so no confirmation is armed. Manual (sourceless)
// expenses carry a pencil that opens the manual editor; transaction-
// backed rows edit through their source entry instead.
//
// `centered`: a pure list — nothing opens the soft keyboard.

type Props = {
  open: boolean;
  car: Car | null;
  settings: Settings;
  // Merged preset + user types, for each expense's type name + glyph.
  typesById: ReadonlyMap<string, EntryType>;
  onClose: () => void;
  onRemoveExpense: (carId: string, expenseId: string) => void;
  onEditExpense: (car: Car, expense: CarExpense) => void;
  onFindExpenses: (car: Car) => void;
  onAddManual: (car: Car) => void;
};

export function CarExpensesModal({
  open,
  car,
  settings,
  typesById,
  onClose,
  onRemoveExpense,
  onEditExpense,
  onFindExpenses,
  onAddManual,
}: Props) {
  const t = useT();
  const lang = useLang();

  if (!open || !car) return null;

  const expenses = [...car.expenses].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  // Month groups in the sorted (newest-first) order.
  const groups: { month: string; rows: CarExpense[]; total: number }[] = [];
  for (const expense of expenses) {
    const month = expense.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.month === month) {
      last.rows.push(expense);
      last.total += expense.amount;
    } else {
      groups.push({ month, rows: [expense], total: expense.amount });
    }
  }
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="car-expenses-title"
      size="max-w-xl"
      centered
    >
      <Modal.Header
        icon={<ReceiptText size={14} aria-hidden focusable={false} />}
        title={t("carsSheet.expensesTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm font-bold text-fg-bright">{car.name}</p>

          {expenses.length === 0 ? (
            <p className="m-0 py-6 text-center text-sm text-muted">
              {t("carsSheet.expensesEmpty")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <div key={group.month} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold tracking-wider uppercase text-muted">
                      {formatMonthYearShort(`${group.month}-01`, lang)}
                    </span>
                    <span className="text-xs tabular-nums text-muted">
                      {formatBalance(group.total, settings, {
                        neverAbbreviate: true,
                      })}
                    </span>
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {group.rows.map((expense) => {
                      const type = typesById.get(expense.typeId);
                      const isManual = expense.sourceHistoryId === undefined;
                      return (
                        <li
                          key={expense.id}
                          className="flex items-center gap-2.5 rounded border border-line bg-surface-2 px-3 py-2 text-sm"
                        >
                          <CategoryIconGlyph
                            name={type?.glyph ?? "receipt"}
                            size={16}
                            className="shrink-0 text-accent"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-fg-bright">
                              {expense.description}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {formatShortDate(
                                expense.date,
                                settings.shortDateFormat,
                                lang,
                              )}
                              {" · "}
                              {type
                                ? displayTypeName(type, t)
                                : t("carsSheet.uncategorizedType")}
                              {expense.distance !== undefined
                                ? ` · ${formatDistance(
                                    expense.distance,
                                    settings,
                                    {
                                      neverAbbreviate: true,
                                    },
                                  )}`
                                : ""}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums text-fg-bright">
                            {formatBalance(expense.amount, settings, {
                              neverAbbreviate: true,
                            })}
                          </span>
                          {isManual && (
                            <button
                              type="button"
                              onClick={() => onEditExpense(car, expense)}
                              aria-label={t("carsSheet.editExpenseTitle")}
                              className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
                            >
                              <Pencil size={14} aria-hidden focusable={false} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onRemoveExpense(car.id, expense.id)}
                            aria-label={t("common.delete")}
                            className="cursor-pointer rounded border-0 bg-transparent px-1 text-xs text-muted hover:text-danger"
                          >
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <span className="text-xs font-bold tracking-wider uppercase text-muted">
                  {t("carsSheet.expensesTotal")}
                </span>
                <span className="font-bold tabular-nums text-fg-bright">
                  {formatBalance(total, settings, { neverAbbreviate: true })}
                </span>
              </div>
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" withIcon onClick={() => onAddManual(car)}>
          <Plus size={16} aria-hidden focusable={false} />
          {t("carsSheet.addManualExpense")}
        </Button>
        <Button variant="primary" withIcon onClick={() => onFindExpenses(car)}>
          <Search size={16} aria-hidden focusable={false} />
          {t("carsSheet.findExpenses")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
