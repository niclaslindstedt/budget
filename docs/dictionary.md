# Dictionary

Maps the words the user (and the team) say in plain English to the
concrete components, types, and files in this codebase. **This file is
the index**: each row resolves a term to the most specific file and the
symbols to grep for, and stops there.

**The explanation for every term lives in [`docs/overview.md`](overview.md)**
— same headings, one-to-one. Look a word up here to find the code; read
the same word in the overview to understand how it behaves and what it
touches. Deep module / persisted-shape mechanics live in
[`docs/architecture.md`](architecture.md); the codified rules live in
`AGENTS.md`.

**When an agent encounters a term in user instructions that is not a
literal filename or import path**, look it up here first to resolve it
to the right code surface before searching. **When a new feature ships
or the user introduces a new word**, add a row here AND a matching
`overview.md` entry — same pull request, alongside the code change — so
the next agent doesn't have to guess.

Entries are alphabetical within each section. The `[→]` link in each row
points at the term's full description in `overview.md`.

## Canonical vocabulary

One verb / noun per concept across components, i18n strings, and
file names. Honour these when naming a new file, key, or string —
the deviations were the source of the duplication the codebase had
to clean up.

| Concept                             | Canonical                                                       | Retire                                                                   |
| ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Mutate an existing thing via a form | **Edit** (`BudgetEditEntryModal`, `t("common.edit")`)           | `Modify`, `Update` (kept only for the `UpdateBalance` balance assertion) |
| Create a new thing                  | **New** (modal title) / **Add** (inline button)                 | `Create` in modal copy                                                   |
| Destroy a thing                     | **Delete** (`t("common.delete")`)                               | `Remove` (kept only for the column-removal control)                      |
| Confirm a primary action            | **Save** (forms) / **Apply** (bulk) / **Create** (new resource) | bare `OK`, `Done` for primary CTAs                                       |
| Dismiss without commit              | **Cancel** (`t("common.cancel")`)                               | `Close`, `Dismiss` on modals that have a footer                          |
| User-added row in the budget page   | **entry** (UI copy) / `Row` (code type)                         | "transaction" outside the imported-bank-line context                     |
| Imported bank line                  | **transaction** (UI) / `HistoryEntry` (code)                    | —                                                                        |
| Cross-account money movement        | **transfer** (UI) / `Transfer` (code)                           | —                                                                        |
| Overlay with backdrop               | `*Modal.tsx`                                                    | `*Popover.tsx` (not used in this codebase)                               |
| Confirm / choose UI                 | `*Dialog.tsx`                                                   | —                                                                        |
| Non-blocking floating UI            | `*Panel.tsx`                                                    | —                                                                        |
| Custom dropdown                     | `*Picker.tsx`                                                   | native `<select>`                                                        |
| Kebab menu attached to a row        | `*ActionsMenu.tsx`                                              | bare `*Menu.tsx` (reserved for sheet-level chrome menus)                 |
| Page-specific component file        | `Budget*` / `Account*` prefix                                   | unprefixed names inside a page directory                                 |

## Top-level UI

| Term                                                                     | Refers to                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App shell**                                                            | `src/components/AppShell.tsx`. [→](overview.md#app-shell)                                                                                                                                                                                                                              |
| **Action history** / **action summary**                                  | `ActionHistoryModal.tsx`; `formatActionLabel` (`src/components/action-history-label.ts`), `describeActionSubject` (`src/data/action-summary.ts`). [→](overview.md#action-history)                                                                                                      |
| **Workspace**                                                            | `UserData` graph (`src/data/types.ts`). [→](overview.md#workspace)                                                                                                                                                                                                                     |
| **Sheet**                                                                | `Sheet` on `UserData.sheets[]` (`src/data/types.ts`). [→](overview.md#sheet)                                                                                                                                                                                                           |
| **Active sheet**                                                         | `UserData.activeSheetId`. [→](overview.md#active-sheet)                                                                                                                                                                                                                                |
| **Sheet type**                                                           | `Sheet.type`; `SHEET_TYPE_REGISTRY` (`src/data/sheet-types/`). [→](overview.md#sheet-type)                                                                                                                                                                                             |
| **Page**                                                                 | the routing switch in `AppShell.tsx`. [→](overview.md#page)                                                                                                                                                                                                                            |
| **Bottom bar**                                                           | `src/components/BottomBar.tsx`. [→](overview.md#bottom-bar)                                                                                                                                                                                                                            |
| **Favorite sheet** / **favorites strip**                                 | `Sheet.favorite`, `MAX_FAVORITE_SHEETS` (`src/data/sheet.ts`), `FavoriteSheetButton`, `toggle-sheet-favorite`. [→](overview.md#favorite-sheet)                                                                                                                                         |
| **Sheet switcher** / **sheets dropdown**                                 | `src/components/SheetSwitcher.tsx`. [→](overview.md#sheet-switcher)                                                                                                                                                                                                                    |
| **Sheet title** / **title menu**                                         | `src/components/SheetTitleMenu.tsx`. [→](overview.md#sheet-title)                                                                                                                                                                                                                      |
| **Sheet modal** / **edit-sheet modal**                                   | `src/components/SheetModal.tsx`. [→](overview.md#sheet-modal)                                                                                                                                                                                                                          |
| **Header menu** / **burger menu**                                        | `src/components/HeaderMenu.tsx`. [→](overview.md#header-menu)                                                                                                                                                                                                                          |
| **Header star**                                                          | `src/components/HeaderStar.tsx`. [→](overview.md#header-star)                                                                                                                                                                                                                          |
| **Changelog** / **What's new** / **feature doc** / **"Learn more" link** | `src/components/ChangelogModal.tsx` (renders markdown bullets, opens feature docs inline); markdown via `src/components/markdown.ts` + `Markdown.tsx`; feature docs `docs/features/*.md` → `src/generated/feature-docs.ts` (`vite/feature-docs-plugin.ts`). [→](overview.md#changelog) |

## Budget page

The per-account ledger. Sheet type `"budget"`. Files live in
`src/components/budget/`.

| Term                                                                                            | Refers to                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Budget page** / **budget sheet** / **budget ledger**                                          | `BudgetPage.tsx`. [→](overview.md#budget-page)                                                                                                                       |
| **Budget viewer modal** / **view-mode** / **read-only budget**                                  | `BudgetViewerModal.tsx`. [→](overview.md#budget-viewer-modal)                                                                                                        |
| **Month table**                                                                                 | `BudgetMonthTable.tsx`. [→](overview.md#month-table)                                                                                                                 |
| **Budget row** / **budget entry** / **row**                                                     | `BudgetRow.tsx`; `Row` (`src/data/types.ts`). [→](overview.md#budget-row)                                                                                            |
| **Budget cell** / **cell**                                                                      | `BudgetCell.tsx`. [→](overview.md#budget-cell)                                                                                                                       |
| **Column header**                                                                               | `BudgetColumnHeader.tsx`. [→](overview.md#column-header)                                                                                                             |
| **Add-entry button** / **add-row button**                                                       | `BudgetAddEntryButton.tsx`. [→](overview.md#add-entry-button)                                                                                                        |
| **Covered-month footer** / **orange triage CTA** / **"entries to move or delete"**              | `OrphanIndicator.tsx`. [→](overview.md#covered-month-footer)                                                                                                         |
| **Entry actions menu** / **row actions menu**                                                   | `BudgetEntryActionsMenu.tsx`. [→](overview.md#entry-actions-menu)                                                                                                    |
| **Salary entry actions menu**                                                                   | `SalaryEntryActionsMenu.tsx`. [→](overview.md#salary-entry-actions-menu)                                                                                             |
| **Item entry actions menu**                                                                     | `src/components/items/ItemEntryActionsMenu.tsx`. [→](overview.md#item-entry-actions-menu)                                                                            |
| **Attachment modal**                                                                            | `AttachmentUploadModal` (`src/components/AttachmentUploadModal.tsx`). [→](overview.md#attachment-modal)                                                              |
| **Edit-entry modal**                                                                            | `BudgetEditEntryModal.tsx`; `BudgetEditSeriesForm`, `BudgetPromoteHistoryForm`, `BudgetPromoteToSeriesForm`. [→](overview.md#edit-entry-modal)                       |
| **Edit-entry full modal** / **edit-row modal**                                                  | `BudgetEditEntryFullModal.tsx`. [→](overview.md#edit-entry-full-modal)                                                                                               |
| **Split entry modal** / **split modal**                                                         | `BudgetSplitEntryModal.tsx`. [→](overview.md#split-entry-modal)                                                                                                      |
| **Complex entry modal**                                                                         | `BudgetComplexEntryModal.tsx`. [→](overview.md#complex-entry-modal)                                                                                                  |
| **Amount span** / **estimate range** / **min/estimate/max**                                     | `BudgetAmountSpanFields.tsx`; `budget-amount-span.ts`, `amountWithinSpan` (`src/data/reconciliation.ts`). [→](overview.md#amount-span)                               |
| **Bulk edit modal** / **move-copy modal** / **apply-series dialog**                             | `BudgetBulkEditModal.tsx`, `BudgetMoveCopyModal.tsx`, `BudgetApplySeriesDialog.tsx`. [→](overview.md#bulk-edit-modal)                                                |
| **Bulk action bar** / **select-many toolbar**                                                   | `src/components/BulkActionBar.tsx`. [→](overview.md#bulk-action-bar)                                                                                                 |
| **Match rule modal** / **pattern modal** / **label similar modal** / **label by pattern modal** | `BudgetMatchRuleModal.tsx`; `budget-match-rule-modal-reducer.ts`. [→](overview.md#match-rule-modal)                                                                  |
| **Find conflicts modal** / **duplicate finder** / **duplicates modal**                          | `BudgetFindConflictsModal.tsx`; `src/data/budget/conflicts.ts`. [→](overview.md#find-conflicts-modal)                                                                |
| **Metadata mode** / **metadata modal**                                                          | `BudgetMetadataModal.tsx`; `budget-metadata-split-reducer.ts`, `applyMetadataToMatchingHistory` (`src/data/budget/pattern-apply.ts`). [→](overview.md#metadata-mode) |
| **Recurring candidates panel**                                                                  | `BudgetRecurringCandidatesPanel.tsx`. [→](overview.md#recurring-candidates-panel)                                                                                    |
| **Recurrence form**                                                                             | `BudgetRecurrenceForm.tsx`. [→](overview.md#recurrence-form)                                                                                                         |
| **Entry search modal** / **transfer search modal** / **Search**                                 | `BudgetTransferSearchModal.tsx`, `BudgetTransferSearchFilterMenu.tsx`; `runSearch` / `SearchFilter` (`src/data/search.ts`). [→](overview.md#entry-search-modal)      |
| **Search settings** / **search ranking** / **relevance settings**                               | `SettingsModal/tabs/search.tsx` (`SearchTab`); `SearchRankingSettings`, `scoreEntry` (`src/data/search.ts`). [→](overview.md#search-settings)                        |
| **Formula** / **formula input**                                                                 | `BudgetFormulaInput.tsx`; `src/data/budget/formula*.ts`. [→](overview.md#formula)                                                                                    |

## Accounts page

The workspace dashboard. Sheet type `"accounts"`. Files live in
`src/components/accounts/`.

| Term                                                                           | Refers to                                                                                     |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **Accounts page** / **accounts sheet** / **accounts overview** / **dashboard** | `AccountsPage.tsx`. [→](overview.md#accounts-page)                                            |
| **Account**                                                                    | `Account` (`src/data/types.ts`). [→](overview.md#account)                                     |
| **Account modal**                                                              | `AccountModal.tsx`. [→](overview.md#account-modal)                                            |
| **Account actions menu**                                                       | `AccountActionsMenu.tsx`. [→](overview.md#account-actions-menu)                               |
| **Update balance modal** / **balance correction**                              | `UpdateBalanceModal.tsx`. [→](overview.md#update-balance-modal)                               |
| **Transfer**                                                                   | `Transfer` (`UserData.transfers`, `src/data/types.ts`). [→](overview.md#transfer)             |
| **Transfer modal**                                                             | `AccountTransferModal.tsx`. [→](overview.md#transfer-modal)                                   |
| **Transfers modal** / **transfer log**                                         | `AccountTransfersModal.tsx`. [→](overview.md#transfers-modal)                                 |
| **History** / **bank history** / **imported entries**                          | `HistoryEntry` (`UserData.history[accountId]`, `src/data/types.ts`). [→](overview.md#history) |
| **History modal** / **history viewer**                                         | `HistoryModal.tsx`. [→](overview.md#history-modal)                                            |
| **Import history modal**                                                       | `ImportHistoryModal.tsx`. [→](overview.md#import-history-modal)                               |
| **History entry edit modal**                                                   | `EditHistoryEntryModal.tsx`. [→](overview.md#history-entry-edit-modal)                        |
| **Cut history modal**                                                          | `AccountCutHistoryModal.tsx`. [→](overview.md#cut-history-modal)                              |
| **Reconciliation modal**                                                       | `AccountReconciliationModal.tsx`. [→](overview.md#reconciliation-modal)                       |
| **Transfer collapse modal**                                                    | `AccountTransferCollapseModal.tsx`. [→](overview.md#transfer-collapse-modal)                  |
| **Rename predictor**                                                           | `AccountRenamePredictorModal.tsx`. [→](overview.md#rename-predictor)                          |

## Items page

The owned-items catalog. Sheet type `"items"`. Files live in
`src/components/items/`.

| Term                                                 | Refers to                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Items page** / **Items sheet** / **items catalog** | `ItemsPage.tsx`; `ItemsView`, `UserData.items`. [→](overview.md#items-page)                                                          |
| **Item row**                                         | `ItemRow.tsx`; `computeItemCurrentValue` (`src/data/items/value.ts`). [→](overview.md#item-row)                                      |
| **Current value** / **resale value**                 | `computeItemCurrentValue`, `isItemOwned` (`src/data/items/value.ts`). [→](overview.md#current-value-item)                            |
| **Find items modal** / **find items**                | `ItemFinderModal.tsx`; `findItemPurchaseCandidates` (`src/data/items/find.ts`), `open-find-items`. [→](overview.md#find-items-modal) |
| **Exclude similar** (find items)                     | `excludeSimilarItemEntries`, `UserData.itemFindExclusionPatterns`. [→](overview.md#exclude-similar)                                  |
| **Items settings tab**                               | `SettingsModal/tabs/items.tsx` (`ItemsTab`). [→](overview.md#items-settings-tab)                                                     |

## Salary page

Salary over time. Sheet type `"salary"`. Files live in
`src/components/salary/`; data helpers in `src/data/salary/`.

| Term                                      | Refers to                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Salary page** / **Salary sheet**        | `SalaryPage.tsx`; `SalaryView`, `useSalaryBulkSelection`. [→](overview.md#salary-page)                                                                   |
| **Salary row**                            | `SalaryRow.tsx`. [→](overview.md#salary-row)                                                                                                             |
| **Salary account**                        | `SalaryView.accountId`; `setItemAccount`. [→](overview.md#salary-account)                                                                                |
| **Salary** (object) / **paycheck**        | `Salary` (`src/data/types/salary.ts`); `SalaryAddModal.tsx`, `SalaryEditModal.tsx`. [→](overview.md#salary-object)                                       |
| **Find salaries**                         | `SalaryDiscoveryModal.tsx`; `discoverSalaries` (`src/data/salary/discovery.ts`). [→](overview.md#find-salaries)                                          |
| **Employer** / **Role** / **job title**   | `Employer` (`UserData.employers`), `EmployerManageModal.tsx`, `EmployerPicker.tsx`; `roleForSalary`, `bulkSetSalaryRole`. [→](overview.md#employer)      |
| **Bulk tax rate** / **skattejämkning**    | `SalaryBulkEditModal.tsx`; `grossFromNetAndRate`, `bulkSetSalaryTaxRate`. [→](overview.md#bulk-tax-rate)                                                 |
| **Tax profile**                           | `TaxProfile` (`UserData.taxProfiles`); `TaxProfileModal.tsx`, `TaxProfilePicker.tsx`. [→](overview.md#tax-profile)                                       |
| **Estimated gross** / **tax calculation** | `resolveSalary` / `resolveSalaryGross` (`src/data/salary/salary.ts`), `grossFromNetMonthly` (`src/data/tax/engine.ts`). [→](overview.md#estimated-gross) |
| **Municipality picker**                   | `MunicipalityPicker.tsx`; `MUNICIPALITIES` (`src/data/tax/se/municipalities.ts`). [→](overview.md#municipality-picker)                                   |

## Properties page

Owned homes, mortgages, and repairs. Sheet type `"properties"`. Files
live in `src/components/properties/`; data helpers in
`src/data/property-mortgage/`, `src/data/property-repairs/`, and
`src/data/property-transfer/` (sale-handover export / import).

| Term                                                | Refers to                                                                                                                                                                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Properties page** / **Properties sheet**          | `src/components/properties/PropertiesPage.tsx`; `PropertiesView`, `UserData.properties`. [→](overview.md#properties-page)                                                                                                                                            |
| **Property** (object)                               | `Property` (`src/data/types/properties.ts`); `PropertyEditorModal.tsx`, `PropertyCard.tsx`. [→](overview.md#property)                                                                                                                                                |
| **Property size** / **size unit**                   | `Property.size`, `Settings.propertySizeUnit`. [→](overview.md#property-size)                                                                                                                                                                                         |
| **Property rooms**                                  | `Property.rooms`; `PropertyEditorModal.tsx`, `PropertyCard.tsx`. [→](overview.md#property-rooms)                                                                                                                                                                     |
| **Property fee** / **monthly fee** / **avgift**     | `Property.fee`; `PropertyEditorModal.tsx`, `PropertyCard.tsx`. [→](overview.md#property-fee)                                                                                                                                                                         |
| **Property settings tab**                           | `SettingsModal/tabs/properties.tsx` (`PropertiesTab`) — size unit, repair / renovation subtypes, file categories. [→](overview.md#property-settings-tab)                                                                                                             |
| **Current value** / **value history**               | `PropertyValuePoint` (`Property.valueHistory`); `resolveValueHistory` / `currentPropertyValue` (`src/data/property-value/value.ts`); `UpdatePropertyValueModal.tsx`, `addPropertyValue`. [→](overview.md#current-value-property)                                     |
| **Mortgage** (object)                               | `Mortgage` (`src/data/types/properties.ts`); `MortgageEditorModal.tsx`, `resolveMonthlyAmortization`. [→](overview.md#mortgage)                                                                                                                                      |
| **Mortgage payoff bar** / **power bar**             | `mortgagePayoffProgress` (`src/data/property-mortgage/progress.ts`). [→](overview.md#mortgage-payoff-bar)                                                                                                                                                            |
| **Unified mortgage view** / **split view**          | `UnifiedMortgageView` (`PropertyCard.tsx`); `MortgageViewToggle.tsx` (the segmented view toggle); `aggregateMortgages` (`src/data/property-mortgage/aggregate.ts`). [→](overview.md#unified-mortgage-view)                                                           |
| **Mortgage section actions**                        | The view-payments + find-payments glyph buttons in a property card's "MORTGAGES" header (`PropertyCard.tsx`). [→](overview.md#mortgage-section-actions)                                                                                                              |
| **Mortgage rate change**                            | `MortgageRateChange` (`Mortgage.rateHistory`); `resolveRateAt` (`src/data/property-mortgage/interest.ts`). [→](overview.md#mortgage-rate-change)                                                                                                                     |
| **Mortgage payment**                                | `MortgagePayment` (`Mortgage.payments`); `splitPaymentAcrossMortgages`, `splitRecordedPayment` (`src/data/property-mortgage/payment.ts`). [→](overview.md#mortgage-payment)                                                                                          |
| **Mortgage payments view**                          | `MortgagePaymentsModal.tsx`; `groupPaymentsByCharge`, `setMortgageChargeSplit`, `reconcileMortgageAmortization`. [→](overview.md#mortgage-payments-view)                                                                                                             |
| **Find mortgage payments**                          | `MortgageDiscoveryModal.tsx`; `discoverMortgagePayments` (`src/data/property-mortgage/discovery.ts`), `addMortgagePaymentsForProperty`. [→](overview.md#find-mortgage-payments)                                                                                      |
| **Property repair** / **repair** / **renovation**   | `PropertyRepair` (`Property.repairs`, `src/data/types/properties.ts`); `addRepairs` / `updateRepair` / `deleteRepair`, `repairSources` (`src/data/property-repairs/sources.ts`). [→](overview.md#property-repair)                                                    |
| **Repair receipt** / **repair receipts**            | `RepairReceipt` (`PropertyRepair.receipts`, `src/data/types/properties.ts`); `repairReceipts` / `hasReceipt` (`src/data/property-repairs/receipts.ts`); `addRepairReceipt` / `updateRepairReceipt` / `removeRepairReceipt`. [→](overview.md#repair-receipt)          |
| **Repair receipts modal** / **manage receipts**     | `RepairReceiptsModal.tsx`; `uploadRepairReceipt` / `replaceRepairReceipt` / `setRepairReceiptDate` / `renameRepairReceipts`. [→](overview.md#repair-receipts-modal)                                                                                                  |
| **Repairs and renovations modal** / **wrench view** | `RepairsModal.tsx`; `RepairEntryActionsMenu`. [→](overview.md#repairs-and-renovations-modal)                                                                                                                                                                         |
| **Add repairs picker** / **quick add**              | `RepairsAddModal.tsx`; `findRepairCandidates` (`src/data/property-repairs/candidates.ts`). [→](overview.md#add-repairs-picker)                                                                                                                                       |
| **Repair editor**                                   | `RepairsEditModal.tsx`; `derivePrimary`, `resolveRepairSourceRows`. [→](overview.md#repair-editor)                                                                                                                                                                   |
| **Manual repair editor** / **add repair manually**  | `ManualRepairModal.tsx`. [→](overview.md#manual-repair-editor)                                                                                                                                                                                                       |
| **Receipt target** / **receipt manager**            | `TxnReceiptTarget`, `resolveTxnReceipt` (`src/data/receipts/target.ts`), `useReceiptManager` (`src/components/AppShell/hooks/`) — transaction receipts only. [→](overview.md#receipt-target)                                                                         |
| **Property attachments**                            | `usePropertyAttachments` (`src/components/properties/`); the per-property `properties/` store (repair receipts + uploaded files). [→](overview.md#property-attachments)                                                                                              |
| **Property file**                                   | `PropertyFile` (`Property.files`, `src/data/types/properties.ts`); `addPropertyFile` / `updatePropertyFile` / `deletePropertyFile`. [→](overview.md#property-file)                                                                                                   |
| **File category**                                   | `FileCategory` (`UserData.fileCategories`); `FileCategoriesAdmin`, `addFileCategory` / `updateFileCategory` / `deleteFileCategory`. [→](overview.md#file-category)                                                                                                   |
| **Property files modal** / **upload file**          | `PropertyFilesModal.tsx`; `uploadPropertyFile` / `replacePropertyFile`. [→](overview.md#property-files-modal)                                                                                                                                                        |
| **File category picker**                            | `FileCategoryPicker.tsx` (`src/components/properties/`). [→](overview.md#file-category-picker)                                                                                                                                                                       |
| **Property actions menu**                           | `PropertyActionsMenu.tsx`. [→](overview.md#property-actions-menu)                                                                                                                                                                                                    |
| **Property export / import** / **sale handover**    | `PropertyExportModal.tsx`, `PropertyImportModal.tsx`; `buildPropertyExport` / `planPropertyImport` (`src/data/property-transfer/`); `exportProperty` / `importProperty` (`usePropertyAttachments`), `importProperty` action. [→](overview.md#property-export-import) |
| **Private file**                                    | `PropertyFile.private`; toggled in `PropertyFilesModal.tsx`. [→](overview.md#private-file)                                                                                                                                                                           |
| **Net sale profit** / **sale estimator**            | `NetSaleProfitModal.tsx`; `computePropertySale` (`src/data/tax/engine.ts`), `setPropertySaleEstimate`. [→](overview.md#net-sale-profit)                                                                                                                              |
| **Broker cost** (model)                             | `BrokerCost` (`src/data/tax/types.ts`); `brokerFee` (`src/data/tax/se/property-sale.ts`). [→](overview.md#broker-cost)                                                                                                                                               |
| **Visualize value** / **value chart**               | `PropertyValueChartModal.tsx`; `buildPropertyValueSeries` (`src/data/property-value/series.ts`); `LineChart` (`src/components/charts/LineChart.tsx`), `useThemeTokens` (`src/hooks/useThemeTokens.ts`). [→](overview.md#visualize-value)                             |
| **Line chart** (primitive)                          | `LineChart` (`src/components/charts/LineChart.tsx`); reads theme tokens via `useThemeTokens`. [→](overview.md#line-chart)                                                                                                                                            |
| **Location** (setting)                              | `Settings.location`; `LOCATIONS` (`src/data/tax/engine.ts`). [→](overview.md#location)                                                                                                                                                                               |

## Savings page

Savings accounts — money set aside (a buffer, a vacation fund), with a
balance recorded over time. Sheet type `"savings"`. Files live in
`src/components/savings/`; data helpers in `src/data/savings/`.

| Term                                      | Refers to                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Savings page** / **Savings sheet**      | `src/components/savings/SavingsPage.tsx`; `SavingsView`, `UserData.savings`. [→](overview.md#savings-page)                                                                                                                                                                 |
| **Savings account** / **saving** (object) | `Saving` (`src/data/types/savings.ts`); `SavingsModal.tsx`; `createSaving` / `updateSaving` / `deleteSaving` (`src/data/reducers/savings.ts`). [→](overview.md#savings-account)                                                                                            |
| **Savings balance** / **update balance**  | `SavingBalancePoint` (`Saving.balanceHistory`); `UpdateSavingBalanceModal.tsx`; `currentSavingBalance` / `applyImportedSavingBalances` (`src/data/savings/value.ts`); `addSavingBalance` / `updateSavingBalance` / `deleteSavingBalance`. [→](overview.md#savings-balance) |
| **Visualize value** (savings)             | `SavingsValueChartModal.tsx`; `buildSavingsTotalSeries` (`src/data/savings/series.ts`); `LineChart` (`src/components/charts/LineChart.tsx`). Opened from the Savings sheet's title "…" menu. [→](overview.md#visualize-value-savings)                                      |

## Loans page

Loans — the money the user owes (student / mortgage / car / private /
personal), with payments imported from bank transactions. Sheet type
`"loans"`. Files live in `src/components/loans/`; data helpers in
`src/data/loans/`.

| Term                                         | Refers to                                                                                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Loans page** / **Loans sheet**             | `src/components/loans/LoansPage.tsx`; `LoansView`, `UserData.loans`. [→](overview.md#loans-page)                                                                                                                                                     |
| **Loan** (object) / **loan kind**            | `Loan`, `LoanKind` (`src/data/types/loans.ts`); `LoanModal.tsx`; `addLoan` / `updateLoan` / `deleteLoan` (`src/data/reducers/loans.ts`); `LOAN_PRESET_TYPE_BY_KIND` (`src/data/loans/presets.ts`). [→](overview.md#loan)                             |
| **Remaining balance** (loan)                 | `loanRemainingBalance` / `loanPaidSoFar` (`src/data/loans/balance.ts`). [→](overview.md#loan-remaining-balance)                                                                                                                                      |
| **Linked mortgage** (loan)                   | `Loan.propertyId` + `Loan.mortgageIds`; `resolveLinkedMortgages` / `linkedMortgageFigures` (`src/data/loans/balance.ts`). [→](overview.md#linked-mortgage-loan)                                                                                      |
| **Import payments** (loan)                   | `LoanImportPaymentsModal.tsx`; `findLoanPaymentCandidates` / `findSimilarLoanPaymentCandidates` (`src/data/loans/candidates.ts`); `addLoanPayments` (+ `entryOverrides`). Opened from the loan row's "…" menu. [→](overview.md#import-payments-loan) |
| **Payment pattern** / **auto-attach** (loan) | `Loan.paymentPatterns`; `learnPaymentPatterns` (`src/data/loans/patterns.ts`); `attachImportedLoanPayments` (`src/data/loans/auto-attach.ts`), run inside `importBankHistory`. [→](overview.md#loan-payment-pattern-auto-attach)                     |
| **Loan payments view**                       | `LoanPaymentsModal.tsx`; `deleteLoanPayment` / `deleteAllLoanPayments`. [→](overview.md#loan-payments-view)                                                                                                                                          |

## Data and storage

| Term                                                          | Refers to                                                                                                                                                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User data** / **state** / **the budget**                    | `UserData` (`src/data/types.ts`). [→](overview.md#user-data)                                                                                                                                       |
| **Sheet item**                                                | `Sheet.items` union: `AccountBudget`, `AccountsView`, `ItemsView`, `SalaryView`, `PropertiesView`, `SavingsView`, `LoansView`. [→](overview.md#sheet-item)                                         |
| **Account budget**                                            | `AccountBudget` (`src/data/types.ts`). [→](overview.md#account-budget)                                                                                                                             |
| **Row**                                                       | `Row` (`src/data/types.ts`). [→](overview.md#row)                                                                                                                                                  |
| **Column**                                                    | `Column` (`src/data/types.ts`). [→](overview.md#column)                                                                                                                                            |
| **Coverage** / **covered month**                              | `src/data/coverage.ts` (`coveredMonths`, `isMonthCovered`, `coverageDelta`). [→](overview.md#coverage)                                                                                             |
| **Cell value**                                                | `CellValue` (`src/data/types.ts`). [→](overview.md#cell-value)                                                                                                                                     |
| **Synthesized row**                                           | `synthesizeTransferRow` / `synthesizeHistoryRow` (`src/data/budget/synthesis.ts`). [→](overview.md#synthesized-row)                                                                                |
| **Series**                                                    | `seriesId`, `expandRecurrence`, `HistoryEntry.userSeriesId`. [→](overview.md#series)                                                                                                               |
| **Recurrence rule**                                           | `RecurrenceRule` (`src/data/recurrence.ts`). [→](overview.md#recurrence-rule)                                                                                                                      |
| **Entry type** / **type**                                     | `EntryType` (`src/data/types.ts`). [→](overview.md#entry-type)                                                                                                                                     |
| **Category**                                                  | `Category` (`src/data/types.ts`). [→](overview.md#category)                                                                                                                                        |
| **Subtype**                                                   | `Subtype` (`src/data/types/categories.ts`, `UserData.subtypes`); `SubtypesAdmin` (item subtypes in the Items tab, repair subtypes in the Properties tab), `itemSubtypes`. [→](overview.md#subtype) |
| **Item**                                                      | `Item` (`src/data/types/items.ts`, `UserData.items`). [→](overview.md#item)                                                                                                                        |
| **Edit item modal**                                           | `ItemEditorModal` (`src/components/ItemEditorModal.tsx`); `open-edit-item`, `deleteItem`. [→](overview.md#edit-item-modal)                                                                         |
| **Receipt**                                                   | `Row.receiptPath` / `HistoryEntry.receiptPath`; `buildReceiptPath` (`src/data/items/receipt-name.ts`), `ReceiptOps` (`src/storage/adapter.ts`). [→](overview.md#receipt)                           |
| **Receipt name pattern**                                      | `Settings.receiptNamePattern`; `buildReceiptPath`. [→](overview.md#receipt-name-pattern)                                                                                                           |
| **Payslip** / **lönerapport**                                 | `Salary.payslipPath`; `buildPayslipPath` (`src/data/salary/payslip-name.ts`). [→](overview.md#payslip)                                                                                             |
| **Line item**                                                 | `LineItemLink` (`src/data/types/items.ts`); `BudgetLineItemsModal`, `unlinkedItems` (`src/data/items/link.ts`). [→](overview.md#line-item)                                                         |
| **Line-item pill**                                            | `LineItemPill` (`src/components/budget/cells/DescriptionCell.tsx`). [→](overview.md#line-item-pill)                                                                                                |
| **Company** / **merchant**                                    | `Company` (`UserData.companies`, `src/data/types.ts`); `CompanyPicker`, `CompaniesAdmin`. [→](overview.md#company)                                                                                 |
| **Company category** / **merchant kind**                      | `CompanyCategory` (`UserData.companyCategories`); `CompanyCategoryPicker`, `CompanyCategoriesAdmin`. [→](overview.md#company-category)                                                             |
| **Company pill**                                              | `CompanyPill` (`src/components/budget/cells/DescriptionCell.tsx`); `open-edit-company`. [→](overview.md#company-pill)                                                                              |
| **Tag**                                                       | `Tag` (`UserData.tags`); `TagsPicker`, `TagsAdmin`. [→](overview.md#tag)                                                                                                                           |
| **Preset**                                                    | `PRESET_CATEGORIES` / `PRESET_ENTRY_TYPES` (`src/data/presets/`). [→](overview.md#preset)                                                                                                          |
| **Match rule** / **pattern rule**                             | `MatchRule` (`src/data/types.ts`, `data.matchRules`). [→](overview.md#match-rule)                                                                                                                  |
| **Merchant hint**                                             | `MerchantHint` (`src/data/types.ts`). [→](overview.md#merchant-hint)                                                                                                                               |
| **Company type hint** / **suggested type**                    | `computeCompanyTypeHints` (`src/data/budget/company-type-hints.ts`). [→](overview.md#company-type-hint)                                                                                            |
| **Drag-to-reorder** / `useDragReorder`                        | `useDragReorder` (`src/hooks/useDragReorder.ts`), `reorderById` / `arrayMove` (`src/utils/reorder.ts`). [→](overview.md#drag-to-reorder)                                                           |
| **Series match rule**                                         | `SeriesMatchRule`. [→](overview.md#series-match-rule)                                                                                                                                              |
| **Rename pattern**                                            | `RenamePattern` (`src/data/types.ts`). [→](overview.md#rename-pattern)                                                                                                                             |
| **Promote**                                                   | verb; `BudgetEditEntryModal` "Make recurring". [→](overview.md#promote)                                                                                                                            |
| **Reconciliation**                                            | `src/data/reconciliation.ts`. [→](overview.md#reconciliation)                                                                                                                                      |
| **Transaction**                                               | `HistoryEntry` (`src/data/types.ts`); `transactionSortOrder`. [→](overview.md#transaction)                                                                                                         |
| **Opening balance**                                           | `Account.openingBalance`. [→](overview.md#opening-balance)                                                                                                                                         |
| **Orphan** / **orphan row** / **prediction that didn't post** | `findOrphans` (`src/data/reconciliation.ts`). [→](overview.md#orphan)                                                                                                                              |
| **Running balance** / **balance column**                      | `computeBalances` (`src/data/sheet.ts`). [→](overview.md#running-balance)                                                                                                                          |
| **Balance correction**                                        | `correctAccountBalance`. [→](overview.md#balance-correction)                                                                                                                                       |
| **Fiscal month**                                              | `src/data/fiscal-month.ts`; `detectPaydayDayOfMonth`. [→](overview.md#fiscal-month)                                                                                                                |
| **Payday**                                                    | `detectPaydayDayOfMonth`. [→](overview.md#payday)                                                                                                                                                  |
| **Primary income** / **great income of the month**            | `UserData.seriesMetadata[seriesId].isPrimaryIncome`; `computePrimaryIncomeShift` (`src/data/sheet.ts`). [→](overview.md#primary-income)                                                            |
| **Fiscal month shift** / **month override**                   | `Row.fiscalMonthShift`. [→](overview.md#fiscal-month-shift)                                                                                                                                        |
| **Salary sheet**                                              | `SheetType "salary"`, `SalaryView`; `src/components/salary/SalaryPage.tsx`. [→](overview.md#salary-page)                                                                                           |
| **Salary** (object)                                           | `Salary` (`src/data/types/salary.ts`). [→](overview.md#salary-object)                                                                                                                              |
| **Employer** / **Role**                                       | `Employer` (`UserData.employers`). [→](overview.md#employer)                                                                                                                                       |
| **Find salaries**                                             | `SalaryDiscoveryModal.tsx`; `discoverSalaries`. [→](overview.md#find-salaries)                                                                                                                     |
| **Gross and net** / **brutto** / **netto**                    | `src/data/salary/salary.ts`. [→](overview.md#gross-and-net)                                                                                                                                        |
| **Backend**                                                   | `src/storage/` (`browser`, `folder`, `dropbox`, `gdrive`). [→](overview.md#backend)                                                                                                                |
| **Cloud backup**                                              | `src/components/CloudBackupModal.tsx`. [→](overview.md#cloud-backup)                                                                                                                               |
| **Encryption**                                                | `src/storage/encrypting-adapter.ts`. [→](overview.md#encryption)                                                                                                                                   |
| **Achievement**                                               | `src/data/achievements/catalog.ts`. [→](overview.md#achievement)                                                                                                                                   |

## Cross-cutting UI primitives

| Term                                                 | Refers to                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modal**                                            | `src/components/Modal.tsx`. [→](overview.md#modal)                                                                                                                                                                                                             |
| **Dialog**                                           | `ConfirmDialog.tsx`, `BudgetApplySeriesDialog.tsx`, `CloudLinkDialog.tsx`. [→](overview.md#dialog)                                                                                                                                                             |
| **Panel**                                            | `FloatingPanel.tsx`. [→](overview.md#panel)                                                                                                                                                                                                                    |
| **Picker**                                           | `CategoryPicker.tsx`, `TypePicker.tsx`, `LanguagePicker.tsx`, `BackendPicker.tsx`, `GlyphPicker.tsx`. [→](overview.md#picker)                                                                                                                                  |
| **Modal search bar** / **in-modal search**           | `ModalSearchBar.tsx`, `ModalSearchControls.tsx`. [→](overview.md#modal-search-bar)                                                                                                                                                                             |
| **Toast**                                            | `src/components/Toast.tsx`, `useToast()`. [→](overview.md#toast)                                                                                                                                                                                               |
| **Update toast**                                     | `src/components/UpdateToast.tsx`. [→](overview.md#update-toast)                                                                                                                                                                                                |
| **Active row** / **row claim** / **row coordinator** | `ActiveRowProvider.tsx`, `useClaimActiveRow.ts`. [→](overview.md#active-row)                                                                                                                                                                                   |
| **Sheet swipe**                                      | `src/hooks/useSheetSwipe.ts`. [→](overview.md#sheet-swipe)                                                                                                                                                                                                     |
| **Glyph**                                            | `CategoryIcon` (`src/data/types.ts`), `CategoryIconGlyph` (`src/components/icons.tsx`). [→](overview.md#glyph)                                                                                                                                                 |
| **Pill** / **chip**                                  | `EntityChip` (`src/components/EntityChip.tsx`); `LineItemPill` / `CompanyPill` (`budget/cells/DescriptionCell.tsx`), `formula-pill` (`BudgetFormulaInput.tsx`), `useScrollToToday.ts`, `rateResetPill*` (`properties/PropertyCard.tsx`). [→](overview.md#pill) |
| **Settings section** / **collapsible section**       | `Section` (`src/components/SettingsModal/tabs/shared.tsx`). [→](overview.md#settings-section)                                                                                                                                                                  |
| **Clear button** / **(x) button in input**           | `ClearableInput` / `ClearableTextarea` (`src/components/form/`). [→](overview.md#clear-button)                                                                                                                                                                 |

## i18n

| Term                    | Refers to                                                            |
| ----------------------- | -------------------------------------------------------------------- |
| **Catalog**             | `src/i18n/locales/en/`, the `Catalog` type. [→](overview.md#catalog) |
| **Lang** / **language** | `Lang` (`src/i18n/locale.ts`). [→](overview.md#lang)                 |
| **`t()`**               | `useT()` (`src/i18n/index.ts`). [→](overview.md#t)                   |
| **Plural helper**       | `plural()` (`src/i18n/index.ts`). [→](overview.md#plural-helper)     |

## Workflows / verbs the user might say

| Term                                                               | Refers to                                                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Add a sheet**                                                    | header Sheet switcher → "New sheet" → `SheetModal`. [→](overview.md#add-a-sheet)                            |
| **Edit a sheet**                                                   | title "…" menu → `SheetModal`. [→](overview.md#edit-a-sheet)                                                |
| **Add a row**                                                      | `BudgetAddEntryButton`. [→](overview.md#add-a-row)                                                          |
| **Promote a history entry**                                        | `BudgetEditEntryModal` → "Make recurring". [→](overview.md#promote-a-history-entry)                         |
| **Split an entry**                                                 | `BudgetSplitEntryModal`. [→](overview.md#split-an-entry)                                                    |
| **Collapse a transfer**                                            | `AccountTransferCollapseModal`. [→](overview.md#collapse-a-transfer)                                        |
| **Import history**                                                 | `AccountActionsMenu` → `ImportHistoryModal` → `AccountReconciliationModal`. [→](overview.md#import-history) |
| **Cut history**                                                    | `AccountActionsMenu` → `AccountCutHistoryModal`. [→](overview.md#cut-history)                               |
| **Update balance**                                                 | `AccountsPage` row → "…" → `UpdateBalanceModal`. [→](overview.md#update-balance)                            |
| **Mark as transfer**                                               | per-row eye toggle, `Row.isTransfer`. [→](overview.md#mark-as-transfer)                                     |
| **Triage orphans** / **move or delete entries in a covered month** | `AccountReconciliationModal`. [→](overview.md#triage-orphans)                                               |
| **Sign out** / **switch user**                                     | header burger menu. [→](overview.md#sign-out)                                                               |

## Conventions for editing this file

- One row per term, grouped by the sections above. The left column
  carries every alias the user might say; the right column is the most
  specific file path plus the symbols an agent would grep for, then a
  `[→](overview.md#anchor)` link to the term's overview entry.
- Keep the right column to file + symbols + the link — no prose gloss.
  The description (and any mechanics) goes in the matching `overview.md`
  section, not here.
- Every row links to an `overview.md` entry, and every overview entry
  has a row here. Add or update both **in the same pull request** as
  the code change that introduced or renamed the term.
- Don't duplicate `docs/architecture.md`'s module / persisted-shape
  inventory. Link by file path; readers who need the why follow the
  overview link.
