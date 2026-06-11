import type {
  Account,
  Category,
  CommonSettings,
  Company,
  CompanyCategory,
  DeviceSettings,
  Employer,
  EntryType,
  EntryTypeKind,
  FileCategory,
  HistoryEntrySplit,
  InsightsNetWorthSettings,
  InvestmentHolding,
  InvestmentValuePoint,
  Item,
  LineItemLink,
  Loan,
  LoanBalancePoint,
  LoanPayment,
  MatchRule,
  Mortgage,
  MortgagePayment,
  Property,
  PropertyFile,
  PropertyRepair,
  PropertySaleEstimate,
  PropertyValuePoint,
  RepairReceipt,
  Salary,
  Saving,
  SavingBalancePoint,
  SeriesMatchRule,
  Settings,
  Sheet,
  StockPosition,
  StockPricePoint,
  StockTransaction,
  Subtype,
  Tag,
  TaxProfile,
  Transfer,
  UserData,
} from "./types";
import type { SheetDraft } from "./action-payloads";
import type { ParsedBankEntry } from "../storage/banks";
import { type ItemAction } from "./reducers/item";
import { SHEET_TYPE_REGISTRY } from "./sheet-types";
import { reduceAchievements } from "./reducers/achievements";
import { reduceSheets } from "./reducers/sheets";
import { reduceSettings } from "./reducers/settings";
import { reduceCategoriesAndTypes } from "./reducers/categories-and-types";
import { reduceItems } from "./reducers/items";
import { reduceProperties } from "./reducers/properties";
import { reduceSavings } from "./reducers/savings";
import { reduceLoans } from "./reducers/loans";
import { reduceInvestments } from "./reducers/investments";
import { reduceMatchRules } from "./reducers/match-rules";
import { reduceTransfers } from "./reducers/transfers";
import { reduceRecurring } from "./reducers/recurring";
import { reduceAccounts } from "./reducers/accounts";
import { reduceSalary } from "./reducers/salary";
import { reduceHistory } from "./reducers/history";
import { reduceSeriesMetadata } from "./reducers/series-metadata";
import { reduceHistoryPrimaryIncome } from "./reducers/history-primary-income";

// One imported bank entry's metadata stamp, carried by `addLoanPayments`
// — see the field comment on that action.
export type LoanImportEntryOverride = {
  accountId: string;
  entryId: string;
  userTypeId?: string;
  userDescription?: string;
};

export type Action =
  | ItemAction
  | { type: "replace"; data: UserData }
  | { type: "addCategory"; category: Category }
  | {
      type: "updateCategory";
      categoryId: string;
      patch: Partial<Omit<Category, "id">>;
    }
  | { type: "deleteCategory"; categoryId: string }
  | { type: "setPresetCategoryHidden"; presetId: string; hidden: boolean }
  | { type: "addType"; entryType: EntryType }
  | {
      type: "updateType";
      typeId: string;
      patch: Partial<Omit<EntryType, "id">>;
    }
  | { type: "deleteType"; typeId: string }
  | { type: "setPresetTypeHidden"; presetId: string; hidden: boolean }
  | { type: "setPresetTypeKind"; presetId: string; kind: EntryTypeKind }
  | { type: "addCompany"; company: Company }
  | {
      // Edit a user-defined company by id. Each field in `patch` is
      // optional; absent fields stay untouched. Companies are name-
      // only so the only meaningful field is `name`, but the patch
      // shape mirrors the Category / EntryType actions so a future
      // surface (notes, address, …) drops in without another reducer
      // signature.
      type: "updateCompany";
      companyId: string;
      patch: Partial<Omit<Company, "id">>;
    }
  | {
      // Delete a user-defined company. Cascades through every place
      // that references the id: row.companyId, history.userCompanyId,
      // history.splits[i].companyId, merchantHints[*].companyId,
      // matchRules[*].companyId, and renamePatterns[*].suggestedCompanyId
      // all get the reference dropped so the validator's
      // referential-integrity guards never trip on a dangling id.
      type: "deleteCompany";
      companyId: string;
    }
  | { type: "addCompanyCategory"; companyCategory: CompanyCategory }
  | {
      // Edit a user-defined company category by id. Patch shape mirrors
      // the Category action; presets are immutable (no-op on a preset
      // id).
      type: "updateCompanyCategory";
      companyCategoryId: string;
      patch: Partial<Omit<CompanyCategory, "id">>;
    }
  | {
      // Delete a user-defined company category. Cascades by stripping
      // `Company.companyCategoryId` from every company that referenced
      // it (the company becomes unclassified — no default reassignment,
      // since the field is optional) so the validator's
      // referential-integrity sweep never trips. Presets are hide-only.
      type: "deleteCompanyCategory";
      companyCategoryId: string;
    }
  | {
      type: "setPresetCompanyCategoryHidden";
      presetId: string;
      hidden: boolean;
    }
  | { type: "addTag"; tag: Tag }
  | {
      // Edit a user-defined tag by id. Each field in `patch` is
      // optional; absent fields stay untouched. Mirrors the Company /
      // Category patch shape.
      type: "updateTag";
      tagId: string;
      patch: Partial<Omit<Tag, "id">>;
    }
  | {
      // Delete a user-defined tag. Cascades by removing the id from
      // every `Row.tagIds` array (dropping the field when the array
      // empties) so the validator's referential-integrity guard never
      // trips on a dangling id. Tags live only on rows, so the cascade
      // is narrower than `deleteCompany`.
      type: "deleteTag";
      tagId: string;
    }
  | { type: "addSubtype"; subtype: Subtype }
  | {
      // Edit a user-defined subtype by id. Patch shape mirrors the
      // Company / Tag actions; `name` and the parent `typeId` are the
      // editable fields.
      type: "updateSubtype";
      subtypeId: string;
      patch: Partial<Omit<Subtype, "id">>;
    }
  | {
      // Delete a user-defined subtype. Clears `subtypeId` on every item
      // that referenced it (the item falls back to "unclassified"); no
      // item is deleted.
      type: "deleteSubtype";
      subtypeId: string;
    }
  | { type: "addItem"; item: Item }
  | {
      // Edit an owned item by id. Patch shape mirrors the Company / Tag
      // actions; `name`, `subtypeId`, `acquiredAt`, and `note` are the
      // editable fields.
      type: "updateItem";
      itemId: string;
      patch: Partial<Omit<Item, "id">>;
    }
  | {
      // Delete an owned item. Cascades by dropping every inline
      // `LineItemLink` that referenced it from every `Row.lineItems` and
      // `HistoryEntry.lineItems` (dropping the field when the array
      // empties) so the validator's referential-integrity guard never
      // trips on a dangling id.
      type: "deleteItem";
      itemId: string;
    }
  | {
      // Replace the inline line-item links on a single bank-imported
      // history entry — the historic-row counterpart of the item
      // reducer's `setRowLineItems`. `lineItems` is the full desired set
      // (the modal submits a replacement, not a delta); an empty array
      // clears the field. Mirrors `splitHistoryEntry`.
      type: "linkLineItemsToHistoryEntry";
      accountId: string;
      entryId: string;
      lineItems: LineItemLink[];
      // Receipt file reference for the purchase, set alongside the line
      // items in the same modal. An empty string clears it; `undefined`
      // leaves whatever was there untouched.
      receiptPath?: string;
    }
  | {
      // Persist an "ignore" decision from the Items sheet's "Find items"
      // scan so the scanner skips this history entry on every subsequent
      // run. `entryId` is the `HistoryEntry.id`. The Items settings tab
      // clears the whole list via `clearIgnoredItemEntries` so a misclick
      // is recoverable. Same shape and contract as
      // `dismissRecurringCandidate`.
      type: "ignoreItemEntry";
      entryId: string;
    }
  | { type: "clearIgnoredItemEntries" }
  | {
      // Persist an "exclude similar" decision from the Items sheet's
      // "Find items" scan. `description` is the candidate's resolved
      // label; the reducer normalises it to a key (the same lossy
      // `normaliseDescription` transform recurring detection uses) and
      // appends it to `itemFindExclusionPatterns`, so every entry whose
      // description collapses to that key — past and future — drops out
      // of the scan in one tap. Cleared via `clearItemFindExclusions`.
      type: "excludeSimilarItemEntries";
      description: string;
    }
  | { type: "clearItemFindExclusions" }
  | {
      // Save handler from the SettingsModal. `draft` is the flat
      // effective view the user edited; `scope` is which device
      // bucket they edited from (mobile when their viewport is below
      // the sm breakpoint, desktop otherwise). The reducer splits
      // the draft back into the bucketed `PersistedSettings` shape
      // via `applySettingsDraft`, leaving the other scope untouched.
      type: "updateSettings";
      draft: Settings;
      scope: "mobile" | "desktop";
    }
  // Targeted device-scoped patch. Used by callers that own a single
  // device-scoped field (e.g. the download-modal confirm path) and
  // don't want to round-trip a whole `Settings` draft through the
  // SettingsModal save handler.
  | {
      type: "updateDeviceSettings";
      scope: "mobile" | "desktop";
      patch: Partial<DeviceSettings>;
    }
  // Targeted common-scope patch. Mirrors `updateDeviceSettings` for
  // common-only callers (today: the "cloud reauth auto-open" toggle
  // which used to live in device-local localStorage).
  | { type: "updateCommonSettings"; patch: Partial<CommonSettings> }
  | { type: "renameSheet"; sheetId: string; name: string }
  | {
      type: "setItemAccount";
      sheetId: string;
      itemId: string;
      accountId: string | null;
    }
  | { type: "createAccount"; account: Account }
  | { type: "updateAccount"; accountId: string; patch: Partial<Account> }
  | { type: "deleteAccount"; accountId: string }
  | {
      // Drop bank history, transfers, and import-audit rows that
      // predate `cutoffDate` for the named account. Used when the
      // account's purpose changes (e.g. a private account turning into
      // a shared household account) and the user no longer wants the
      // pre-cutoff history dangling. Entries dated on or after the
      // cutoff are kept untouched.
      type: "cutAccountHistory";
      accountId: string;
      cutoffDate: string;
    }
  | {
      // Append a balance-correction row to the first AccountBudget that
      // tracks `accountId`. The amount carries the signed delta needed
      // to bring the account's running total to the user-asserted
      // value; `date` is the day to stamp the correction with. No-op
      // when no budget references the account — the UI gates the click
      // on that condition but the reducer enforces it too.
      type: "correctAccountBalance";
      accountId: string;
      date: string;
      amount: number;
    }
  | {
      // Bulk-add salaries accepted from the "Find salaries" detector in
      // one pass so the page doesn't re-render between each insert.
      type: "addSalaries";
      salaries: Salary[];
    }
  | {
      // Edit one salary by id. Each field in `patch` is optional; an
      // explicit `undefined` deletes the key (clears an optional field)
      // rather than storing `undefined`. Mirrors `updateItem`.
      type: "updateSalary";
      salaryId: string;
      patch: Partial<Omit<Salary, "id">>;
    }
  | { type: "deleteSalary"; salaryId: string }
  | {
      // Apply the same patch to many salaries — the select-many
      // mass-edit (e.g. set the employer on a whole stretch).
      type: "bulkUpdateSalaries";
      ids: string[];
      patch: Partial<Omit<Salary, "id">>;
    }
  | {
      // Set the gross on many salaries from a tax rate (a fraction of
      // gross, e.g. 0.3). Each salary's gross is derived from its own
      // net deposit: gross = net / (1 − rate). Used for Swedish
      // "skattejämkning" where the user knows the rate, not the kronor.
      type: "bulkSetSalaryTaxRate";
      ids: string[];
      rate: number;
    }
  | {
      // Set the job title on many salaries. For each distinct employer
      // among the selection, find-or-create a role with `title` and
      // point those salaries' `roleId` at it; a blank title clears the
      // role instead. Salaries with no employer are skipped (a role
      // belongs to an employer). The role carries no dates — its span is
      // derived from the salaries that reference it.
      type: "bulkSetSalaryRole";
      ids: string[];
      title: string;
    }
  | { type: "createEmployer"; employer: Employer }
  | {
      // Edit an employer by id (name, color, glyph, and the full
      // `roles` array — role edits submit a replacement set).
      type: "updateEmployer";
      employerId: string;
      patch: Partial<Omit<Employer, "id">>;
    }
  | {
      // Delete an employer. Cascades by clearing `employerId` on every
      // salary that referenced it (the salary becomes unassigned).
      type: "deleteEmployer";
      employerId: string;
    }
  | { type: "createTaxProfile"; profile: TaxProfile }
  | {
      // Edit a tax profile by id (name and/or params).
      type: "updateTaxProfile";
      profileId: string;
      patch: Partial<Omit<TaxProfile, "id">>;
    }
  | {
      // Delete a tax profile. Cascades by clearing `taxProfileId` on
      // every salary sheet's `salaryView` item that referenced it, so
      // those sheets fall back to "no estimate" rather than dangling.
      type: "deleteTaxProfile";
      profileId: string;
    }
  | {
      // Bind (or clear) the tax profile on a salary sheet's `salaryView`
      // item. `null` clears it. Mirrors `setItemAccount` but writes the
      // tax-profile pointer rather than the account.
      type: "setSalaryTaxProfile";
      sheetId: string;
      itemId: string;
      taxProfileId: string | null;
    }
  | {
      // Replace the net-worth settings on an insights sheet's
      // `insightsView` item wholesale. The settings modal edits a local
      // draft and dispatches once on Save, so one action is one undo
      // step. Reduced by the insights descriptor's `reduceItem`, which
      // normalises the payload to its minimal persisted form.
      type: "setInsightsNetWorthSettings";
      sheetId: string;
      itemId: string;
      settings: InsightsNetWorthSettings;
    }
  | { type: "createTransfer"; transfer: Transfer }
  | {
      type: "updateTransfer";
      transferId: string;
      patch: Partial<Transfer>;
    }
  | { type: "deleteTransfer"; transferId: string }
  // Properties — the homes / apartments the user owns, rendered by the
  // Properties sheet. Each mutates `UserData.properties`; the mortgage /
  // value-point / payment actions reach two levels deep (property →
  // mortgage → payment) and carry the parent ids to address the target.
  | { type: "addProperty"; property: Property }
  | {
      // Edit one property by id. Each field in `patch` is optional; an
      // explicit `undefined` deletes the key. Mirrors `updateItem`.
      type: "updateProperty";
      propertyId: string;
      patch: Partial<Omit<Property, "id">>;
    }
  | { type: "deleteProperty"; propertyId: string }
  | {
      // Record a manually-entered market value — appends one point to the
      // property's `valueHistory` (the current value is the latest point).
      type: "addPropertyValue";
      propertyId: string;
      point: PropertyValuePoint;
    }
  | {
      type: "updatePropertyValue";
      propertyId: string;
      pointId: string;
      patch: Partial<Omit<PropertyValuePoint, "id">>;
    }
  | { type: "deletePropertyValue"; propertyId: string; pointId: string }
  // Savings — the savings accounts the user sets money aside in, rendered by
  // the Savings sheet. Each mutates `UserData.savings`; the balance-point
  // actions append / edit / delete a dated snapshot under one account
  // (mirrors the property value-point actions above).
  | { type: "createSaving"; saving: Saving }
  | {
      // Edit one savings account by id. Each field in `patch` is optional; an
      // explicit `undefined` deletes the key. Mirrors `updateProperty`.
      type: "updateSaving";
      savingId: string;
      patch: Partial<Omit<Saving, "id">>;
    }
  | { type: "deleteSaving"; savingId: string }
  | {
      // Record a manually-entered balance — appends one point to the savings
      // account's `balanceHistory` (the current balance is the latest point).
      type: "addSavingBalance";
      savingId: string;
      point: SavingBalancePoint;
    }
  | {
      type: "updateSavingBalance";
      savingId: string;
      pointId: string;
      patch: Partial<Omit<SavingBalancePoint, "id">>;
    }
  | { type: "deleteSavingBalance"; savingId: string; pointId: string }
  // Loans — the money the user owes, rendered by the Loans sheet. Each
  // mutates `UserData.loans`. A mortgage loan links a property's mortgage
  // by carrying `propertyId` + `mortgageId` in the loan itself, so there
  // is no separate link action — linking / unlinking rides `addLoan` /
  // `updateLoan` (an explicit `undefined` in the patch deletes the key).
  | { type: "addLoan"; loan: Loan }
  | { type: "updateLoan"; loanId: string; patch: Partial<Omit<Loan, "id">> }
  | { type: "deleteLoan"; loanId: string }
  | {
      // Bulk-add from the Import payments modal — one undo entry.
      // `patterns` carries the normalised description keys learned from
      // the imported entries' bank text; the reducer unions them into
      // `loan.paymentPatterns` so future `importBankHistory` runs
      // auto-attach matching charges silently.
      type: "addLoanPayments";
      loanId: string;
      payments: LoanPayment[];
      patterns?: string[];
      // Metadata stamps the modal's "set type" / "rename" checkboxes
      // write back onto the imported entries' bank rows — the same
      // `userTypeId` / `userDescription` overrides `updateHistoryEntry`
      // patches, folded in here so the whole import stays one undo
      // entry. Absent field ⇒ leave that override untouched.
      entryOverrides?: LoanImportEntryOverride[];
    }
  | { type: "deleteLoanPayment"; loanId: string; paymentId: string }
  | { type: "deleteAllLoanPayments"; loanId: string }
  | {
      // Record a manually-entered outstanding balance — appends one point
      // to the loan's `balanceHistory` (the remaining balance anchors on
      // the latest point at-or-before the asked date).
      type: "addLoanBalance";
      loanId: string;
      point: LoanBalancePoint;
    }
  | { type: "deleteLoanBalance"; loanId: string; pointId: string }
  // Investments — the holdings catalog + private stocks rendered by the
  // Investment sheet. Holdings mutate `UserData.investmentHoldings`
  // (value points nest one level deep); stock positions mutate
  // `UserData.investmentStocks` (transactions + price points nest one
  // level deep). Mirror the property value-point / savings balance-point
  // shapes.
  | { type: "addInvestmentHolding"; holding: InvestmentHolding }
  | {
      // Edit one holding by id. Each field in `patch` is optional; an
      // explicit `undefined` deletes the key. Mirrors `updateProperty`.
      type: "updateInvestmentHolding";
      holdingId: string;
      patch: Partial<Omit<InvestmentHolding, "id">>;
    }
  | { type: "deleteInvestmentHolding"; holdingId: string }
  | {
      // Record a manually-entered market value — appends one point to the
      // holding's `valueHistory` (the current value is the latest point).
      type: "addInvestmentHoldingValue";
      holdingId: string;
      point: InvestmentValuePoint;
    }
  | {
      type: "deleteInvestmentHoldingValue";
      holdingId: string;
      pointId: string;
    }
  | { type: "addStockPosition"; position: StockPosition }
  | {
      // Edit one stock position by id (name, ownership, glyph, …). Each
      // field in `patch` is optional; an explicit `undefined` deletes the
      // key.
      type: "updateStockPosition";
      positionId: string;
      patch: Partial<Omit<StockPosition, "id">>;
    }
  | { type: "deleteStockPosition"; positionId: string }
  | {
      // Record a buy or sell — appends one signed-shares transaction to
      // the position (the share count and average cost are derived from
      // the log, never stored).
      type: "addStockTransaction";
      positionId: string;
      transaction: StockTransaction;
    }
  | {
      type: "deleteStockTransaction";
      positionId: string;
      transactionId: string;
    }
  | {
      // Record a manually-entered current price per share — appends one
      // point to the position's `priceHistory` (the current price is the
      // latest point).
      type: "addStockPrice";
      positionId: string;
      point: StockPricePoint;
    }
  | { type: "deleteStockPrice"; positionId: string; pointId: string }
  | { type: "addMortgage"; propertyId: string; mortgage: Mortgage }
  | {
      type: "updateMortgage";
      propertyId: string;
      mortgageId: string;
      patch: Partial<Omit<Mortgage, "id">>;
    }
  | { type: "deleteMortgage"; propertyId: string; mortgageId: string }
  | {
      // Bulk-add payments accepted from the "Find mortgage payments"
      // walk in one pass so the page doesn't re-render between inserts.
      type: "addMortgagePayments";
      propertyId: string;
      mortgageId: string;
      payments: MortgagePayment[];
    }
  | {
      // Property-level bulk-add from the "Find mortgage payments" walk:
      // each found combined transaction is split across the property's
      // mortgages, so payments land on several mortgages in one pass (one
      // undo entry, no intermediate re-render). Keyed by mortgage id.
      type: "addMortgagePaymentsForProperty";
      propertyId: string;
      paymentsByMortgageId: Record<string, MortgagePayment[]>;
    }
  | {
      type: "updateMortgagePayment";
      propertyId: string;
      mortgageId: string;
      paymentId: string;
      patch: Partial<Omit<MortgagePayment, "id">>;
    }
  | {
      type: "deleteMortgagePayment";
      propertyId: string;
      mortgageId: string;
      paymentId: string;
    }
  | {
      // Clear every recorded payment across all of a property's mortgages in
      // one pass (one undo entry) — the escape hatch when the recorded
      // payments are wrong and the user wants to re-run "Find mortgage
      // payments" from scratch.
      type: "deleteAllMortgagePayments";
      propertyId: string;
    }
  | {
      // Re-balance one charge across a property's mortgages in a single
      // pass (one undo entry). Editing one mortgage's share pins it and
      // re-splits the rest across the others (amortisation first, then
      // interest) so the parts still sum to the bank charge, so several
      // payment records change at once. Each update sets a payment's
      // amount + date by id.
      type: "setMortgageChargeSplit";
      propertyId: string;
      updates: {
        mortgageId: string;
        paymentId: string;
        amount: number;
        date: string;
      }[];
    }
  | {
      // Bulk-add repairs / renovations bound to a property in one pass —
      // each accepted from the "Add" candidate picker (a bank charge the
      // user tagged Repairs / Renovations). One undo entry, no intermediate
      // re-render. A no-op on an empty list.
      type: "addRepairs";
      propertyId: string;
      repairs: PropertyRepair[];
    }
  | {
      // Edit one repair's annotation / sources — its free-text description,
      // the optional Repairs / Renovations subtype, the set of additional
      // transactions, and the recomputed amount. Receipts are managed through
      // the `*RepairReceipt` actions, not patched here.
      type: "updateRepair";
      propertyId: string;
      repairId: string;
      patch: Partial<Omit<PropertyRepair, "id">>;
    }
  | { type: "deleteRepair"; propertyId: string; repairId: string }
  | {
      // Attach a receipt to a repair. The receipt covers part (or all) of the
      // repair's invoices and is owned by the repair, not any source
      // transaction — a job can carry several, each with its own date.
      type: "addRepairReceipt";
      propertyId: string;
      repairId: string;
      receipt: RepairReceipt;
    }
  | {
      // Edit one of a repair's receipts — its stored `path` (after a re-file)
      // and / or its `date`.
      type: "updateRepairReceipt";
      propertyId: string;
      repairId: string;
      receiptId: string;
      patch: Partial<Omit<RepairReceipt, "id">>;
    }
  | {
      // Detach one receipt from a repair. Removing the last one drops the
      // `receipts` key so the repair stays byte-identical to a reloaded one
      // (and re-surfaces the missing-receipt flag).
      type: "removeRepairReceipt";
      propertyId: string;
      repairId: string;
      receiptId: string;
    }
  | {
      // Save (or clear) a property's "Net sale profit" estimate — the
      // broker model, advertising cost, and the experiment slider's last
      // sale price. Passing `undefined` clears the saved estimate so the
      // estimator reverts to prefilling from the property's live data.
      type: "setPropertySaleEstimate";
      propertyId: string;
      estimate: PropertySaleEstimate | undefined;
    }
  | {
      // Record an uploaded file on a property — appends one `PropertyFile`
      // (its path in the backend's `properties/` store plus the metadata the
      // user entered). The bytes are written to the backend separately by the
      // attachment hook before this commits the reference.
      type: "addPropertyFile";
      propertyId: string;
      file: PropertyFile;
    }
  | {
      // Edit one property file's metadata by id — its description, tags, and
      // category. Each field in `patch` is optional; an explicit `undefined`
      // deletes the key (clears an optional field). The stored `path` is not
      // patched here (changing the category does not move existing bytes).
      type: "updatePropertyFile";
      propertyId: string;
      fileId: string;
      patch: Partial<Omit<PropertyFile, "id">>;
    }
  | { type: "deletePropertyFile"; propertyId: string; fileId: string }
  | { type: "addFileCategory"; category: FileCategory }
  | {
      // Edit a file category by id. Patch shape mirrors the Subtype / Tag
      // actions; `name` is the only editable field.
      type: "updateFileCategory";
      categoryId: string;
      patch: Partial<Omit<FileCategory, "id">>;
    }
  | {
      // Delete a file category. Clears `categoryId` on every property file
      // that referenced it (the file falls back to the `files/` root bucket);
      // no file is deleted and its stored `path` is left untouched — existing
      // bytes stay where they were uploaded. Mirrors `deleteSubtype`.
      type: "deleteFileCategory";
      categoryId: string;
    }
  | {
      // Import a property from a sale-handover archive as a NEW property. The
      // archive denormalizes its id references to names, so the import may
      // need to create companies / tags / file categories / repair subtypes
      // to re-link them — those are appended alongside the property in one
      // atomic action (a single undo step). The property's file / receipt
      // bytes are re-uploaded to the backend by the attachment hook before
      // this commits the references. New entities are deduped by the planner;
      // a missing list is treated as empty.
      type: "importProperty";
      property: Property;
      newCompanies?: Company[];
      newTags?: Tag[];
      newFileCategories?: FileCategory[];
      newSubtypes?: Subtype[];
    }
  | { type: "addSheet"; sheet: Sheet }
  | { type: "updateSheetMeta"; sheetId: string; meta: SheetDraft }
  | { type: "deleteSheet"; sheetId: string }
  | { type: "selectSheet"; sheetId: string }
  // Toggle a sheet's favorite flag. Turning a 4th favorite on is a
  // no-op (the bottom-bar favorites strip is capped at 3 so it can
  // never overflow); turning one off is always allowed.
  | { type: "toggleSheetFavorite"; sheetId: string }
  // Drop the `fromId` sheet in front of the `toId` sheet — the id-based
  // drag-to-reorder contract `useDragReorder` emits. Drives the
  // bottom-bar tab order and the sheet list in General settings.
  | { type: "reorderSheets"; fromId: string; toId: string }
  | {
      // Merge a parsed bank statement into the named account. The
      // reducer dedups entries against existing history (by content
      // hash), records a `HistoryImport` audit row, re-anchors the
      // account's `openingBalance` to the earliest entry's pre-row
      // balance, back-fills `bank` / `clearing` / `accountNumber` on
      // the target account (or savings account) when those fields are
      // empty, and drops any balance corrections whose date falls
      // inside the imported range (the bank is now authoritative
      // there). Pure: every payload field is data, so the action can
      // be replayed for tests.
      type: "importBankHistory";
      accountId: string;
      bankParserId: string;
      filename: string;
      bankName?: string;
      bankClearing?: string;
      bankAccountNumber?: string;
      entries: ParsedBankEntry[];
      now: number;
    }
  | {
      // Promote a recurring-detection candidate into a real series of
      // budget rows on the active budget. The action carries the full
      // payload the reducer needs — description, amount, glyph,
      // categoryId, dates — so the dispatcher stays a pure function of
      // its inputs (the candidate + the user's confirmed adjustments).
      // The reducer also records the chosen typeId as a merchant
      // hint (keyed by `sourceDescription` so future imports of the same
      // bank text resolve to it) and adds `key` to
      // `recurringDismissals` so the candidate disappears from the
      // panel — consumed candidates don't keep resurfacing on every
      // subsequent import.
      type: "promoteRecurringCandidate";
      sheetId: string;
      itemId: string;
      key: string;
      // Raw bank text from the detected candidate. Used as the
      // merchant-hint normalisation key so the hint matches future
      // imports of the same merchant, even when the user adjusted the
      // displayed `description` on the promote modal.
      sourceDescription: string;
      description: string;
      amount: number;
      typeId: string | null;
      dates: string[];
      now: number;
    }
  | {
      // Promote a single imported history entry into a recurring
      // series on the active budget. Mirrors `promoteRecurringCandidate`
      // for the row-minting half, then extends the recorded merchant
      // hint with the user-typed description and typeId so every
      // other history entry that normalises to the same merchant key
      // displays under the user's label without further writes.
      type: "promoteHistoryToRecurring";
      sheetId: string;
      itemId: string;
      // The bank-supplied description on the source history entry.
      // Used to normalise into the merchant-hint key — the user's
      // typed label drives the overlay but the key itself is bank-
      // text-derived so the lookup matches future imports too.
      sourceDescription: string;
      description: string;
      amount: number;
      typeId: string | null;
      // Company stamped on every minted future row and folded into the
      // merchant-hint when `applyToHistoric` is true so past synthesized
      // history rows inherit the same tag. `null` means "no company
      // override" — the row stays untagged.
      companyId: string | null;
      dates: string[];
      // When false, the merchant hint is not stamped — past entries
      // sharing the merchant key keep their raw bank text. The future
      // series still gets minted.
      applyToHistoric: boolean;
      // Account holding the source history entry. Used to locate the
      // history list in `state.history` when `excludedHistoryEntryIds`
      // is non-empty. `null` is a no-op for the exclusion stamp.
      accountId: string | null;
      // Per-entry opt-out from the merchant-hint overlay. Each id in
      // the list refers to a `HistoryEntry` in `state.history[accountId]`
      // and gets `hintIgnored: true` stamped on it so the synthesizer
      // keeps its raw bank text. Only consulted when `applyToHistoric`
      // is true — when the master toggle is off the hint isn't stamped
      // in the first place, so the per-entry flags would be redundant.
      excludedHistoryEntryIds: readonly string[];
      now: number;
    }
  | {
      // Persist a "Not recurring" dismissal so the detector skips this
      // bucket on every subsequent import. `key` is the candidate's
      // normalised description (the same key the detector and hint
      // store use). The settings UI clears the whole list via
      // `clearRecurringDismissals` so a misclick is recoverable.
      type: "dismissRecurringCandidate";
      key: string;
    }
  | {
      // Bulk variant of `dismissRecurringCandidate` for the panel's
      // "Dismiss all" button — adds every key in one reducer pass so
      // the panel doesn't re-render between dismissals.
      type: "dismissRecurringCandidates";
      keys: readonly string[];
    }
  | { type: "clearRecurringDismissals" }
  | {
      // Collapse one detected cross-account pair into a single
      // Transfer and mark both HistoryEntrys as `hidden: true` with
      // the new transfer's id stored on `collapsedIntoTransferId`
      // so the operation is reversible (delete the tx → clear the
      // backref → un-hide) and idempotent (subsequent runs skip
      // already-collapsed pairs).
      type: "collapseTransferPair";
      fromAccountId: string;
      toAccountId: string;
      fromEntryId: string;
      toEntryId: string;
      date: string;
      description: string;
      amount: number;
    }
  | {
      // Persist a "Never collapse this pair" dismissal so the detector
      // stops re-surfacing it. The key is the pair's stable identifier
      // (sorted entry ids joined). `clearTransferDismissals` unwinds
      // the list from settings.
      type: "dismissTransferPair";
      pairKey: string;
    }
  | { type: "clearTransferDismissals" }
  | { type: "clearMerchantHints" }
  | {
      // Append a new wildcard match rule to `UserData.matchRules`. The
      // rule labels every history entry whose raw description matches
      // its pattern; rendered through `synthesizeHistoryRow` so past
      // and future imports both pick it up without rewriting any
      // stored entries.
      type: "createMatchRule";
      rule: MatchRule;
    }
  | {
      // Replace one rule in place, identified by `rule.id`. No-op if
      // the id is unknown so a stale modal can't silently append a
      // new rule under an old id.
      type: "updateMatchRule";
      rule: MatchRule;
    }
  | { type: "deleteMatchRule"; ruleId: string }
  | {
      // Swap a rule with its neighbour in `matchRules`. Earlier in the
      // array = higher priority, so "up" lifts a rule above the rules
      // that currently shadow it and "down" demotes it. No-op at the
      // ends of the array, or if the rule id is unknown.
      type: "moveMatchRule";
      ruleId: string;
      direction: "up" | "down";
    }
  | {
      // Manually walk every budget row and re-evaluate against the
      // current ruleset. The reducer already runs this walk on
      // `createMatchRule` / `updateMatchRule`, so the only reason to
      // dispatch this directly is the Patterns settings tab's
      // "Reapply all" button — it lets the user sweep without
      // pretending to edit a rule. No-ops when no rule wins anything
      // new (state is referentially identical so React skips a
      // wasted render).
      type: "reapplyMatchRules";
    }
  | {
      // One-shot application of a match rule that the user explicitly
      // chose NOT to persist (the "Save pattern" checkbox in the
      // Label-by-pattern modal). Stamps every matching budget row
      // with the rule's typeId + `typeIdLocked: true`, and every
      // matching history entry with `userTypeId` (and
      // `userDescription` when the rule carries one). The rule
      // itself is discarded — handy when the user wants to bulk-label
      // older entries from a merchant they'll never see again.
      type: "applyMatchRuleOnce";
      rule: MatchRule;
    }
  | {
      // Per-entry override on a single `HistoryEntry`. Patches the
      // entry's `userDescription` and / or `userTypeId` in place so
      // the synthesized row picks the override up at the top of the
      // merge priority in `synthesizeHistoryRow`. Each patch field is
      // a tri-state: `undefined` = don't touch, `null` (typeId only)
      // or `""` (description) = clear the override, a non-empty
      // string = set the override.
      type: "updateHistoryEntry";
      accountId: string;
      entryId: string;
      patch: {
        userDescription?: string;
        userTypeId?: string | null;
        userCompanyId?: string | null;
        // Full replacement of the entry's per-entry tag override.
        // `undefined` leaves the existing `userTagIds` untouched; an
        // empty array clears it. The synthesizer unions these with any
        // matching rule's tags, so clearing the per-entry set still
        // leaves the row carrying whatever a rule contributes.
        userTagIds?: string[];
        isTransfer?: boolean;
        // `true` stamps the "no company applies" flag so metadata
        // mode stops surfacing the entry over a missing company.
        // `false` clears it. `undefined` leaves the flag untouched.
        noCompany?: boolean;
      };
    }
  | {
      // Metadata-mode bulk apply. Stamps the labels the user gave one
      // history entry onto its lookalikes — every other entry on the
      // same account whose raw bank description matches `pattern` (a
      // glob derived from the source entry, dates / ref numbers
      // stripped). Fills BLANK fields only (a per-entry override on a
      // match is never overwritten); tags union. The source entry is
      // excluded — it's saved through `updateHistoryEntry` separately.
      type: "applyMetadataToMatchingHistory";
      accountId: string;
      pattern: string;
      excludeEntryId: string;
      patch: {
        userDescription?: string;
        userTypeId?: string;
        userCompanyId?: string;
        userTagIds?: readonly string[];
        noCompany?: boolean;
      };
    }
  | {
      // Split a bank-statement entry into multiple categorised parts.
      // `splits` is the full decomposition — the validator (and the
      // modal) ensure the signed amounts sum to the entry's bank
      // amount so the running balance stays anchored. An empty array
      // clears the existing split (back to single-row rendering).
      type: "splitHistoryEntry";
      accountId: string;
      entryId: string;
      splits: HistoryEntrySplit[];
    }
  | {
      // Apply user choices from the post-import reconciliation modal.
      // `mergedRowIds` are user rows the user confirmed map to a
      // history entry — they're deleted in a single transition.
      // `entryOverrides` carry the curated description / typeId from
      // each merged row, stamped onto the matching history entry as
      // `userDescription` / `userTypeId` so the user's fine-tuning
      // survives the row deletion. Only blank fields on the entry are
      // filled — prior per-entry overrides are preserved.
      // `seriesRules` are auto-reconciliation rules learned from
      // "Apply to whole series" — appended verbatim.
      // `orphans` carry per-row triage decisions for predictions
      // that didn't post: either "delete" the row outright, or
      // "move" it to a new date (typically the next payday).
      type: "applyReconciliation";
      accountId: string;
      mergedRowIds: string[];
      entryOverrides: Array<{
        historyEntryId: string;
        userDescription?: string;
        userTypeId?: string;
        userSeriesId?: string;
      }>;
      seriesRules: SeriesMatchRule[];
      orphans: Array<
        | { rowId: string; action: "delete" }
        | { rowId: string; action: "move"; toDate: string }
      >;
    }
  | {
      // Achievement unlock. Idempotent: if `id` is already present in
      // `settings.achievements`, the action is a no-op so timestamps
      // never get overwritten. New unlocks land in `achievements` (with
      // the timestamp) and `unseenAchievements` (the queue the
      // HeaderStar reads to decide whether to glow).
      type: "recordAchievementUnlock";
      id: string;
      timestamp: number;
    }
  | {
      // Dispatched when the user dismisses the achievement-unlock
      // modal — clears the unseen queue but leaves the unlocked map
      // untouched. Empties to `[]`; if the queue is already empty the
      // state object is returned unchanged so React doesn't re-render
      // dependents pointlessly.
      type: "clearUnseenAchievements";
    }
  | {
      // Apply user-accepted predictions from the `AccountRenamePredictorModal`
      // — the last step of an import that has rename suggestions to
      // offer. Each entry in `renames` stamps `userDescription` on the
      // matching history entry. Distinct from `updateHistoryEntry`:
      // this action does NOT feed the learning hook (the suggestion
      // came from an existing learned pattern by definition, so
      // re-recording would be circular). Instead, the matching
      // pattern's `hitCount` / `lastUsedAt` get bumped so accepted
      // predictions float to the top of future rounds. When the user
      // edits the suggested text inline before accepting — i.e. the
      // accepted text differs from what the pattern holds — the
      // accepted text is recorded as a fresh rename so the next import
      // suggests the edited version.
      type: "applyImportRenames";
      accountId: string;
      renames: Array<{
        entryId: string;
        userDescription: string;
        // Optional company learned alongside the description on the
        // matching `RenamePattern`. Absent when the pattern has none —
        // the reducer leaves `userCompanyId` on the entry untouched
        // in that case.
        userCompanyId?: string;
      }>;
    }
  | {
      // Set / clear the "primary income" flag for a recurring series.
      // When `isPrimaryIncome` is true, every existing row in the series
      // is re-scanned and gets its `fiscalMonthShift` recomputed from
      // `anchorDayOfMonth` so the cascade applies retroactively. When
      // false, the metadata entry is dropped and every existing row in
      // the series has its `fiscalMonthShift` cleared.
      type: "setSeriesPrimaryIncome";
      seriesId: string;
      isPrimaryIncome: boolean;
      anchorDayOfMonth: number | null;
    }
  | {
      // Manual per-entry fiscal-month override for a bank-imported
      // history entry. Mirrors `setRowFiscalMonthShift` but routes
      // through `UserData.history` (the source of truth for synthesized
      // history rows). `shift === null` clears the field.
      type: "setHistoryEntryFiscalMonthShift";
      accountId: string;
      entryId: string;
      shift: -1 | 1 | null;
    }
  | {
      // Toggle the "primary income" flag for the merchant a history
      // entry represents (keyed by the normalised description). When
      // true, the merchant is recorded in `UserData.primaryIncomeMerchants`
      // with `anchorDayOfMonth` and every existing history entry whose
      // normalised description matches the key gets `fiscalMonthShift`
      // recomputed against that anchor. When false, the merchant is
      // dropped and the shift is cleared on every matching entry.
      type: "setHistoryEntryPrimaryIncome";
      accountId: string;
      entryId: string;
      isPrimaryIncome: boolean;
      anchorDayOfMonth: number | null;
    }
  | {
      // Drop one learned primary-income merchant outright. Clears the
      // auto-stamped `fiscalMonthShift` on every matching entry across
      // every account. Used by the settings management surface when the
      // user wants to retire an old job's pattern after switching.
      type: "removePrimaryIncomeMerchant";
      key: string;
    };

export function reducer(state: UserData, action: Action): UserData {
  if (action.type === "replace") return action.data;

  // Domain sub-reducers — each returns the next state when it handles
  // the action, or null to defer to the next reducer in the chain.
  const handled =
    reduceAchievements(state, action) ??
    reduceSheets(state, action) ??
    reduceSettings(state, action) ??
    reduceCategoriesAndTypes(state, action) ??
    reduceItems(state, action) ??
    reduceProperties(state, action) ??
    reduceSavings(state, action) ??
    reduceLoans(state, action) ??
    reduceInvestments(state, action) ??
    reduceMatchRules(state, action) ??
    reduceTransfers(state, action) ??
    reduceRecurring(state, action) ??
    reduceAccounts(state, action) ??
    reduceSalary(state, action) ??
    reduceHistory(state, action) ??
    reduceSeriesMetadata(state, action) ??
    reduceHistoryPrimaryIncome(state, action);
  if (handled !== null) return handled;

  // Item-level dispatch tail. Walks the sheet-type registry until one
  // descriptor's `reduceItem` claims the action; falls through to the
  // defensive `state` fallback when the action is not an item action
  // (unreachable at runtime — the union is closed).
  for (const descriptor of SHEET_TYPE_REGISTRY) {
    const next = descriptor.reduceItem?.(state, action);
    if (next !== undefined && next !== null) return next;
  }
  return state;
}
