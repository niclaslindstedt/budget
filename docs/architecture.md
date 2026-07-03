# Architecture

The shape of the codebase today, and where it is heading.

## Today

```
src/
├── main.tsx              # React 18 entry; mounts <LanguageRoot> + <App />,
│                         #   or the standalone privacy page for /privacy
├── App.tsx               # auth state machine (users registry, sign-in /
│                         #   out / create / switch / delete) + storage hookup
├── styles.css            # master stylesheet: imports Tailwind v4 then the
│                         #   src/styles/* layers below
├── styles/
│   ├── theme.css             # @theme tokens, :root custom-property defaults
│   ├── palettes.css          # dark / light palette overrides per [data-theme]
│   ├── components.css        # @layer components rules (sticky headers, fields)
│   ├── utilities.css         # unlayered utility remaps + keyframes
│   └── chrome.css            # app-shell layout (bottom bar, header, modal
│                             #   offsets, iOS standalone-mode workarounds)
├── components/
│   ├── AuthScreen.tsx            # sign-in / sign-up / "continue without account"
│   ├── AppLoading.tsx           # full-area loader while a backend boots
│   ├── BottomBar.tsx            # universal: the sheet tab strip
│   ├── SheetModal.tsx           # universal: new / edit sheet metadata (… menu)
│   ├── SheetTitleMenu.tsx       # universal: the "…" menu next to a sheet title
│   ├── HeaderMenu.tsx           # universal: page-header burger menu
│   ├── HeaderStar.tsx           # universal: "new achievements" header star
│   ├── Modal.tsx                # compound shell for every modal dialog
│   ├── FloatingPanel.tsx        # portalled dropdown shell for pickers
│   ├── DismissBackdrop.tsx      # shared click-outside / Escape backdrop
│   ├── ConfirmDialog.tsx        # generic confirm prompt with scope options
│   ├── ApplySeriesDialog.tsx    # "apply edit to recurring series?" prompt
│   │                            #   (budget cell commits + scenario overrides)
│   ├── RecurrenceForm.tsx       # recurrence rule picker + preview (budget
│   │                            #   entry modals + scenario added rows)
│   ├── DatePickerModal.tsx      # modal calendar (mobile-friendly)
│   ├── ColorPalette.tsx         # circular color-swatch grid
│   ├── GlyphGrid.tsx            # 8-column icon-button grid
│   ├── GlyphPicker.tsx          # glyph picker built on GlyphGrid
│   ├── icons.tsx                # column-type + category-icon registries
│   ├── EntityChip.tsx, EntityCreatorForm.tsx, EntityPickerShell.tsx
│   │                            # shared building blocks for the entity pickers
│   ├── CategoryPicker.tsx, TypePicker.tsx, CompanyPicker.tsx, TagsPicker.tsx
│   │                            # custom dropdown pickers + inline creators
│   ├── BackendPicker.tsx        # browser / folder / Dropbox / Drive picker
│   ├── DropboxGlyph.tsx, GoogleDriveGlyph.tsx  # cloud brand marks
│   ├── SyncStatus.tsx, SyncDetailsModal.tsx    # cloud sync indicator + detail
│   ├── SaveStateButton.tsx      # manual "save now" affordance
│   ├── CloudLinkDialog.tsx, ReconnectCloudModal.tsx  # cloud link / re-auth flows
│   ├── ConflictResolutionModal.tsx   # concurrent-edit merge prompt
│   ├── CloudBackupModal.tsx     # list, create, and restore timestamped backups
│   ├── ImportExportControls.tsx, DownloadModal.tsx   # file download + import
│   ├── BulkActionBar.tsx        # multi-row selection toolbar
│   ├── ActionHistoryModal.tsx   # undo/redo history viewer
│   ├── ChangelogModal.tsx       # "What's new" + full history; renders
│   │                            #   markdown bullets, opens feature docs inline
│   ├── markdown.ts, Markdown.tsx  # tiny markdown parser + theme-aware renderer
│   ├── AchievementsModal.tsx, AchievementUnlockModal.tsx  # achievements UI
│   ├── InstallPrompt.tsx, UpdateToast.tsx  # PWA install + new-build prompts
│   ├── PullToRefreshIndicator.tsx, Toast.tsx, ModalSearchBar.tsx
│   ├── LanguagePicker.tsx       # flag button language switcher
│   ├── PrivacyPage.tsx          # privacy policy rendered at /privacy
│   ├── ActiveRowProvider.tsx, useActiveRow.ts, useClaimActiveRow.ts
│   │                            # universal row-claim coordinator + hooks
│   ├── AppShell/             # top-level orchestrator (now a directory)
│   │   ├── AppShell.tsx          # owns the reducer + storage harness + routing
│   │   ├── UniversalModalHost.tsx, BudgetModalHost.tsx, AccountsModalHost.tsx
│   │   │                         # modal portals split by page scope
│   │   ├── types.ts, index.ts
│   │   └── hooks/                # one hook per modal flow / shell concern
│   │                            #   (useRowMutations, useImportFlow,
│   │                            #    useTransferFlow, useSettingsModal,
│   │                            #    useTaxonomyCrud, useUndoRedo, …)
│   ├── SettingsModal/        # app-level settings
│   │   ├── SettingsModal.tsx, admin.tsx, CompaniesAdmin.tsx, TagsAdmin.tsx,
│   │   │   DeleteAccountForm.tsx, index.ts
│   │   └── tabs/                 # general, format, appearance, search, storage,
│   │                            #   categories, companies, tags, patterns,
│   │                            #   memory, developer, logs
│   ├── form/                 # form primitives (Button, Checkbox, Radio,
│   │                         #   ClearableInput/Textarea, FormSection,
│   │                         #   SelectPicker, SignedAmountInput, Slider,
│   │                         #   RangeSlider)
│   ├── budget/               # budget page — per-account ledger
│   │   ├── BudgetPage.tsx, BudgetContext.ts, BudgetContextProvider.tsx
│   │   ├── BudgetMonthTable.tsx, BudgetColumnHeader.tsx, OrphanIndicator.tsx
│   │   ├── BudgetRow.tsx, BudgetCell.tsx, BudgetAddEntryButton.tsx
│   │   ├── BudgetEntryActionsMenu.tsx, BudgetEditEntryModal.tsx,
│   │   │   BudgetEditEntryFullModal.tsx, BudgetEditSeriesForm.tsx,
│   │   │   BudgetPromoteHistoryForm.tsx, BudgetPromoteToSeriesForm.tsx,
│   │   │   BudgetComplexEntryModal.tsx,
│   │   │   BudgetDeleteRecurringDialog.tsx, BudgetSplitEntryModal.tsx,
│   │   │   BudgetBulkEditModal.tsx,
│   │   │   BudgetMoveCopyModal.tsx, BudgetMetadataModal.tsx,
│   │   │   BudgetMatchRuleModal.tsx, BudgetFindConflictsModal.tsx,
│   │   │   BudgetRecurringCandidatesPanel.tsx, BudgetAmountSpanFields.tsx
│   │   ├── BudgetViewerModal.tsx       # read-only view-mode of a budget
│   │   ├── BudgetTransferSearchModal.tsx + *FilterMenu/*TokenFilter
│   │   ├── BudgetFormulaHelpButton.tsx, BudgetFormulaInput.tsx,
│   │   │   BudgetFormulaVariableHelper.tsx
│   │   ├── budget-*-reducer.ts         # local reducers for the modal forms
│   │   ├── cells/                      # readonly cell variants for the table
│   │   └── hooks/                      # budget-only view hooks (layout, scroll,
│   │                                   #   row flashing, visible month range)
│   └── accounts/             # accounts page — workspace dashboard
│       ├── AccountsPage.tsx, AccountRow.tsx, AccountTransferRow.tsx
│       ├── AccountModal.tsx, AccountActionsMenu.tsx
│       ├── AccountTransferModal.tsx, UpdateBalanceModal.tsx
│       ├── HistoryModal.tsx, ImportHistoryModal.tsx, EditHistoryEntryModal.tsx,
│       │   AccountCutHistoryModal.tsx
│       ├── AccountReconciliationModal.tsx   # post-import reconciliation flow
│       ├── AccountRenamePredictorModal.tsx  # learned-rename suggestions
│       ├── AccountTransferCollapseModal.tsx # cross-account pair collapse
│       └── account-*-reducer.ts
│   ├── items/                # items page — owned-items catalog
│   │   ├── ItemsPage.tsx         # page root — items table + totals + add button
│   │   └── ItemRow.tsx           # one item row (swipe edit/delete, note popover)
│   ├── properties/           # properties page — homes/apartments + mortgages
│       ├── PropertiesPage.tsx    # page root — property cards + add button
│       ├── PropertyCard.tsx      # one property (value, mortgages, repairs, actions)
│       ├── PropertyEditorModal.tsx, UpdatePropertyValueModal.tsx
│       ├── MortgageEditorModal.tsx, MortgageDiscoveryModal.tsx
│       ├── RepairsModal.tsx           # wrench view — swipeable repair rows
│       ├── RepairsEditModal.tsx       # single-repair add/edit (multi-select
│       │                              #   transactions + description + subtype)
│       ├── RepairEntryActionsMenu.tsx # "…" swipe-strip menu (manage receipt)
│       ├── RepairsAddModal.tsx        # bulk quick-add candidate picker
│       └── ManualRepairModal.tsx      # manual repair add/edit (no backing
│                                      #   transaction; company/tags on the repair)
│   └── savings/              # savings page — savings accounts + dated balance
│       ├── SavingsPage.tsx       # page root — savings table + total + add button
│       ├── SavingsRow.tsx        # one savings row (swipe edit/delete, "…" menu)
│       ├── SavingsModal.tsx      # add/edit savings account
│       ├── SavingActionsMenu.tsx # "…" swipe-strip menu (update balance)
│       ├── UpdateSavingBalanceModal.tsx  # append a dated balance point
│       └── SavingsValueChartModal.tsx    # combined value-over-time chart
│                                      #   ("Visualize value", account chooser)
│   └── loans/                # loans page — the money the user owes
│       ├── LoansPage.tsx         # page root — loans table + remaining total
│       ├── LoanRow.tsx           # one loan row (tap → view, swipe edit/delete,
│       │                         #   "…" menu)
│       ├── LoanViewModal.tsx     # read-only loan details (terms, figures,
│       │                         #   payments list; Edit shortcut)
│       ├── LoanActionsMenu.tsx   # "…" swipe-strip menu (update balance,
│       │                         #   import/view payments)
│       ├── LoanModal.tsx         # add/edit loan (kind picker, per-kind lender
│       │                         #   fields, property-mortgage link picker)
│       ├── LoanUpdateBalanceModal.tsx  # append a dated balance snapshot
│       ├── LoanPaymentsModal.tsx # recorded payments list (+ delete)
│       ├── LoanImportPaymentsModal.tsx # candidate tick-list → addLoanPayments
│       ├── LoansChartModal.tsx   # "Visualize loans" stacked chart (balances
│       │                         #   area / monthly-payments bars, kind
│       │                         #   filters, estimated-interest break-out)
│       └── loan-kind.ts          # kind → i18n label key + fallback glyph
│   └── cars/                 # cars page — real cost of having a car
│       ├── CarsPage.tsx          # page root — car cards + sold section +
│       │                         #   modal host (one discriminated union)
│       ├── CarCard.tsx           # one car card (value, mileage, cost/km,
│       │                         #   cost summary, loan line)
│       ├── CarActionsMenu.tsx    # card "…" menu (find/add expenses, update
│       │                         #   value, edit, delete)
│       ├── CarEditorModal.tsx    # add/edit car (ownership pill, purchase +
│       │                         #   depreciation fields, loan picker, sold)
│       ├── UpdateCarValueModal.tsx    # value AND odometer in one dated
│       │                         #   snapshot (Blocket-lookup flow)
│       ├── CarValueChartModal.tsx     # value-over-time line (monthly-sampled
│       │                         #   curve, cost/interest subtraction, mileage)
│       ├── CarExpensesModal.tsx  # linked-expense list with month subtotals
│       ├── CarExpenseFinderModal.tsx  # "Find car expenses" multi-select +
│       │                         #   per-row ignore / exclude-similar
│       ├── ManualCarExpenseModal.tsx  # sourceless expense add/edit
│       └── CarCostChartModal.tsx # monthly stacked cost bars per type +
│                                 #   depreciation / interest bands + cost/km
│   └── insights/             # insights page — cross-area analyses
│       ├── InsightsPage.tsx      # page root — net-worth total + breakdown +
│       │                         #   over-time chart (mode toggle hidden until
│       │                         #   a second InsightsMode exists)
│       └── InsightsSettingsModal.tsx  # per-entity include toggle + ownership
│                                 #   share (one dispatch on Save)
│   └── investment/           # investment page — holdings + private stocks
│       ├── InvestmentPage.tsx     # page root — two card tables, owns modals
│       ├── InvestmentHoldingModal.tsx  # add/edit holding (wrapper + kind pickers)
│       ├── UpdateHoldingValueModal.tsx # append a dated value point
│       ├── StockPositionModal.tsx  # add/edit private stock (ownership picker)
│       ├── StockTransactionModal.tsx   # record a buy/sell (signed shares)
│       ├── UpdateStockPriceModal.tsx   # set current price/share (per-share or
│       │                         #   total ÷ shares)
│       └── InvestmentValueChartModal.tsx  # "Visualize value" — combined value
│                                 #   over time, net-value toggle, range buttons
│   └── scenarios/            # scenarios page — what-ifs against a base budget
│       ├── ScenariosPage.tsx     # page root — base picker, switcher, monitors,
│       │                         #   month tables, delta dispatch + series sweep
│       ├── ScenarioPicker.tsx    # scenario dropdown (Baseline + scenarios +
│       │                         #   "New scenario") + rename/delete glyphs
│       ├── ScenarioMonthTable.tsx # one month — header + rows + add-row footer
│       ├── ScenarioRow.tsx       # one row — inline override/exclude, swipe strip
│       ├── ScenarioRowModal.tsx  # add/edit a scenario-only row
│       ├── ScenarioModulateModal.tsx # attach a live amount adjustment
│       │                         #   (+5000 / ×2 / +300 %) with preview
│       ├── modulation.ts         # formatModulation — the ×2 / +5000 token
│       ├── ScenarioEditModal.tsx # create/rename a scenario
│       ├── ScenariosMonitorRow.tsx # monitor-date cards + remove
│       ├── ScenariosAddMonitorModal.tsx # add a monitor date ("+" on title row)
│       ├── ScenariosChartModal.tsx # "Visualize scenarios" — forward-horizon chart
│       ├── ScenariosDiffModal.tsx # "View changes" — scenario vs baseline diff
│       └── scenario-colors.ts    # index → theme-token series colors
├── data/
│   ├── types/              # persisted data model, split by topic
│   │   ├── index.ts            # re-exports every public type
│   │   ├── user-data.ts        # UserData (version 77, incl. taxProfiles +
│   │   │                       #   properties + savings + loans +
│   │   │                       #   investmentHoldings + investmentStocks),
│   │   │                       #   StoredUser, UsersFile
│   │   ├── sheets.ts           # Sheet, SheetItem, AccountBudget, AccountsView,
│   │   │                       #   ItemsView, SalaryView, PropertiesView,
│   │   │                       #   SavingsView, LoansView, InsightsView (+ mode
│   │   │                       #   + net-worth settings), InvestmentView,
│   │   │                       #   ScenariosView (+ Scenario, ScenarioRowOverride,
│   │   │                       #   ScenarioAddedRow), SheetType, SheetGlyph
│   │   ├── investments.ts      # InvestmentHolding (wrapper ISK/KF/depå, dated
│   │   │                       #   valueHistory), StockPosition (signed-share
│   │   │                       #   transactions + dated priceHistory),
│   │   │                       #   InvestmentValuePoint, StockTransaction,
│   │   │                       #   StockPricePoint, InvestmentWrapper/Kind,
│   │   │                       #   StockOwnership
│   │   ├── savings.ts          # Saving (savings account), SavingBalancePoint —
│   │   │                       #   transactions live in UserData.history keyed by
│   │   │                       #   the saving id; a first-class transfer endpoint
│   │   ├── loans.ts            # Loan (kind, terms, lender fields, dated
│   │   │                       #   balance snapshots, optional link to
│   │   │                       #   several of one property's mortgages),
│   │   │                       #   LoanPayment, LoanBalancePoint, LoanKind
│   │   ├── cars.ts             # Car (ownership form, purchase price/date/
│   │   │                       #   odometer, sharePct, ItemDepreciation reuse,
│   │   │                       #   lease terms, loanId link, soldAt/soldFor), CarSnapshot
│   │   │                       #   (dated value and/or mileage), CarExpense
│   │   │                       #   (linked or manual transportation cost),
│   │   │                       #   CarContract (uploaded purchase/lease/sale
│   │   │                       #   paperwork), CarContractKind, CarOwnership
│   │   ├── salary.ts           # Salary (one paycheck), Employer, Role
│   │   ├── properties.ts       # Property (home/apartment, incl. soldDate /
│   │   │                       #   soldAmount for one owned in the past,
│   │   │                       #   associationLoan for indirect förening debt),
│   │   │                       #   PropertyValuePoint, AssociationLoan +
│   │   │                       #   AssociationLoanChange (effective-dated yearly
│   │   │                       #   loan/rate updates), Mortgage, MortgagePayment,
│   │   │                       #   PropertyRepair
│   │   │                       #   (source pair optional — manual repairs carry
│   │   │                       #   own companyId/tagIds), PropertySaleEstimate
│   │   ├── budget.ts           # Column, Row union (UserRow / CorrectionRow /
│   │   │                       #   HistoricRow / TransferRow + Row.lineItems),
│   │   │                       #   ColumnType
│   │   ├── categories.ts       # Category, EntryType, EntryTypeKind, Subtype,
│   │   │                       #   Company, CompanyCategory, Tag, CategoryIcon
│   │   │                       #   allowlist
│   │   ├── items.ts            # Item (owned things, + valueHistory),
│   │   │                       #   ItemValuePoint, LineItemLink (entry↔item)
│   │   ├── accounts.ts         # Account, HistoryEntry (+ lineItems),
│   │   │                       #   HistoryEntrySplit, HistoryImport, Transfer
│   │   ├── rules.ts            # MatchRule, MerchantHint, RenamePattern,
│   │   │                       #   SeriesMatchRule, SeriesMetadata,
│   │   │                       #   PrimaryIncomeMerchant
│   │   ├── settings.ts         # Settings, PersistedSettings, DeviceSettings,
│   │   │                       #   download / search-ranking shapes
│   │   └── settings-theme.ts   # CustomTheme + theme / format enum literals
│   ├── constants/         # topical constants — one file per group:
│   │   ├── storage.ts          # STORAGE_KEY, USERS_KEY, userDataKey,
│   │   │                       #   cloudMirrorKey, nsKey/nsCloudPath/nsIdbName,
│   │   │                       #   PBKDF2 password params, DEFAULT_USERNAME
│   │   ├── defaults.ts         # DEFAULT_SETTINGS, device defaults, download
│   │   │                       #   prefs, DEFAULT_SEARCH_RANKING
│   │   ├── format.ts           # MAX_COLUMN_CHARS (60), font-scale + session-
│   │   │                       #   timeout bounds/presets, DATE/SHORT_DATE_FORMATS
│   │   ├── currency.ts         # SUPPORTED_LANGUAGES, CURRENCY_PRESETS,
│   │   │                       #   REGION_TO_CURRENCY_ID
│   │   └── taxonomy.ts         # CATEGORY_COLORS, SHEET_COLORS, glyph allowlists
│   ├── sheet.ts           # universal sheet primitives (newId, createDefault*
│   │                       #   factories, column + sheet-tree traversal)
│   ├── sheet-routing.ts   # sheet ⇄ URL-slug mapping (sheetSlug,
│   │                       #   parseSheetSlug, resolveSheetSlug) — /budget,
│   │                       #   /budget-2 deep links; wiring in useSheetUrlSync
│   ├── sheet-types/       # per-flavour descriptors composed into one
│   │   │                   #   SHEET_TYPE_REGISTRY — adding a new flavour is a
│   │   │                   #   new file here plus a registry entry
│   │   ├── budget.ts           # BUDGET_SHEET_DESCRIPTOR + createDefaultAccountBudget
│   │   ├── accounts.ts         # ACCOUNTS_SHEET_DESCRIPTOR + createDefaultAccountsView
│   │   ├── items.ts            # ITEMS_SHEET_DESCRIPTOR + createDefaultItemsView
│   │   ├── salary.ts           # SALARY_SHEET_DESCRIPTOR + createDefaultSalaryView
│   │   ├── savings.ts          # SAVINGS_SHEET_DESCRIPTOR + createDefaultSavingsView
│   │   ├── loans.ts            # LOANS_SHEET_DESCRIPTOR + createDefaultLoansView
│   │   ├── investment.ts       # INVESTMENT_SHEET_DESCRIPTOR + createDefaultInvestmentView
│   │   ├── scenarios.ts        # SCENARIOS_SHEET_DESCRIPTOR + createDefaultScenariosView
│   │   ├── cars.ts             # CARS_SHEET_DESCRIPTOR + createDefaultCarsView
│   │   └── index.ts            # SHEET_TYPE_REGISTRY + descriptor fields (validate,
│   │                           #   itemTypes, rowsForItem) + lookup/traversal helpers
│   ├── presets/           # built-in entry types + categories pickers,
│   │   │                   #   validators, and admin UIs read through
│   │   ├── types.ts            # PRESET_ENTRY_TYPES + entry-type helpers
│   │   ├── categories.ts       # PRESET_CATEGORIES + DEFAULT_CATEGORY_ID
│   │   ├── company-categories.ts # PRESET_COMPANY_CATEGORIES +
│   │   │                       #   DEFAULT_COMPANY_CATEGORY_ID
│   │   └── merge.ts            # allTypes / allCategories /
│   │                           #   allCompanyCategories (visible presets + user)
│   ├── dev/               # developer-only helpers (preview builds)
│   │   └── seed.ts             # buildSeedUserData — deterministic ~6-month
│   │                           #   fake dataset for the Developer "Fake data"
│   │                           #   toggle (in-memory dev-seed-adapter)
│   ├── fiscal-month.ts    # fiscal-month + ISO date math (getMonthKey,
│   │                       #   groupRowsByMonth, previous/nextMonthKey, …)
│   ├── finance/           # cross-page financial math on the shared Mortgage
│   │   │                   #   entity — consumed by properties, loans, insights
│   │   ├── amortization.ts     # resolveMonthlyAmortization(At) — percent-of-initial
│   │   │                       #   or fixed monthly amortisation → a per-month sum,
│   │   │                       #   for the current plan or the plan effective on a date;
│   │   │                       #   percent basis = propertyInitialLoanTotal (the
│   │   │                       #   property's combined initial loan, not one mortgage)
│   │   ├── interest.ts         # resolveRateAt (rate effective on a date) +
│   │   │                       #   balanceAt (balance reconstructed for a month —
│   │   │                       #   forward from loanAmount when a start date is
│   │   │                       #   known, else back from currentBalance) +
│   │   │                       #   resolveMonthlyInterest(At) — balance × rate ÷ 12
│   │   └── payment.ts          # resolveMonthlyPaymentAt + splitPaymentAcrossMortgages
│   │                           #   — split a combined charge across a property's loans
│   ├── budget/
│   │   ├── rows.ts             # budget-row algebra (sort, computeBalances,
│   │   │                       #   buildVisibleRows, mintBudgetRow, …)
│   │   ├── computed-state.ts   # one-shot row pipeline consumed by BudgetPage
│   │   │                       #   (synthesis → merge → decorate → sort →
│   │   │                       #    balance → bucket)
│   │   ├── export.ts           # CSV/XLSX export builder for an AccountBudget
│   │   ├── spending.ts         # spending-dashboard aggregation (collect-
│   │   │                       #   SpendingFacts, per-month category sums,
│   │   │                       #   donut shares, income vs expenses, top
│   │   │                       #   merchants) for BudgetSpendingModal
│   │   ├── cells.ts            # generic Row.cells readers
│   │   ├── conflicts.ts        # within-account conflict finder (findConflicts, pickWinner)
│   │   ├── pattern-apply.ts    # cross-sheet match-rule application
│   │   ├── pattern-derive.ts   # glob-pattern seed from a row description
│   │   ├── recurring-detection.ts  # "looks recurring" candidate detector
│   │   ├── payday.ts           # salary detection over budget rows
│   │   └── formula*.ts         # tokenizer / parser / ast / evaluator / resolve
│   │                           #   + formula.ts facade for the `=` amount cell
│   ├── accounts/
│   │   ├── balance.ts          # account-level aggregation (accountBalance)
│   │   ├── duplicates.ts       # cross-account duplicate-import finder (findDuplicateImports, suggestOwner, historyContext, balanceSitsLocally, ignoreRulesForGroup, duplicateSessions, duplicateSessionRemovals)
│   │   ├── history-order.ts    # intra-day running-balance ordering (sortHistoryByBalance)
│   │   ├── export.ts           # accounts JSON export builder
│   │   └── transfer-collapse.ts    # mirror-pair detector (detectTransferCandidates)
│   ├── import/
│   │   └── value-import.ts     # CSV/xlsx → dated points for the shared
│   │                           #   "Import from file" modal: readTabularFile,
│   │                           #   suggestColumns, buildPoints, mergeImportedPoints
│   ├── items/
│   │   ├── value.ts            # computeItemCurrentValue / isItemOwned for the
│   │   │                       #   Items page (resale value + depreciation)
│   │   ├── find.ts             # findItemPurchaseCandidates — scans bank history
│   │   │                       #   for likely item purchases (Find items modal)
│   │   ├── link.ts             # findItemLink / unlinkedItems / collectItemReceipts /
│   │   │                       #   collectReceiptPaths — item↔transaction linkage
│   │   │                       #   (one transaction per item; surfaces its receipt)
│   │   ├── receipt-name.ts     # buildReceiptPath — preset-driven receipt filenames
│   │   │                       #   (incl. the type-subfolder pattern) + extensionOf
│   │   └── subtypes.ts         # itemSubtypes / PROPERTY_REPAIR_TYPE_IDS — filters
│   │                           #   out Repairs/Renovations subtypes so the Items
│   │                           #   sheet's pickers only offer item subtypes
│   ├── salary/
│   │   ├── salary.ts           # brutto/netto/tax algebra + role-title resolution
│   │   ├── detection.ts        # detectSalaries (budget-row scoring, one candidate
│   │                           #   per month) + assignEmployerGroups (shared
│   │                           #   job-change segmentation)
│   │   └── discovery.ts        # discoverSalaries — scans an account's full bank
│   │                           #   history for the recurring paycheck; powers the
│   │                           #   guided year-by-year Find salaries walk.
│   │                           #   summariseSalaryClusters rolls the months up
│   │                           #   into pay periods between raises / employer
│   │                           #   changes for the account-step summary
│   │   └── payslip-name.ts     # buildPayslipPath — flat "Employer - YYYY-MM"
│   │                           #   payslip filenames (+ re-exports extensionOf)
│   ├── property-mortgage/  # properties page — mortgage helpers
│   │   ├── aggregate.ts        # aggregateMortgages — sums a property's mortgages
│   │   │                       #   into one picture (totals, balance-weighted
│   │   │                       #   effective rate, monthly interest/amort,
│   │   │                       #   aggregate payoff) for the unified view
│   │   ├── discovery.ts        # discoverMortgagePayments — scans a property's
│   │   │                       #   bound account history for charges tagged with
│   │   │                       #   a lender / the Mortgage type, expands by bank
│   │   │                       #   description + amount band, clusters charges
│   │   │                       #   into payment occurrences by a 2-week day-gap
│   │   │                       #   (weekend slips kept), ranks by the expected
│   │   │                       #   figures; promotes the best per figure to
│   │   │                       #   "highly probable" — on amount alone for a
│   │   │                       #   tagged / payment-matched charge, else needing
│   │   │                       #   a complete on-cadence run (Find mortgage
│   │   │                       #   payments walk)
│   │   └── progress.ts         # mortgagePayoffProgress — share of the original
│   │                           #   loan amortised away (drives the payoff bar)
│   ├── property-repairs/   # properties page — repairs / renovations helpers
│   │   ├── candidates.ts       # findRepairCandidates — Repairs / Renovations
│   │   │                       #   outflows across all accounts not yet bound to
│   │   │                       #   any property's repairs (Add repairs picker);
│   │   │                       #   resolveRepairSourceRows — a repair's own
│   │   │                       #   sources resolved for the editor's checklist
│   │   ├── receipts.ts         # repairReceipts / repairReceiptCount / hasReceipt
│   │   │                       #   — normalise a repair's optional dated-receipts
│   │   │                       #   list (the missing-receipt flag reads hasReceipt)
│   │   └── sources.ts          # repairSources / repairSourceCount / repairSourceKey
│   │                           #   — flatten a repair's primary + additionalSources
│   │                           #   into one uniform transaction list
│   ├── property-value/     # properties page — value-history + chart helpers
│   │   ├── value.ts            # resolveValueHistory / currentPropertyValue /
│   │   │                       #   purchaseValuePoint — fold a property's
│   │   │                       #   purchase (purchaseAmount at purchaseDate) in
│   │   │                       #   as its first value; current value = latest by
│   │   │                       #   date, purchase included; isPropertySoldAt
│   │   │                       #   (already sold at a date — past ownership)
│   │   ├── series.ts           # buildPropertyValueSeries — market value, value
│   │   │                       #   incl. cumulative repairs, full net sale profit
│   │   │                       #   per snapshot, and the two interest deductions
│   │   │                       #   (Visualize value chart)
│   │   └── interest.ts         # cumulativeMortgageInterestAt /
│   │                           #   cumulativeAssociationInterestAt /
│   │                           #   associationLoanShare / resolveAssociationLoanAt
│   │                           #   (figures in effect on a date) — sunk interest
│   │                           #   the chart deducts (own mortgages + association
│   │                           #   debt share, accrued at each year's figures)
│   ├── property-transfer/  # properties page — sale-handover export / import
│   │   ├── manifest.ts         # PropertyExportManifest shape + format / version
│   │   │                       #   constants (the archive's manifest.json)
│   │   ├── export.ts           # buildPropertyExport — Property + lookups + options
│   │   │                       #   → manifest + the backend file paths to bundle
│   │   └── import.ts           # parsePropertyManifest (version-guard) +
│   │                           #   planPropertyImport — re-link names, mint a fresh
│   │                           #   Property + the companies / tags / categories /
│   │                           #   subtypes it needs
│   ├── savings/            # savings page — balance + transfer-endpoint helpers
│   │   ├── value.ts            # currentSavingBalance (latest balance point by
│   │   │                       #   date) + savingAsTransferEndpoint (present a
│   │   │                       #   Saving as an Account for the transfer surfaces)
│   │   └── series.ts           # buildSavingsTotalSeries — the combined
│   │                           #   value-over-time line behind "Visualize value"
│   ├── loans/              # loans page — balance math + payment import
│   │   ├── presets.ts          # LOAN_PRESET_TYPE_BY_KIND (kind → preset type
│   │   │                       #   id the candidate scan anchors on), LOAN_KINDS
│   │   ├── balance.ts          # loanPaidSoFar, loanMonthlyPayment (derived
│   │   │                       #   from the payment history), loanRemaining-
│   │   │                       #   Balance (snapshot / start-sum anchor +
│   │   │                       #   payments; rate accrues monthly interest),
│   │   │                       #   resolveLinkedMortgages + linkedMortgage-
│   │   │                       #   Figures (aggregated across the linked
│   │   │                       #   mortgages)
│   │   ├── payments.ts         # listLoanPayments — the payment rows the Loans
│   │   │                       #   sheet lists (linked loans group per-mortgage
│   │   │                       #   splits back into one row per bank charge)
│   │   ├── candidates.ts       # findLoanPaymentCandidates — type- or pattern-
│   │   │                       #   matched outflows minus already-recorded ids —
│   │   │                       #   + findSimilarLoanPaymentCandidates (same
│   │   │                       #   description key, amount within tolerance)
│   │   ├── patterns.ts         # learnPaymentPatterns / matchesPaymentPattern —
│   │   │                       #   normalised-description memory on the loan
│   │   ├── auto-attach.ts      # attachImportedLoanPayments — silent payment
│   │   │                       #   recording inside importBankHistory
│   │   └── series.ts           # buildLoanBalanceBands / buildLoanPaymentBands
│   │                           #   — the per-loan monthly stacks behind
│   │                           #   "Visualize loans" (balances over time;
│   │                           #   per-month payments with the estimated
│   │                           #   interest share clamped to what was paid)
│   ├── cars/               # cars page — value / mileage / cost math + finder
│   │   ├── value.ts            # computeCarCurrentValue (snapshot > curve >
│   │   │                       #   purchase; leased/pool → undefined),
│   │   │                       #   resolveCarSnapshots (purchase folded in),
│   │   │                       #   carDepreciationToDate, currentCarMileage,
│   │   │                       #   carDistanceDriven, isCarOwned; lease model
│   │   │                       #   (leaseBalanceAt, leasedCarMarketValue,
│   │   │                       #   leasedCarEquity, carNetWorthContribution)
│   │   ├── costs.ts            # carCostBreakdown / carMonthlyCosts (chart
│   │   │                       #   feeds), carTotalCostOfOwnership (expenses /
│   │   │                       #   depreciation / loan-interest legs kept
│   │   │                       #   separate), carCostPerDistance, carExpenseKey
│   │   ├── series.ts           # buildCarValueSeries (monthly-sampled decay +
│   │   │                       #   optional cost / interest subtraction),
│   │   │                       #   buildCarMileageSeries
│   │   └── find.ts             # findCarExpenseCandidates — car-typed
│   │                           #   outflows in the ownership window minus
│   │                           #   already-linked / ignored / excluded
│   ├── investment/         # investment page — holdings + private-stock helpers
│   │   ├── holdings.ts         # resolveHoldingValueHistory (purchase folded in),
│   │   │                       #   currentHoldingValue / holdingValueAt,
│   │   │                       #   holdingTaxTreatment + holdingNetValue
│   │   ├── stock.ts            # resolveStockPosition — shares held + average cost
│   │   │                       #   via genomsnittsmetoden, current price + value;
│   │   │                       #   stockTaxTreatment + stockNetValue
│   │   └── series.ts           # buildInvestmentTotalSeries — combined value-over-
│   │                           #   time line behind "Visualize value" (gross/net)
│   ├── scenarios/          # scenarios page — what-if math over a base budget
│   │   ├── apply.ts            # findBaseBudget, applyScenario (clone with
│   │   │                       #   overrides / modulations / exclusions /
│   │   │                       #   scn:-id added rows), modulateAmount,
│   │   │                       #   overridesByRowId, diffScenario
│   │   └── series.ts           # computeScenarioState (applyScenario +
│   │                           #   computeBudgetState), monthlyEndBalances,
│   │                           #   buildScenarioChartPoints (union or pinned
│   │                           #   month axis, carry-forward fill, pre-range
│   │                           #   seeding), balanceAtDate (monitors)
│   ├── insights/           # insights page — cross-area aggregation
│   │   └── networth.ts         # computeNetWorthSnapshot (assets − liabilities
│   │                           #   per entity + per category, exclusion +
│   │                           #   ownership-share overrides; property mortgages
│   │                           #   counted with the property, linked-mortgage
│   │                           #   loans skipped to avoid double-counting) +
│   │                           #   buildNetWorthSeries (monthly net worth over
│   │                           #   time, last point = the snapshot total)
│   ├── receipts/           # host-generic receipt addressing
│   │   └── target.ts           # TxnReceiptTarget + resolveTxnReceipt + ReceiptNaming
│   │                           #   — address a receipt's host (history entry /
│   │                           #   budget row / property repair) so Items +
│   │                           #   repairs share one flow
│   ├── tax/                # country-pluggable tax engine — salary income tax
│   │   │                   #   (estimate gross from a net deposit), property-sale
│   │   │                   #   capital-gains, AND investment net-value-on-sale.
│   │   │                   #   No SE figure leaks outside se/
│   │   ├── types.ts            # TaxCountry, TaxParams, TaxProfile, TaxResult,
│   │   │                       #   TaxCalculator; TaxLocation, BrokerCost,
│   │   │                       #   PropertySale* + PropertySaleTaxCalculator,
│   │   │                       #   InvestmentTax* + InvestmentTaxCalculator,
│   │   │                       #   LocationCalculators (all country-agnostic)
│   │   ├── engine.ts           # salary registry + net→gross bisection; LOCATIONS
│   │   │                       #   bundle (salary + property-sale + investment per
│   │   │                       #   location) + SUPPORTED_LOCATIONS +
│   │   │                       #   computePropertySale + computeInvestmentNetValue
│   │   └── se/                 # ALL Sweden-specific rules live here
│   │       ├── index.ts        # swedishCalculator — grundavdrag, kommunal/statlig,
│   │       │                   #   jobbskatteavdrag, pensionsavgift, kyrkoavgift
│   │       ├── property-sale.ts # swedishPropertySaleCalculator — 22% capital-gains
│   │       │                    #   on a private residence (net = gain × 0.78)
│   │       ├── investment.ts   # swedishInvestmentCalculator — ISK/KF untaxed on
│   │       │                    #   sale, depå 30% (private) / 20.6% (company) gain
│   │       ├── constants.ts    # per-year pbb / ibb / skiktgräns (2022–2026)
│   │       └── municipalities.ts # ~290 kommuner + combined per-year rates
│   ├── achievements/      # the gamified "guided tour" system
│   │   ├── catalog.ts          # achievement definitions + unlock predicates
│   │   ├── derive.ts           # diff (prev, next) state → newly-unlocked ids
│   │   ├── bus.ts              # pub/sub for manual unlocks outside the reducer
│   │   ├── types.ts, index.ts, useAchievementWatcher.ts
│   ├── reducer.ts         # root reducer — delegates to reducers/* in sequence
│   ├── reducers/          # one sub-reducer per domain
│   │   ├── item/               # AccountBudget item reducer (updateCell, bulk
│   │   │                       #   patch, split, paste, drag-drop, hints,
│   │   │                       #   primary-income shifts)
│   │   ├── patch.ts            # shared applyPatch — id-keyed entity patch where
│   │   │                       #   explicit `undefined` deletes the key
│   │   ├── accounts.ts, salary.ts, properties.ts, savings.ts, loans.ts,
│   │   │   cars.ts, sheets.ts, transfers.ts, history.ts,
│   │   │   history-primary-income.ts, categories-and-types.ts, items.ts,
│   │   │   match-rules.ts, recurring.ts, series-metadata.ts, settings.ts,
│   │   │   achievements.ts, scenarios.ts
│   ├── validate/          # boundary validator: unknown → Result<UserData>
│   │   ├── index.ts            # validateUserData dispatcher + referential checks
│   │   ├── sheet.ts            # validateSheet + registry-dispatched validateSheetItem
│   │   ├── sheet-items.ts      # per-flavour leaf validators (column/row/budget/
│   │   │                       #   accountsView/itemsView/salaryView/
│   │   │                       #   propertiesView/savingsView/loansView/
│   │   │                       #   carsView/scenariosView) —
│   │   │                       #   cycle-free so the sheet-type descriptors can
│   │   │                       #   import them
│   │   ├── salary.ts           # validateSalary + validateEmployer (+ roles)
│   │   ├── savings.ts          # validateSaving (+ balance points)
│   │   ├── loans.ts            # validateLoan (+ payments; sweeps dangling
│   │   │                       #   companyId and half-dangling mortgage links)
│   │   ├── cars.ts             # validateCar (+ snapshots / expenses /
│   │   │                       #   contracts; sweeps dangling loanId, drops
│   │   │                       #   empty snapshots, half-linked expense source
│   │   │                       #   pairs, and pathless / unknown-kind contracts)
│   │   ├── properties.ts       # validateProperty (+ value points / mortgages /
│   │   │                       #   payments / repairs; drops dangling property accountId)
│   │   ├── tax.ts              # validateTaxProfile (+ per-country params)
│   │   ├── account.ts, history.ts, rules.ts, settings.ts, theme.ts,
│   │   │   helpers.ts
│   ├── migrations/        # forward-only schema migration runner
│   │   ├── index.ts            # LATEST_VERSION (66) + migrate() driver
│   │   ├── legacy.ts           # v1 → v30 steps
│   │   ├── modern.ts           # v31 → v65 steps
│   │   └── shared.ts           # MigrationContext, Versioned, helpers
│   ├── reconciliation.ts  # matches imported history against budget rows
│   ├── import-staging.ts  # pure bank-import pipeline (merge → match → outcome)
│   ├── recurrence.ts      # RecurrenceRule + expandRecurrence + isIsoDate
│   ├── description-normaliser.ts  # lossy merchant-key normaliser (shared)
│   ├── company-type-hints.ts  # company→type + type→company + description→company
│   │                       #   hints (manual + learned); consumed by budget,
│   │                       #   accounts, and the AppShell hooks (cross-page)
│   ├── cover-transfer.ts   # cover-transfer roles + message matching
│   │                       #   (generateCoverMessage, buildCoverIndex,
│   │                       #    applyCoverRoles, attachImportedCoverTransfers);
│   │                       #   consumed by budget, accounts reducer, AppShell (cross-page)
│   ├── synthesis.ts       # synthesize history + transfer rows into the Row
│   │                       #   shape (synthesizeHistoryRow / -TransferRow,
│   │                       #   resolveEntryLabels); consumed by budget,
│   │                       #   scenarios, items/loans/properties finders
│   │                       #   and cover-transfer (cross-page)
│   ├── merchant-hints.ts  # per-merchant type memory recorder + suggester
│   ├── match-rules.ts     # glob matcher for synthesized history rows
│   ├── rename-patterns.ts # per-account "bank wrote X, user calls it Y" memory
│   ├── coverage.ts        # fiscal-month coverage of imported history
│   ├── history.ts         # historyDateRange + historyStaleness: imported-tx date span / staleness (cross-page)
│   ├── hit-count.ts       # reinforce-or-reset counter for memory stores
│   ├── row-candidate.ts   # Row → RuleCandidate projection (cross-page)
│   ├── search.ts          # ranked full-text search over rows
│   ├── normalize.ts       # trim/validate helpers for user-typed names
│   ├── settings.ts        # device-scope split (mobile vs desktop) helpers
│   ├── themes.ts          # theme presets + custom-theme defaults
│   ├── action-payloads.ts # reducer action payload shapes (no runtime deps)
│   └── action-summary.ts  # describeActionSubject: action → history subject (cross-page)
├── storage/
│   ├── adapter.ts             # StorageAdapter interface + Snapshot / error types
│   ├── local.ts               # bootstrap helpers — freshUserData() + parse
│   ├── local-adapter.ts       # raw localStorage byte access
│   ├── idb-adapter.ts         # IndexedDB byte store (large budgets, mirror cache)
│   ├── dev-seed-adapter.ts    # ephemeral in-memory backend (id "dev") preloaded
│   │                          #   with fake data — Developer "Fake data" toggle
│   ├── folder-adapter.ts      # File System Access adapter (id "folder")
│   ├── folder-handle-store.ts # IDB persistence + permission helpers for the handle
│   ├── dropbox-adapter.ts     # Dropbox HTTP adapter + OAuth (PKCE)
│   ├── gdrive-adapter.ts      # Google Drive HTTP adapter + OAuth (PKCE)
│   ├── oauth-pkce.ts          # shared PKCE helpers + redirect-URI derivation
│   ├── encrypting-adapter.ts  # AES-GCM envelope wrapper around any adapter (budget + backups; receipts/payslips pass through)
│   ├── crypto.ts              # PBKDF2-SHA256 + AES-GCM primitives
│   ├── cloud-mirror.ts        # offline mirror wrapper around a cloud adapter
│   ├── cloud-link-types.ts    # in-flight cloud/folder link state types
│   ├── wrap-for-active.ts     # encryption wrapping for the active user
│   ├── save-chain.ts          # coalesces overlapping async saves
│   ├── backend-preference.ts  # per-user backend choice + cloud tokens
│   ├── backup-index.ts        # backup manifest serializer + tolerant parser
│   ├── backup-metadata.ts     # derive BackupMetadata from UserData + filename
│   ├── backup-ops.ts          # shared BackupOps lifecycle factory over a backend's file primitives
│   ├── boot-auth.ts           # AuthState resolved from session + users registry
│   ├── session.ts             # sessionStorage cache for the active password
│   ├── users.ts               # device-wide user registry + PBKDF2 hashing
│   ├── file.ts                # JSON file codec: serializeUserData + parseUserData
│   ├── xlsx-reader.ts         # minimal ZIP-based xlsx reader for bank files
│   ├── fsa.d.ts               # File System Access API type augmentation
│   ├── use*.ts                # storage hooks (useUserDataStorage,
│   │                          #   useStorageBackend, useSaveStateMachine,
│   │                          #   useLoadState, useUndoRedo, useDropboxAuth,
│   │                          #   useGdriveAuth, useFolderHandle)
│   └── banks/                 # bank-statement import
│       ├── index.ts, core.ts      # parser registry, tryParse, mergeHistory dedup
│       ├── define-csv.ts, define-xlsx.ts, helpers.ts
│       └── parsers/               # ica, norwegian, skandia, swedbank
├── hooks/                 # universal React hooks (useTheme, useToast,
│   │                      #   useIdleSignOut, useRowSwipe, useSheetSwipe,
│   │                      #   usePullToRefresh, useEffectiveSettings, …)
│   └── index.ts               # re-exports + dom-queries / touch-gestures
├── i18n/
│   ├── index.ts               # LanguageProvider, useT(), tFor(), plural()
│   ├── LanguageRoot.tsx       # top-level provider mounted by main.tsx
│   ├── locale.ts              # Lang type, bcp47(), detectInitialLanguage()
│   ├── language-preference.ts # plaintext localStorage mirror of the choice
│   ├── preset-names.ts        # localized preset entity names
│   └── locales/
│       ├── en.ts, sv.ts           # re-export the composed catalogs
│       ├── en/                    # one file per namespace + index.ts + _widen.ts
│       │                          #   + achievements/ nested subdir
│       └── sv/                    # mirrors en/ file-for-file
├── utils/
│   ├── date.ts                # todayIso, addMonthsIso (pure date helpers)
│   ├── format.ts              # formatNumber, withCurrency, lang-aware months
│   ├── semver.ts              # cmpSemver for changelog gating
│   ├── xlsx.ts, xlsx-format.ts, zip.ts   # spreadsheet export + zip writer
│   ├── logger.ts, download.ts, scroll-lock.ts, build-env.ts, json.ts,
│   │   parse.ts, indexById.ts, monthColor.ts
└── seo/
    ├── siteConfig.ts          # SITE_URL, SITE_NAME, AUTHOR, OG defaults
    └── routes.ts              # per-route <title> / description / JSON-LD
```

The `src/seo/` modules are also imported by `vite.config.ts` — its
`emit-path-alias-with-seo` plugin reads `dist/index.html` after the
Vite build and writes `dist/<route>/index.html` for each entry in
`routes.ts` with the route-specific `<title>`, meta description,
canonical, og:\*, twitter:\*, and JSON-LD blocks spliced in between
the `<!-- HEAD_SEO_START -->` / `<!-- HEAD_SEO_END -->` markers in the
shell. The plugin also emits a `dist/404.html` copy marked
`noindex,follow` so GitHub Pages' SPA-fallback URLs don't leak
soft-404 signals. Preview / branch builds set `noindex,nofollow` on
every alias and short-circuit `sitemap.xml` / `llms.txt` so the
staging slots never appear in either discovery surface.

## Planned shape

The module boundaries assume the vision in `AGENTS.md` lands later:
more sheet types (parental-leave and similar planners), per-account
roll-up views, and richer forecasting. Those slot in without a
re-layout:

```
src/
├── data/
│   ├── sheet-types/      # one descriptor file per new flavour + registry entry
│   └── forecasting/      # savings, loans, leave planning — pure, local (TBD)
└── components/
    └── <page>/           # one directory per new page type + an AppShell arm
```

No planned feature introduces a backend, an account service, or a
third-party data store — the local-first invariant holds throughout.

## Data model

The persistent state is a single JSON document per signed-in user. The
user's bytes live under `userDataKey(userId)` (`budget.user.<id>`); the
legacy single-user bucket `STORAGE_KEY` (`budget.v1`) is read only once
on first launch so pre-accounts data migrates into the first account
created. The device-wide user registry (`StoredUser[]` + active id)
lives under `USERS_KEY` (`budget.users.v1`). All three key strings are
routed through `nsKey()` so the preview / branch deploy slots get their
own namespaced copies (see "Preview deploy and data isolation" in
`AGENTS.md`).

Each document carries its own `version` field. Top-level shape:

```ts
type UserData = {
  version: 56;
  sheets: Sheet[];
  activeSheetId: string;
  accounts: Account[];
  // User-curated cross-cutting labels (no presets). Referenced from
  // `Row.tagIds`; never rendered on the sheet — editable in the entry
  // edit / bulk-edit modals and searchable in the search modal.
  tags: Tag[];
  // User-curated merchants / organisations (no presets). Referenced
  // from `Row.companyId`, `HistoryEntry.userCompanyId`,
  // `MatchRule.companyId`, `MerchantHint.companyId`. Each may carry
  // optional drag-ordered `typeIds` seeding the company → type hints,
  // and an optional `companyCategoryId` classifying the merchant.
  companies: Company[];
  // Merchant kinds (Grocery stores, Pharmacies, Fuel …) for "where do
  // I shop" analysis; referenced by `Company.companyCategoryId`. The
  // runtime also shows built-in `PRESET_COMPANY_CATEGORIES` (in code,
  // not here); hide individual presets via hiddenPresetCompanyCategoryIds.
  companyCategories: CompanyCategory[];
  hiddenPresetCompanyCategoryIds: string[];
  // Analysis buckets; each EntryType belongs to exactly one of these.
  // The runtime also shows built-in `PRESET_CATEGORIES` (in code, not
  // here); the user hides individual presets via hiddenPresetCategoryIds.
  categories: Category[];
  // Concrete labels parented by `EntryType.categoryId`. The runtime
  // also shows built-in `PRESET_ENTRY_TYPES`; hide via hiddenPresetTypeIds.
  types: EntryType[];
  hiddenPresetTypeIds: string[];
  hiddenPresetCategoryIds: string[];
  // Per-user override of a preset type's income/expense/any `kind`.
  presetTypeKindOverrides: Record<string /* presetTypeId */, EntryTypeKind>;
  // Cross-account transfers (renamed from `transactions` in v40); see below.
  transfers: Transfer[];
  history: Record<string /* accountId */, HistoryEntry[]>; // imported bank rows
  historyImports: Record<string /* accountId */, HistoryImport[]>; // import audit log
  // Per-merchant type memory keyed by the normalised description (see
  // `description-normaliser.ts`). Advisory only — surfaced, never
  // silently applied. Hints whose typeId no longer resolves are dropped.
  merchantHints: Record<string /* normalised description */, MerchantHint>;
  // Normalised-description keys dismissed "Not recurring" on the
  // candidates panel; the detector skips these on every import.
  recurringDismissals: string[];
  // Pair keys dismissed "Never" on the transfer-collapse modal.
  transferCollapseDismissals: string[];
  // History-entry ids ignored from the Items sheet's "Find items" scan;
  // the scanner skips these (same shape/contract as recurringDismissals).
  ignoredItemEntryIds: string[];
  // Normalised-description keys excluded from "Find items" via "Exclude
  // similar"; the scanner drops every entry whose resolved description
  // collapses to one of these (past + future imports).
  itemFindExclusionPatterns: string[];
  // The Cars sheet's "Find car expenses" dismiss pair — same contracts
  // as the two items-finder lists above. Added in v84 alongside
  // `cars: Car[]` (the cars catalog itself, listed with the other
  // entity collections omitted from this snippet).
  ignoredCarExpenseEntryIds: string[];
  carExpenseExclusionPatterns: string[];
  // "Not a duplicate" rules for the cross-account duplicate finder, keyed
  // by EXACT bank description + signed amount; the finder skips matching
  // entries on every import. Cleared from the Memory settings tab.
  duplicateIgnores: DuplicateIgnore[];
  // User-authored wildcard rules that relabel synthesized history rows.
  matchRules: MatchRule[];
  // Auto-reconciliation rules learned from "Apply to whole series" in
  // the post-import reconciliation modal.
  seriesMatchRules: SeriesMatchRule[];
  // Per-account rename memory: "the bank wrote X, the user calls it Y".
  // Recorded inside the `updateHistoryEntry` reducer chokepoint and
  // surfaced by `AccountRenamePredictorModal` on import. See
  // `src/data/rename-patterns.ts`.
  renamePatterns: Record<
    string /* accountId */,
    Record<string /* normalised description */, RenamePattern>
  >;
  // Per-series toggles keyed by seriesId (today: primary-income flag +
  // anchor day-of-month). Orphan-tolerant.
  seriesMetadata: Record<string /* seriesId */, SeriesMetadata>;
  // Learned "this bank pattern is my salary" rules; each stamps
  // `fiscalMonthShift = 1` on matching entries that arrived early.
  primaryIncomeMerchants: PrimaryIncomeMerchant[];
  settings: PersistedSettings;
};
```

`Settings` is split into a synced common scope and a per-device scope
(`settings.device.{mobile,desktop}`, added in v35) so number-format,
font-scale, header-action, and download preferences can differ per
viewport. The full shape lives in `src/data/types/settings.ts`; the
`src/data/settings.ts` helpers translate between the flat and bucketed
forms.

### Accounts, transfers, and history

```ts
type Account = {
  id: string;
  name: string;
  // All fields below are optional display / bank-detail metadata; the
  // budget logic reads only `id` and `name`.
  description?: string;
  glyph?: CategoryIcon;
  color?: string;
  bank?: string;
  clearing?: string; // Swedish clearingnummer
  accountNumber?: string;
  iban?: string;
  bic?: string; // BIC / SWIFT
  currency?: string; // overrides Settings.currency for this account
  openingBalance?: number; // anchored from the earliest imported entry
};

type Transfer = {
  id: string;
  date: string; // ISO YYYY-MM-DD
  description: string;
  amount: number; // ALWAYS positive — direction = from → to
  fromAccountId: string; // money flows OUT of this account
  toAccountId: string; // money flows INTO this account
  typeId?: string | null; // category derived via types[typeId].categoryId
  completed?: boolean;
};

type HistoryEntry = {
  id: string; // content hash so re-importing dedups
  date: string;
  description: string;
  amount: number; // signed (negative = outgoing)
  balance?: number; // omitted for credit-card exports (e.g. Bank Norwegian)
  importedAt: number; // unix ms of first import
  importId?: string; // backref into UserData.historyImports[accountId] (import session)
  hidden?: boolean; // shelved noise OR collapsed-into-transfer
  fiscalMonthShift?: -1 | 1;
  collapsedIntoTransferId?: string; // backref into UserData.transfers
  isTransfer?: boolean; // user-flagged inter-account transfer
  ignored?: boolean; // excluded from spending statistics (stays in balance)
  // Per-entry overlays applied on top of MatchRule / MerchantHint in
  // `synthesizeHistoryRow` (highest priority). Set by the pen button on
  // a history row and the inline cells.
  userDescription?: string;
  userTypeId?: string;
  userSeriesId?: string; // recurring-series link kept when reconciliation
  //                        matches the entry to a series budget row
  userCompanyId?: string;
  userTagIds?: string[]; // UNIONed with matching MatchRule.tagIds
  hintIgnored?: boolean; // opt this entry out of the merchant-hint step
  noCompany?: boolean; // declared "no company needed" (metadata mode)
  // User split of one bank entry into categorised parts; the splits'
  // signed amounts must sum to `amount`. Each `HistoryEntrySplit`
  // carries its own description / amount / typeId / companyId / tagIds.
  splits?: HistoryEntrySplit[];
};
```

Transfers are top-level (not duplicated rows on the involved budgets).
Budget views synthesize a read-only `TransferRow` on each side at
render time so the running balance and month grouping pick the transfer
up; history entries synthesize a read-only `HistoricRow` the same way.
Synthesized rows are never persisted — the validator only lets
`UserRow | CorrectionRow` reach `item.rows[]`, and the synthesizers
never write into that array. When summing balances from a persisted
export, walk `transfers` directly: incoming on the `toAccountId` side,
outgoing on the `fromAccountId` side.

### Sheets, items, rows, and columns

```ts
type Sheet = {
  id: string;
  name: string;
  type: SheetType; // today: "budget" | "accounts" | "items"; planners join later
  glyph: SheetGlyph; // displayed in the bottom tab bar
  color: string; // hex; tints the tab and the editor preview
  description: string; // free-form note shown in the modal
  items: SheetItem[]; // typed blocks rendered inside the sheet
};

type SheetType = "budget" | "accounts" | "items" | "salary";
type SheetGlyph = CategoryIcon; // reuses the glyph allowlist
type SheetItem = AccountBudget | AccountsView | ItemsView | SalaryView;

type AccountBudget = {
  id: string;
  type: "accountBudget";
  accountId: string | null; // points at one of UserData.accounts, or null
  columns: Column[]; // ordered; drag-and-drop reorders this array
  rows: Row[]; // persisted UserRow / CorrectionRow only
};

type AccountsView = { id: string; type: "accountsView" }; // singleton dashboard
type ItemsView = { id: string; type: "itemsView" }; // singleton owned-items catalog
type SalaryView = {
  id: string;
  type: "salaryView";
  accountId: string | null; // the pay account "Find salaries" scans, or null
  taxProfileId?: string; // a UserData.taxProfiles entry → estimate gross from net
};

// Reusable tax-input bundle on UserData.taxProfiles, referenced by
// SalaryView.taxProfileId. Country-pluggable; the calculator lives under
// src/data/tax/<country>/.
type TaxProfile = {
  id: string;
  name: string;
  params: TaxParams; // discriminated by `country` ("SE" today)
};

// Property-sale capital-gains tax is the other half of the tax engine.
// The global Settings.location (a TaxLocation, "SE" today) selects a
// LocationCalculators bundle in src/data/tax/engine.ts; computePropertySale
// runs the location's calc over { sellPrice, purchasePrice, repairs,
// advertisementCost, broker }. The saved inputs live on Property.saleEstimate.

type ColumnType =
  | "date"
  | "description"
  | "type"
  | "amount"
  | "balance"
  | "completed";
type Column = { id: string; type: ColumnType; label: string };

// Persisted variants share RowBase (id, cells, seriesId, fiscalMonthShift,
// typeId, typeIdLocked, companyId, noCompany, tagIds, amountFormula,
// amountMin/Max, isTransfer, ignored). `noCompany` is the explicit
// "omit company" decision (mutually exclusive with companyId), set by the
// add-entry modal / row editor / inline picker. Synthesized variants
// (HistoricRow, TransferRow) add their own runtime-only fields and never
// reach storage.
type Row = UserRow | CorrectionRow | HistoricRow | TransferRow;
```

A row's category is **derived** through its type: the row stores
`typeId`, the type stores `categoryId`, the category record lives on the
`UserData`. There is no category cell and no category column — the
`"type"` column (re-introduced in v26) renders the type chip, and the
`updateCell` reducer routes writes for it straight into `row.typeId`.
The display text for a row falls through description → company name →
type name → raw bank text.

The `balance` column is **derived** — `computeBalances()` produces a
running total from each row's date and amount; it is never written to
row cells. Month grouping is also a view concern: `groupRowsByMonth()`
buckets rows by fiscal month (respecting `Settings.startOfMonth` and
any `fiscalMonthShift`). Cells are keyed by column id (not type) so a
sheet can carry multiple columns of the same type without ambiguity.

### Migrations

`src/data/migrations/` holds a forward-only chain keyed by source
version, split across `legacy.ts` (v1 → v30) and `modern.ts` (v31 →
`LATEST_VERSION`); `index.ts` assembles both and drives `migrate()`.
Loading any persisted budget — from `localStorage`, a cloud backend, or
an imported file — runs through `parseUserData()` in
`src/storage/file.ts`:

1. `JSON.parse` the raw text.
2. `migrate()` walks the version forward one step at a time until it
   reaches `LATEST_VERSION`. A newer-than-supported version is a hard
   error (the data is from a future build of the app).
3. `validateUserData()` enforces the latest schema. Soft anomalies are
   repaired (cells referencing dropped columns are removed, dangling
   type / company / tag references are dropped, a dangling
   `activeSheetId` falls back to the first sheet); hard violations
   (unknown column type, duplicate ids, wrong field types) are surfaced
   as an error string.

Current `LATEST_VERSION` is `52`. The chain has fifty-one steps:

- **v1 → v2** — adds top-level `categories: []` and inserts a
  `category` column into every sheet (removed again in v25).
- **v2 → v3** — version bump; flags optional `Row.seriesId`.
- **v3 → v4** — introduces budget-level `settings` with canonical
  defaults.
- **v4 → v5** — introduces explicit `Account`s and turns each `Sheet`
  into a container of typed `SheetItem`s; pre-v5 columns / rows move
  into one `AccountBudget` pointing at a default account.
- **v5 → v6** — widens `AccountBudget.accountId` to `string | null`.
- **v6 → v7** — adds per-sheet display metadata (`type`, `glyph`,
  `color`, `description`).
- **v7 → v8** — version bump; flags an (since-removed) optional
  `Row.glyph` field.
- **v8 → v9** — adds top-level `transactions: []` (cross-account
  transfers) plus the `"accounts"` sheet flavour and optional `Account`
  bank-detail metadata.
- **v9 → v10** — version bump; flags optional `Row.isCorrection`.
- **v10 → v11** — adds `history: {}` / `historyImports: {}` and optional
  `Account.openingBalance`.
- **v11 → v12** — adds `merchantHints: {}`, `recurringDismissals: []`,
  `transferCollapseDismissals: []`, and an optional
  `collapsedIntoTransactionId` backref on `HistoryEntry`.
- **v12 → v13** — version bump; flags `Settings.abbreviateNumbers`.
- **v13 → v14** — introduces reusable `EntryType` records and
  `Row.typeId`; seeds Swedish-typical defaults and strips `row.glyph`.
- **v14 → v15** — `MerchantHint` gains optional `typeId` / `description`.
- **v15 → v16** — adds top-level `matchRules: []`.
- **v16 → v17** — `HistoryEntry.balance` becomes optional.
- **v17 → v18** — flags `Settings.fontScale`.
- **v18 → v19** — flags `Settings.lastSeenChangelogVersion`.
- **v19 → v20** — introduces preset types / categories plus the per-user
  hide lists.
- **v20 → v21** — flags `Settings.alwaysAbbreviateBalance`.
- **v21 → v22** — adds top-level `seriesMatchRules: []`.
- **v22 → v23** — introduces optional `Row.amountFormula`.
- **v23 → v24** — introduces optional `amountMin` / `amountMax` on
  `MatchRule`.
- **v24 → v25** — restructures categories to _contain_ types:
  `EntryType` gains required `categoryId`, the `"category"` column is
  removed, every category column is stripped, and
  `Transaction.categoryId` / `MerchantHint.categoryId` /
  `MatchRule.categoryId` fold into `typeId` (category derived via
  `EntryType.categoryId`).
- **v25 → v26** — re-introduces a dedicated `"type"` column on every
  `AccountBudget` (writes route into `row.typeId`).
- **v26 → v27** — adds `Settings.language` (defaults existing buckets to
  `"en"`).
- **v27 → v28** — flags optional `HistoryEntry.userDescription` /
  `userTypeId`.
- **v28 → v29** — adds `Settings.hideTransfers` and optional
  `Row.isTransfer` / `HistoryEntry.isTransfer`.
- **v29 → v30** — flags optional `HistoryEntry.splits`.
- **v30 → v31** — adds the theme picker (`Settings.theme`), font-family
  picker, and nested `Settings.customTheme` overrides.
- **v31 → v32** — introduces `EntryType.kind` and
  `UserData.presetTypeKindOverrides: {}`.
- **v32 → v33** — adds the achievements system
  (`Settings.achievements` + `unseenAchievements`).
- **v33 → v34** — adds `Settings.headerAction` (default "go to top").
- **v34 → v35** — splits `Settings` into common + device scopes
  (`settings.device.{mobile,desktop}`) and absorbs three device-local
  localStorage keys (cloud-reauth, download prefs). Uses the
  `MigrationContext.userId` to read those keys on the production load
  path; the import path seeds defaults.
- **v35 → v36** — flags optional `HistoryEntry.hintIgnored`.
- **v36 → v37** — adds `Settings.columnBorders` (removed again in v38).
- **v37 → v38** — removes `Settings.columnBorders`.
- **v38 → v39** — flags optional `Row.typeIdLocked`.
- **v39 → v40** — renames `transactions` → `transfers` on the envelope
  and `HistoryEntry.collapsedIntoTransactionId` →
  `collapsedIntoTransferId`.
- **v40 → v41** — adds `renamePatterns: {}`.
- **v41 → v42** — adds user-curated `companies: []` plus optional
  `companyId` fields across `Row`, `HistoryEntry.userCompanyId`,
  `HistoryEntrySplit`, `MerchantHint`, `MatchRule`, `RenamePattern`.
- **v42 → v43** — adds optional `Row.fiscalMonthShift` and
  `seriesMetadata: {}`.
- **v43 → v44** — adds optional `HistoryEntry.fiscalMonthShift` and
  `primaryIncomeMerchants: []`.
- **v44 → v45** — adds user-curated `tags: []`.
- **v45 → v46** — flags optional `HistoryEntry.userTagIds` and
  `MatchRule.tagIds`.
- **v46 → v47** — adds `Settings.searchRanking` (transaction-search
  ranker knobs).
- **v47 → v48** — flags optional `HistoryEntrySplit.tagIds`.
- **v48 → v49** — adds user-curated `subtypes: []` (third taxonomy tier)
  and `items: []` (owned things), plus optional `Row.lineItems` /
  `HistoryEntry.lineItems` (links tying part of an entry to an item).
- **v49 → v50** — adds optional `Company.typeIds` (drag-ordered manual
  type associations seeding the company → type hints) and retires
  `Settings.companyTypeAutoFillMinOccurrences`. A bare version bump —
  both shape changes are absence-tolerant.
- **v50 → v51** — adds user-curated `companyCategories: []` (merchant
  kinds for "where do I shop" analysis) + `hiddenPresetCompanyCategoryIds:
[]`, plus optional `Company.companyCategoryId`. The runtime layers
  built-in `PRESET_COMPANY_CATEGORIES` on top, so both arrays seed
  empty; all three shape changes are absence-tolerant.
- **v51 → v52** — grows `Item` with `purchasePrice`, a `depreciation`
  rule (`ItemDepreciation`, percent-per-year), a `resaleValue` override,
  and disposal (`disposedAt` / `soldFor`). A bare version bump — every
  new field is optional per item, so a v51 record is absence-tolerant.
- **v60 → v61** — drops `LineItemLink.amount`: a line item is now purely
  a link from a transaction to an owned `Item`, and what the item cost
  lives on the item (`Item.purchasePrice`). The migration folds each
  link's old signed amount onto its item as a non-negative purchase price
  (first link to name an unpriced item wins; pre-priced items untouched),
  then strips `amount` off every link across budget rows and bank history.
- **v61 → v62** — adds `UserData.properties`, the homes / apartments
  rendered by the Properties sheet (each with its purchase amount, a
  manually-recorded value history, and the mortgages against it). Seeds
  empty; a bare additive bump.
- **v66 → v67** — adds `Property.repairs`, the transaction-linked repairs /
  renovations on each property (each sourced from a bank charge tagged
  Repairs / Renovations, recorded for a future deductible "net value"
  calc). Seeds an empty list on every property; a bare additive bump.
  Each repair later gained an optional user `description` (editable) and a
  `subtypeId` classifying the work under its Repairs / Renovations type —
  both additive optional fields that need no migration (absent ⇒ unset).
  A repair can now also group several transactions paying one invoice via an
  optional `additionalSources` (`{ accountId, entryId }[]`); the primary
  `accountId` / `sourceHistoryId` resolves the row's company / tags, and
  `amount` is the sum across every source. The `accountId` /
  `sourceHistoryId` pair is now itself **optional**: a **manual** repair (work
  older than the imported bank history reaches) has no backing transaction, so
  it omits the pair and instead stores its own `companyId` / `tagIds` on the
  repair (a transaction-backed repair still resolves those live off its
  source). Loosening a required field and adding optional ones is
  backward-compatible — old budgets read unchanged — so no version bump.
- **v68 → v69** — a repair's receipts become a **list of dated documents**
  (`receipts?: RepairReceipt[]`, each `{ id, path, date }`) instead of the
  single `receiptPath` v68 introduced. A job is often paid across several
  invoices over time, each on its own date. The migration converts an
  existing `receiptPath` into a one-element `receipts` list dated with the
  repair's own date (the only date a v68 budget carries for it); a
  receiptless repair is untouched. Receipts file into the property's
  `<name>/receipts/` store named from the **receipt's** date, and are managed
  through `addRepairReceipt` / `updateRepairReceipt` / `removeRepairReceipt`
  and the `usePropertyAttachments` callbacks.
- **v69 → v70** — adds `UserData.savings`, the savings accounts rendered by
  the new Savings sheet (each a `Saving` with bank details and a
  manually-recorded `balanceHistory`). Seeds empty; old exports simply lack
  it and the v70 validator fills `savings: []` regardless. Savings
  transactions live in `UserData.history` keyed by the saving's id and a
  saving is a first-class transfer endpoint, so the history / transfer
  validators widen their known-id checks to accept saving ids alongside
  account ids.
- **v71 → v72** — bare bump adding the `customTheme.tableSpacing` preset
  (`compact | comfortable | spacious`). The settings validator fills it
  from the canonical default when absent, so old exports upgrade without
  touching the blob. Drives the `--table-cell-px` / `--table-cell-py`
  CSS vars the budget ledger cells read for their per-cell padding.
- **v72 → v73** — adds `UserData.loans`, the loans rendered by the new
  Loans sheet (each a `Loan` with kind / terms / lender fields, recorded
  `payments`, learned `paymentPatterns`, and — for a mortgage — an
  optional live link to a property's mortgage). Seeds empty; old exports
  simply lack it and the v73 validator fills `loans: []` regardless.
- **v73 → v74** — a mortgage loan links **many** property mortgages
  instead of one: `Loan.mortgageId: string` becomes
  `Loan.mortgageIds: string[]`, because a property's combined monthly
  charge covers every loan against it and the Loans sheet lists that as
  one row. Existing single links convert to one-element arrays.
- **v74 → v75** — loans gain dated balance snapshots
  (`Loan.balanceHistory`) and lose the hand-entered `monthlyPayment`
  (the Monthly column derives from recorded payments). A STUDENT loan's
  `startSum` converts to one snapshot and is dropped.
- **v75 → v76** — grows `Item` with an optional `lifetimeYears`
  (expected useful life in years, driving the spending dashboard's
  "spread item costs" mode). A bare version bump — the field is
  optional per item, so a v75 record is absence-tolerant.

- **v79 → v80** — grows `Property` with an optional `associationLoan`
  (`AssociationLoan`): the property's share of a housing association's
  own debt, entered per unit of living area plus the association's
  interest rate. The Visualize-value chart deducts the indirect
  interest that rides the monthly fee. A bare version bump — the field
  is optional per property, so a v79 record is absence-tolerant.
- **v80 → v81** — flags optional `Row.ignored` / `HistoryEntry.ignored`,
  the "ignore for statistics" toggle: an ignored entry stays in the
  ledger and running balance but drops out of the spending dashboard's
  facts. A bare version bump — the field is optional, so a v80 record is
  absence-tolerant.
- **v81 → v82** — adds `UserData.duplicateIgnores: []`, the "not a
  duplicate" rules (EXACT bank description + amount) the cross-account
  duplicate finder skips on every import. Seeds empty; a v81 record
  simply lacks it and a fresh-empty default passes the v82 validator
  unchanged.
- **v82 → v83** — flags optional `HistoryEntry.importId`, the backref to
  the `HistoryImport` session that first added the entry. Lets the
  cross-account duplicate finder remove a whole mis-imported statement,
  not just the colliding row. A bare version bump — the field is optional,
  so a v82 record is absence-tolerant.

## State management

`src/data/reducer.ts` is the root reducer: it threads each action
through the per-domain sub-reducers in `src/data/reducers/` in
sequence, each a pure function that returns the next `UserData` (or a
no-op identity). The split keeps each domain — accounts, sheets,
transfers, history, categories-and-types, match-rules, recurring,
series-metadata, settings, achievements — in its own module. The
`reducers/item/` directory owns the `AccountBudget` item reducer
(`updateCell`, bulk patch, split, paste, drag-drop, merchant-hint
recording, primary-income shifts). `src/data/action-payloads.ts` holds
the action payload shapes so modal components can build a dispatch
without importing reducer internals.

## Complex entries

`src/data/recurrence.ts` defines `RecurrenceRule` — a discriminated
union covering one-off dates, an arbitrary list of dates, an
every-N-days cadence, and an every-N-months cadence with an anchor
`dayOfMonth` and signed `offsetDays`. Monthly / quarterly / yearly are
presets over the `everyNMonths` rule. `expandRecurrence(rule)` returns
a sorted, de-duplicated list of ISO `YYYY-MM-DD` strings clamped to
`[start, end]`.

`BudgetComplexEntryModal` collects a description, amount, type, and a
recurrence rule; on submit it expands the rule, dispatches one row per
emitted date, and tags every generated row with a shared `seriesId` so
they can be edited or deleted as a group later. The row's category is
derived from the chosen type at render time.

### Series operations

Each row has two actions, revealed by swiping the row left on mobile
(or via the action icons at the right edge on desktop):

- **Repeat icon** opens `BudgetEditEntryModal`. On a non-series row it
  is a "promote to recurring" form (reuses `RecurrenceForm`,
  dispatches `convertToRecurring`). On a series row it adds a **scope
  chooser** — "Only this entry" or "This entry and all future" with an
  optional "until …" date — dispatched as `editSeries`.
- **Trash icon** opens a delete prompt; for a series row it offers
  "Just this one" and "This and all future (N)" in a single
  `deleteRows` dispatch.

Inline cell edits on series rows stay local — only the repeat icon
propagates changes across a series.

## Detection over imported history

Pure modules under `src/data/` correlate imported `HistoryEntry`s into
actionable suggestions, all keyed off a single shared
`normaliseDescription` so a Spotify charge detected as recurring also
memorises its type under the key the next import looks up:

- `description-normaliser.ts` collapses cosmetic differences — case,
  whitespace, dates, currency suffixes, long digit sequences, and a
  small allowlist of Swedish bank-noise prefixes — into a stable key.
- `budget/recurring-detection.ts` buckets entries by normalised key,
  ranks each bucket by cadence regularity / amount stability /
  occurrence count, and emits `RecurringCandidate`s for
  `BudgetRecurringCandidatesPanel`. Dismissals persist in
  `recurringDismissals`.
- `accounts/transfer-collapse.ts` finds mirror pairs across accounts
  and emits `TransferCandidate`s for `AccountTransferCollapseModal`.
  Collapsing mints a `Transfer`, stamps both source entries
  `hidden: true` + `collapsedIntoTransferId` (reversible and
  idempotent). Dismissals persist in `transferCollapseDismissals`.
- `merchant-hints.ts` records the per-merchant type memory at the tail
  of every type-assigning reducer action; the candidates panel renders
  a "Suggested: <chip>" hint — always visible, never auto-applied.
- `rename-patterns.ts` records per-account "bank wrote X, user calls it
  Y" memory through the `updateHistoryEntry` chokepoint; the next
  import offers learned renames via `AccountRenamePredictorModal`.

The Settings → "Memory" tab surfaces the size of each store and a
Clear-all so a misclick is one tap away.

## Storage and sync

Every backend implements the `StorageAdapter` interface in
`src/storage/adapter.ts` (`load` / `save` / `clear`, capability flags,
and `AuthError` / `ConflictError` / `RateLimitError`). Four backends
ship, selected per user via `BackendId` (`"browser"` | `"folder"` |
`"dropbox"` | `"gdrive"`):

- **browser** — `local-adapter.ts` over `localStorage`, plus
  `idb-adapter.ts` for larger blobs.
- **folder** — `folder-adapter.ts` over the File System Access API;
  the directory handle persists in IndexedDB via
  `folder-handle-store.ts`.
- **dropbox** — `dropbox-adapter.ts` writes `/budget.json` and
  `/backups/` inside the app folder `budget.niclaslindstedt.se`
  (OAuth via PKCE).
- **gdrive** — `gdrive-adapter.ts` writes `budget.json` and a backups
  folder inside a `budget` folder in My Drive (scope `drive.file`).

Adapters compose: `encrypting-adapter.ts` wraps any adapter in an
AES-GCM envelope (key derived from the user's password via
PBKDF2-SHA256, 600 000 iterations, 256-bit key, per-envelope 16-byte
salt + 12-byte IV — see `crypto.ts`), and `cloud-mirror.ts` keeps an
offline copy of cloud bytes in IndexedDB so a cold load survives a
dead network. That mirror also powers a stale-while-revalidate load:
a clean cache (no pending offline edits) paints instantly from
IndexedDB while the network round-trip moves to a background
revalidation that asks the cloud adapter for just the revision token
(`getRevision` — Dropbox `get_metadata`, Drive metadata ETag) and only
downloads the full body when the remote actually moved, delivering the
re-paint through the mirror's synthesized `watch` channel. The mirror
is enabled by default for cloud backends (the per-user
`budget.cloud.offline.*` preference reads as on unless explicitly set
to `off` from Settings), so a cloud session paints its cached copy on
open instead of blanking until the cloud answers.
`save-chain.ts` coalesces overlapping saves;
`backend-preference.ts` persists the per-user choice and cloud tokens;
`backup-index.ts` / `backup-metadata.ts` back the timestamped-backup
modal. The React hooks (`useUserDataStorage`, `useStorageBackend`,
`useSaveStateMachine`, `useLoadState`, the OAuth hooks) wire all of
this to the reducer.

Bank-statement import lives under `storage/banks/`: a self-registering
parser registry (`core.ts`) with declarative CSV / XLSX builders and
parsers for ICA Banken, Bank Norwegian, Skandiabanken, and Swedbank.
Entries dedup by content hash on merge.

## Import / export

`src/storage/file.ts` provides the JSON codec; `ImportExportControls`
and `DownloadModal` wire it to the DOM. Both backend reads and file
imports run through the same `parseUserData(text, ctx?)` pipeline.

- **Export** — `serializeUserData(data)` produces pretty-printed JSON
  with **sorted keys at every level** plus a trailing newline, so two
  exports of equal data are byte-identical. The DOM glue triggers a
  download as `budget-YYYY-MM-DD.json` (see `suggestFilename`).
- **Import** — `parseUserData(text)` returns
  `{ ok: true, data, migrated }` or `{ ok: false, error }`. On success
  the data replaces the in-memory state and is persisted by the usual
  save effect; the `migrated` flag tells the UI the file was upgraded.
  The optional `ctx` threads the active `userId` into the migration
  chain (only the v34 → v35 step uses it).

The on-disk JSON shape is identical to the in-memory `UserData` — no
envelope or metadata wrapper. Round-trip identity holds:
`parseUserData(serializeUserData(b)).data` equals `b`.

The export file is plain JSON in the user's hands — no network, no
third party. (The app does emit privacy-friendly page-view analytics
via GoatCounter; that is a separate concern documented on the
`/privacy` page, and never touches the user's budget data.)

## Dependency direction

`components/` depend on `data/` and `storage/`. Nothing in `data/` or
`storage/` imports from `components/`. The storage modules are the only
places that touch `localStorage`, IndexedDB, the File System Access
API, `FileReader`, or a cloud HTTP API directly — components consume a
small typed API. Page directories (`components/budget/`,
`components/accounts/`) never import from a sibling page; cross-page
helpers live at `src/data/` root.

## Why GitHub Pages

The whole app is a static bundle. GitHub Pages is the cheapest way to
serve it without a vendor in the loop, and the deploy pipeline is one
workflow (`.github/workflows/pages.yml`).

The production site is served from the custom domain
`budget.niclaslindstedt.se` (pinned via `public/CNAME`, which Vite
copies into the deployed artifact), so `vite.config.ts` uses
`base: "/"`. If the custom domain is ever dropped and the app falls
back to `<user>.github.io/<repo>/`, switch `base` to `"/<repo>/"` and
remove `public/CNAME`.
