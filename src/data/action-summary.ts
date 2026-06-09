import type { Action } from "./reducer";
import type { Employer, Property, Salary, Transfer, UserData } from "./types";
import { findColumnByType } from "./sheet";
import { tFor, type MessageKey } from "../i18n";
import type { Lang } from "../i18n/locale";

// The dynamic subject an action acted on, surfaced in the action-history
// modal and the undo / redo toasts next to the verb+object label. Two
// shapes so a single named object reads "Edited payslip 'BookBeat
// 2026-04'" while a multi-target op reads "Deleted rows (3)". `undefined`
// (returned by `describeActionSubject`) means the action has no nameable
// target and renders the plain label on its own.
export type ActionSubject =
  | { kind: "name"; value: string }
  | { kind: "count"; value: number };

const name = (value: string | undefined): ActionSubject | undefined =>
  value && value.trim() ? { kind: "name", value: value.trim() } : undefined;

const count = (n: number): ActionSubject => ({ kind: "count", value: n });

function byId<T extends { id: string }>(
  list: readonly T[] | undefined,
  id: string,
): T | undefined {
  return list?.find((x) => x.id === id);
}

// The resolved display description of a budget row: the value in its
// description cell, trimmed, or undefined when blank / not found. Only
// AccountBudget items carry rows.
function rowDescription(
  state: UserData,
  sheetId: string,
  itemId: string,
  rowId: string,
): string | undefined {
  const sheet = byId(state.sheets, sheetId);
  const item = sheet?.items.find((i) => i.id === itemId);
  if (!item || item.type !== "accountBudget") return undefined;
  const descCol = findColumnByType(item.columns, "description");
  if (!descCol) return undefined;
  const cell = item.rows.find((r) => r.id === rowId)?.cells[descCol.id];
  return typeof cell === "string" && cell.trim() ? cell.trim() : undefined;
}

// "<Employer> <YYYY-MM>" for a salary, falling back to just the pay month
// when no employer is assigned (the label already says "payslip").
function payslipName(
  salary: Salary | undefined,
  employers: readonly Employer[],
): string | undefined {
  if (!salary) return undefined;
  const month = salary.date?.slice(0, 7) ?? "";
  const employer = salary.employerId
    ? byId(employers, salary.employerId)?.name?.trim()
    : undefined;
  return (employer ? `${employer} ${month}` : month).trim() || undefined;
}

// A mortgage's label, resolved from its parent property by id. Falls back
// to the property name when the mortgage can't be found.
function mortgageName(
  properties: readonly Property[] | undefined,
  propertyId: string,
  mortgageId: string,
): string | undefined {
  const property = byId(properties, propertyId);
  const mortgage = property?.mortgages.find((m) => m.id === mortgageId);
  return mortgage?.name || property?.name;
}

// A history entry's display label: the user's override, else the raw bank
// description.
function historyEntryDescription(
  state: UserData,
  accountId: string,
  entryId: string,
): string | undefined {
  const entry = state.history[accountId]?.find((e) => e.id === entryId);
  if (!entry) return undefined;
  return (
    entry.userDescription?.trim() || entry.description?.trim() || undefined
  );
}

// A transfer's label: its description, else "<from> → <to>" account names.
function transferName(
  transfer: Transfer | undefined,
  state: UserData,
): string | undefined {
  if (!transfer) return undefined;
  if (transfer.description?.trim()) return transfer.description.trim();
  const from = byId(state.accounts, transfer.fromAccountId)?.name;
  const to = byId(state.accounts, transfer.toAccountId)?.name;
  return from && to ? `${from} → ${to}` : (from ?? to);
}

// The distinct set of settings fields whose value changed between two
// persisted-settings snapshots. Compares every common (top-level) field
// and every device-scoped field across both scopes, deduping by field
// name (so flipping the same field on mobile + desktop counts once).
// JSON comparison handles the nested objects (customTheme, searchRanking,
// the download-prefs maps) without a per-field deep-equal.
function changedSettingFields(prev: UserData, next: UserData): string[] {
  const changed = new Set<string>();
  const prevS = prev.settings as unknown as Record<string, unknown>;
  const nextS = next.settings as unknown as Record<string, unknown>;
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  for (const key of Object.keys(nextS)) {
    if (key === "device") continue;
    if (!same(prevS[key], nextS[key])) changed.add(key);
  }
  const prevDev = prev.settings.device;
  const nextDev = next.settings.device;
  for (const scope of ["mobile", "desktop"] as const) {
    const p = prevDev?.[scope] as unknown as Record<string, unknown>;
    const n = nextDev?.[scope] as unknown as Record<string, unknown>;
    for (const key of Object.keys(n ?? {})) {
      if (!same(p?.[key], n?.[key])) changed.add(key);
    }
  }
  return [...changed];
}

// Friendly name for a single changed settings field, or undefined when
// the field has no `actionHistory.setting.*` label (e.g. a non-user-facing
// field like `achievements`). Resolved at action time so the stored name
// is in the language active when the change was made — fine for the
// in-memory, per-session history.
function settingFieldName(field: string, lang: Lang): string | undefined {
  const key = `actionHistory.setting.${field}` as MessageKey;
  const resolved = tFor(lang, key);
  return resolved === key ? undefined : resolved;
}

function settingsSubject(
  prev: UserData,
  next: UserData,
  lang: Lang,
): ActionSubject | undefined {
  const fields = changedSettingFields(prev, next);
  if (fields.length === 1) return name(settingFieldName(fields[0], lang));
  if (fields.length > 1) return count(fields.length);
  return undefined;
}

// Describe what object an action acted on, for the action-history modal
// and undo / redo toasts. Pure: reads the entity name out of `next`
// (creates / edits) or `prev` (deletes, where the entity is gone from
// `next`). Returns `undefined` for actions with no nameable target —
// those render their plain catalog label. `lang` is only consumed by the
// settings case, which translates the changed field's name eagerly.
export function describeActionSubject(
  action: Action,
  prev: UserData,
  next: UserData,
  lang: Lang,
): ActionSubject | undefined {
  switch (action.type) {
    // Budget rows — single-target actions name the row; multi-target
    // ones report a count (with a 1-row action still naming the row).
    case "updateCell":
    case "toggleRowTransfer":
    case "convertToRecurring":
    case "editSeries":
    case "propagateCellToFuture":
    case "setRowLineItems":
    case "setRowFiscalMonthShift":
      return name(
        rowDescription(next, action.sheetId, action.itemId, action.rowId),
      );
    case "splitRow":
      return name(
        rowDescription(prev, action.sheetId, action.itemId, action.rowId),
      );
    case "addRowsFromComplex":
      return name(action.draft.description);
    case "deleteRows":
    case "bulkUpdate":
    case "bulkShiftToMonth":
    case "bulkMakeRecurring": {
      const ids = action.rowIds;
      if (ids.length === 1) {
        const state = action.type === "deleteRows" ? prev : next;
        return name(
          rowDescription(state, action.sheetId, action.itemId, ids[0]),
        );
      }
      return count(ids.length);
    }
    case "bulkCopyToMonths":
      return count(action.sources.length);

    // Taxonomy.
    case "addCategory":
      return name(action.category.name);
    case "updateCategory":
      return name(byId(next.categories, action.categoryId)?.name);
    case "deleteCategory":
      return name(byId(prev.categories, action.categoryId)?.name);
    case "addType":
      return name(action.entryType.name);
    case "updateType":
      return name(byId(next.types, action.typeId)?.name);
    case "deleteType":
      return name(byId(prev.types, action.typeId)?.name);
    case "addCompany":
      return name(action.company.name);
    case "updateCompany":
      return name(byId(next.companies, action.companyId)?.name);
    case "deleteCompany":
      return name(byId(prev.companies, action.companyId)?.name);
    case "addCompanyCategory":
      return name(action.companyCategory.name);
    case "updateCompanyCategory":
      return name(byId(next.companyCategories, action.companyCategoryId)?.name);
    case "deleteCompanyCategory":
      return name(byId(prev.companyCategories, action.companyCategoryId)?.name);
    case "addTag":
      return name(action.tag.name);
    case "updateTag":
      return name(byId(next.tags, action.tagId)?.name);
    case "deleteTag":
      return name(byId(prev.tags, action.tagId)?.name);
    case "addSubtype":
      return name(action.subtype.name);
    case "updateSubtype":
      return name(byId(next.subtypes, action.subtypeId)?.name);
    case "deleteSubtype":
      return name(byId(prev.subtypes, action.subtypeId)?.name);
    case "addItem":
      return name(action.item.name);
    case "updateItem":
      return name(byId(next.items, action.itemId)?.name);
    case "deleteItem":
      return name(byId(prev.items, action.itemId)?.name);
    case "excludeSimilarItemEntries":
      return name(action.description);

    // Accounts.
    case "createAccount":
      return name(action.account.name);
    case "updateAccount":
      return name(byId(next.accounts, action.accountId)?.name);
    case "deleteAccount":
      return name(byId(prev.accounts, action.accountId)?.name);
    case "cutAccountHistory":
    case "correctAccountBalance":
      return name(byId(next.accounts, action.accountId)?.name);

    // Savings — single-target actions name the savings account. Edits /
    // balance points read off `next` (the account still exists); the delete
    // reads the name off `prev` since the account is gone in `next`.
    case "createSaving":
      return name(action.saving.name);
    case "updateSaving":
    case "addSavingBalance":
    case "updateSavingBalance":
    case "deleteSavingBalance":
      return name(byId(next.savings, action.savingId)?.name);
    case "deleteSaving":
      return name(byId(prev.savings, action.savingId)?.name);

    // Salary / employers / tax profiles.
    case "addSalaries":
      return action.salaries.length === 1
        ? name(payslipName(action.salaries[0], next.employers))
        : count(action.salaries.length);
    case "updateSalary":
      return name(
        payslipName(byId(next.salaries, action.salaryId), next.employers),
      );
    case "deleteSalary":
      return name(
        payslipName(byId(prev.salaries, action.salaryId), prev.employers),
      );
    case "bulkUpdateSalaries":
    case "bulkSetSalaryTaxRate":
    case "bulkSetSalaryRole":
      return action.ids.length === 1
        ? name(payslipName(byId(next.salaries, action.ids[0]), next.employers))
        : count(action.ids.length);
    case "createEmployer":
      return name(action.employer.name);
    case "updateEmployer":
      return name(byId(next.employers, action.employerId)?.name);
    case "deleteEmployer":
      return name(byId(prev.employers, action.employerId)?.name);
    case "createTaxProfile":
      return name(action.profile.name);
    case "updateTaxProfile":
      return name(byId(next.taxProfiles, action.profileId)?.name);
    case "deleteTaxProfile":
      return name(byId(prev.taxProfiles, action.profileId)?.name);
    case "setSalaryTaxProfile":
    case "setItemAccount":
      return name(byId(next.sheets, action.sheetId)?.name);

    // Properties / mortgages — single-target actions name the property
    // (or the mortgage); bulk-added payments report a count. Edits / value
    // points read off `next` (the property still exists); deletes read the
    // parent off `next` too unless the named entity itself is gone.
    case "addProperty":
    case "importProperty":
      return name(action.property.name);
    case "updateProperty":
    case "addPropertyValue":
    case "updatePropertyValue":
    case "deletePropertyValue":
      return name(byId(next.properties, action.propertyId)?.name);
    case "deleteProperty":
      return name(byId(prev.properties, action.propertyId)?.name);
    case "addMortgage":
      return name(action.mortgage.name);
    case "updateMortgage":
      return name(
        mortgageName(next.properties, action.propertyId, action.mortgageId),
      );
    case "deleteMortgage":
      return name(
        mortgageName(prev.properties, action.propertyId, action.mortgageId),
      );
    case "addMortgagePayments":
      return count(action.payments.length);
    case "addMortgagePaymentsForProperty":
      return name(byId(next.properties, action.propertyId)?.name);
    case "updateMortgagePayment":
    case "deleteMortgagePayment":
      return name(
        mortgageName(next.properties, action.propertyId, action.mortgageId),
      );
    case "deleteAllMortgagePayments":
    case "setMortgageChargeSplit":
      return name(byId(next.properties, action.propertyId)?.name);
    case "addRepairs":
      return count(action.repairs.length);
    case "updateRepair":
    case "deleteRepair":
      return name(byId(next.properties, action.propertyId)?.name);
    case "setPropertySaleEstimate":
    case "addPropertyFile":
    case "updatePropertyFile":
    case "deletePropertyFile":
    case "addRepairReceipt":
    case "updateRepairReceipt":
    case "removeRepairReceipt":
      return name(byId(next.properties, action.propertyId)?.name);

    // File categories (property file subfolders).
    case "addFileCategory":
      return name(action.category.name);
    case "updateFileCategory":
      return name(byId(next.fileCategories, action.categoryId)?.name);
    case "deleteFileCategory":
      return name(byId(prev.fileCategories, action.categoryId)?.name);

    // Transfers.
    case "createTransfer":
      return name(transferName(action.transfer, next));
    case "updateTransfer":
      return name(transferName(byId(next.transfers, action.transferId), next));
    case "deleteTransfer":
      return name(transferName(byId(prev.transfers, action.transferId), prev));

    // Sheets.
    case "addSheet":
      return name(action.sheet.name);
    case "updateSheetMeta":
      return name(action.meta.name);
    case "deleteSheet":
      return name(byId(prev.sheets, action.sheetId)?.name);
    case "toggleSheetFavorite":
      return name(byId(next.sheets, action.sheetId)?.name);
    case "renameSheet":
      return name(action.name);
    case "reorderSheets":
      return name(byId(next.sheets, action.fromId)?.name);

    // Bank history.
    case "importBankHistory":
      return name(action.filename);
    case "updateHistoryEntry":
    case "splitHistoryEntry":
    case "linkLineItemsToHistoryEntry":
    case "setHistoryEntryFiscalMonthShift":
    case "setHistoryEntryPrimaryIncome":
      return name(
        historyEntryDescription(next, action.accountId, action.entryId),
      );
    case "applyImportRenames":
      return action.renames.length === 1
        ? name(
            historyEntryDescription(
              next,
              action.accountId,
              action.renames[0].entryId,
            ),
          )
        : count(action.renames.length);

    // Recurring / transfer collapse.
    case "promoteRecurringCandidate":
    case "promoteHistoryToRecurring":
    case "collapseTransferPair":
      return name(action.description);
    case "dismissRecurringCandidates":
      return count(action.keys.length);

    // Match rules.
    case "createMatchRule":
    case "updateMatchRule":
    case "applyMatchRuleOnce":
      return name(action.rule.pattern);
    case "deleteMatchRule":
      return name(byId(prev.matchRules, action.ruleId)?.pattern);
    case "moveMatchRule":
      return name(byId(next.matchRules, action.ruleId)?.pattern);

    // Settings — name the single changed field, else count.
    case "updateSettings":
    case "updateDeviceSettings":
    case "updateCommonSettings":
      return settingsSubject(prev, next, lang);

    default:
      return undefined;
  }
}
