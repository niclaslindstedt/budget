import type { Widen } from "./_widen";

const properties = {
  // Page chrome.
  sheetTitle: "Properties",
  noProperties: "No properties yet.",
  addProperty: "Add property",
  total: "Total",
  editSheet: "Edit sheet",

  // Property card.
  boughtFor: "Bought for",
  purchased: "Purchased",
  size: "Size",
  fee: "Monthly fee",
  currentValue: "Current value",
  noValue: "No value recorded",
  // Title text for the per-area pills next to the current value and the
  // monthly fee, and the share-of-value pill on the unified mortgage
  // balance. `{unit}` is the user's area unit (e.g. "kvm").
  valuePerAreaTitle: "Value per {unit}",
  // The fee is stored per month; the per-area pill annualises it, so the
  // title and the pill's trailing unit both read "per year".
  feePerAreaTitle: "Yearly fee per {unit}",
  perYearUnit: "yr",
  loanToValueTitle: "Share of purchase value",
  updateValue: "Update value",
  uploadFile: "Upload file",
  netSaleProfit: "Net sale profit",
  editProperty: "Edit property",
  deleteProperty: "Delete property",
  mortgages: "Mortgages",
  noMortgages: "No mortgages on this property.",
  addMortgage: "Add mortgage",
  // The segmented control beside the mortgage section's "…" menu toggles
  // between the unified (summed) view and the split (per-mortgage) view; each
  // label names the view its glyph selects. The count heads the unified card.
  viewUnified: "Unified view",
  viewSplit: "Split view",
  // aria-label on the two-glyph view toggle as a whole.
  viewToggle: "Mortgage view",
  mortgageCountOne: "{count} mortgage",
  mortgageCountOther: "{count} mortgages",
  editMortgage: "Edit mortgage",
  deleteMortgage: "Delete mortgage",
  noPaymentsYet: "No payments yet",
  paymentsCountOne: "{count} payment",
  paymentsCountOther: "{count} payments",
  paidTotal: "Paid",
  balanceShort: "Balance",
  loanShort: "Loan",
  rateShort: "Rate",
  effectiveRateShort: "Effective rate",
  interestShort: "Interest",
  rateResetPillOne: "monthly",
  rateResetPillOther: "{count} months",
  // Whole-year reset cadences read in years instead of months — a reset
  // interval is always a whole number of months, and a whole number of years
  // once it reaches a year (never "1.5 years").
  rateResetPillYearOne: "yearly",
  rateResetPillYearOther: "{count} years",
  nextRateChangeShort: "Next change",
  amortShort: "Amortisation",
  amortPerMonthLabel: "Amortisation / month",
  interestPerMonthLabel: "Interest / month",
  // Payoff "power bar" on the mortgage card — the share of the original
  // loan amortised away so far (100% = the loan is fully paid off).
  payoffLabel: "Paid off",
  payoffPercent: "{percent}%",
  payoffBarLabel: "{percent}% of the loan paid off",
  // Pressing the payoff bar toggles the paid / interest / amortisation
  // breakdown card below it (only when there are recorded payments).
  payoffToggleShow: "Show paid breakdown",
  payoffToggleHide: "Hide paid breakdown",

  // Property editor modal.
  newPropertyTitle: "New property",
  editPropertyTitle: "Edit property",
  nameLabel: "Name",
  namePlaceholder: "Apartment, summer house…",
  purchaseAmountLabel: "Purchase amount",
  purchaseAmountPlaceholder: "What you paid for it",
  purchaseDateLabel: "Purchase date",
  sizeLabel: "Size",
  sizePlaceholder: "Living area",
  feeLabel: "Monthly fee",
  feePlaceholder: "What you pay each month",
  feeHint: "Recurring charge to hold the property, e.g. a bostadsrätt fee.",

  // Update-value modal.
  updateValueTitle: "Update value",
  valueLabel: "Current value",
  valuePlaceholder: "What it's worth now",
  asOfLabel: "As of",
  valueHistory: "Value history",
  noValueHistory: "No values recorded yet.",
  // Tag on the value-history row that comes from the property's purchase
  // price — its first value, owned by the purchase fields (not deletable).
  purchaseValueTag: "Purchase",
  deleteValueTitle: "Delete value?",
  deleteValueConfirm:
    "The value recorded for {date} will be removed. This cannot be undone.",

  // Visualize-value chart modal — reached from the property "…" menu.
  valueChartTitle: "Visualize value",
  valueChartEmpty:
    "Record at least two values over time to chart how this property has changed.",
  valueChartMarketValue: "Market value",
  valueChartNetValue: "Net value",
  valueChartIncludeRepairs: "Include repairs",
  valueChartIncludeRepairsHint:
    "Add the money spent on repairs to the value, as each was made.",
  valueChartShowNetValue: "Show net value",
  valueChartShowNetValueHint:
    "What you'd actually take home — after broker, advertising, repairs, purchase price, and capital-gains tax.",

  // Mortgage editor modal.
  newMortgageTitle: "New mortgage",
  editMortgageTitle: "Edit mortgage",
  mortgageNameLabel: "Name",
  mortgageNamePlaceholder: "SBAB loan 1…",
  loanAmountLabel: "Loan amount",
  loanAmountPlaceholder: "The sum you borrowed",
  currentBalanceLabel: "Current balance",
  currentBalancePlaceholder: "What's left to pay",
  interestRateLabel: "Interest rate (%)",
  interestRatePlaceholder: "e.g. 3.45",
  rateChangeDateLabel: "Rate change date",
  rateChangeRateLabel: "Rate (%)",
  addRateChange: "Add rate change",
  removeRateChange: "Remove rate change",
  rateHistoryHint:
    "Add a rate change with the date it took effect — the newest is the current rate. Leave the first date blank for the original rate. Past rates let the finder split each payment accurately.",
  rateChangeMonthsLabel: "Rate resets every (months)",
  rateChangeMonthsPlaceholder: "e.g. 3",
  rateChangeMonthsHint:
    "How often the interest rate is renegotiated — 3 for a variable rate, 12 for a 1-year fixed term.",
  nextRateChangeLabel: "Next rate change",
  amortizationLabel: "Monthly amortisation",
  amortModePercent: "% of initial loan",
  amortModeFixed: "Fixed sum",
  amortPercentPlaceholder: "e.g. 2",
  amortFixedPlaceholder: "Amount per month",
  amortPercentHint:
    "Annual amortisation as a percent of the original loan amount. Add a loan amount to see the monthly figure.",
  amortFixedHint: "A flat amount paid down every month.",
  amortPreview: "≈ {amount} per month",
  cadenceLabel: "Payment frequency",
  cadenceHint:
    "How often the amortisation and interest are charged. Most loans are paid monthly — “Find mortgage payments” expects a charge this often since the loan started.",
  cadenceMonthly: "Monthly",
  cadenceQuarterly: "Quarterly",
  cadenceSemiAnnual: "Every 6 months",
  cadenceAnnual: "Yearly",
  cadenceEveryN: "Every {n} months",
  loanStartLabel: "Loan start date",
  loanStartHint:
    "When this loan started being paid. “Find mortgage payments” counts how many charges to expect since then, so a charge missing some of those months isn't flagged highly probable. Defaults to the property's purchase date.",
  accountLabel: "Account",
  accountHint:
    "The account this property's mortgages are paid from. “Find mortgage payments” scans this account's bank history for the charges.",
  chooseAccount: "Choose an account",
  noAccount: "No account",
  noAccountsYet: "No accounts yet",
  lenderLabel: "Lender",
  lenderPlaceholder: "Pick a company…",
  lenderHint:
    "The bank the mortgages on this property are held with. “Find mortgage payments” uses it — and the Mortgage entry type — to locate the right charges.",

  // Find-payments walk.
  findTitle: "Find mortgage payments",
  findNoProperties: "Add a property with a mortgage first.",
  findSelectProperty: "Property",
  findNoMortgages: "This property has no mortgages yet.",
  findNoAccount:
    "Give this property's mortgages a bank account first — the finder scans that account's history for the charge.",
  findNoneFound: "No matching charges found in the account history.",
  findNeedsTags:
    "Nothing to go on yet. In your budget, tag this property's mortgage charges with their company and the Mortgage type (one month is enough), then come back — the finder uses those tags to locate the rest.",
  findSplitHint:
    "Each charge is split across the property's {count} mortgages by their amortisation and interest.",
  findTxnCountOne: "{count} transaction",
  findTxnCountOther: "{count} transactions",
  findSelectCharges: "Charges to add",
  findSeedTags:
    "Matched from charges you tagged with this mortgage's company or the Mortgage type.",
  findSeedPayments: "Matched from the payments already on this mortgage.",
  findSeedAmount:
    "Matched from the loan terms — charges near this mortgage's expected monthly amount. Check each one before adding.",
  findHighlyProbable: "Highly probable",
  findPreview: "Payments to add",
  findAlreadyAdded: "Already added",
  findAddOne: "Add {count} payment",
  findAddOther: "Add {count} payments",

  // Amount band around each matched charge.
  findToleranceLabel: "Match tolerance",
  findToleranceValue: "±{pct}%",
  findToleranceHint:
    "How much a charge's amount may vary month to month and still count — widen it if the interest rate changed over the period.",
  findSpanMonthsOne: "over {count} month",
  findSpanMonthsOther: "over {count} months",
  findRange: "{start} – {end}",

  // Payments view.
  viewPayments: "View payments",
  paymentsTitle: "Mortgage payments",
  paymentsEmpty: "No payments recorded yet.",
  chargeTotal: "Charge total",
  loanColumn: "Loan",
  paymentDate: "Date",
  paymentAmount: "Amount",
  actionsColumn: "Actions",
  sourceTransactionTitle: "Original transaction",
  sourceTransactionShow: "Show original transaction",
  editPayment: "Edit payment",
  deletePayment: "Delete payment",
  unaccountedTitle: "Unaccounted for",
  unaccountedHint:
    "The amortisation recorded against this loan doesn't match the drop from its original amount to the current balance — a payment may be missing, or the recorded balance is off.",
  paymentRebalanceHint:
    "The other loans in this charge re-balance so the total stays {total} — amortisation first, then interest.",
  deletePaymentTitle: "Delete payment?",
  deletePaymentConfirm:
    "{name}'s share of the {date} charge ({amount}) will be removed. This cannot be undone.",
  deleteAllPayments: "Delete all",
  deleteAllPaymentsTitle: "Delete all payments?",
  deleteAllPaymentsConfirm:
    "Every recorded payment on {name} will be removed so you can re-run Find mortgage payments from scratch. This cannot be undone.",

  // Repairs & renovations view.
  viewRepairs: "View repairs and renovations",
  // The repairs menu entry when some repairs lack a receipt.
  viewRepairsMissing: "View repairs ({count} missing receipts)",
  repairsTitle: "Repairs & renovations",
  // Subfolder a repair receipt files under when its property name is blank /
  // unusable as a folder name (a filesystem fallback, rarely seen).
  repairsFolderFallback: "Repairs",
  repairsEmpty: "No repairs or renovations recorded yet.",
  repairsAdd: "Add",
  repairsQuickAdd: "Quick add",
  repairsAddManual: "Add manually",
  editRepair: "Edit",
  editRepairAria: "Edit {description}",
  deleteRepairAria: "Delete {description}",
  repairTypeRepairs: "Repair",
  repairTypeRenovations: "Renovation",
  repairReceipt: "Receipt",
  manageReceipts: "Manage receipts",
  missingReceipt: "Missing receipt",
  // The repair row's receipt-count badge (when at least one is attached).
  repairReceiptsCountOne: "{count} receipt",
  repairReceiptsCountOther: "{count} receipts",
  // Shown on the card's wrench button when some repairs lack a receipt.
  repairsMissingReceiptsOne: "{count} missing receipt",
  repairsMissingReceiptsOther: "{count} missing receipts",
  deleteRepair: "Delete",
  deleteRepairTitle: "Delete repair?",
  deleteRepairConfirm:
    "{description} ({amount}) will be removed from this property. The source transaction and any receipts are kept. This cannot be undone.",

  // Repair receipts manager — a repair owns a list of dated receipt
  // documents (a job can produce several invoices over time).
  repairReceiptsTitle: "Receipts",
  repairReceiptsEmpty: "No receipts attached yet.",
  repairReceiptAdd: "Add receipt",
  // aria-label on each receipt's date input.
  repairReceiptDateAria: "Receipt date",
  // aria-label on a receipt row's open / view button.
  repairReceiptOpenAria: "Open receipt",
  // aria-label on a receipt row's remove button.
  repairReceiptRemoveAria: "Remove receipt",

  // Add repairs / renovations picker.
  addRepairsTitle: "Add repairs & renovations",
  addRepairsEmpty:
    "No unused Repairs or Renovations transactions found. In your budget, tag a charge with the Repairs or Renovations type, then come back.",
  addRepairsSelect: "Transactions to add",
  addRepairsOne: "Add {count} record",
  addRepairsOther: "Add {count} records",

  // Single repair editor — add (pick one or more source transactions) and
  // edit (add / remove transactions, description, subtype).
  repairEditorAddTitle: "Add repair",
  repairEditorEditTitle: "Edit repair",
  // The multi-select list of source transactions; a repair can group several
  // bank charges that paid one invoice, sharing one receipt.
  repairSourcesLabel: "Transactions",
  // Count of selected transactions, shown beside the running total.
  repairSourcesCountOne: "{count} transaction",
  repairSourcesCountOther: "{count} transactions",
  repairSourceEmpty:
    "No unused Repairs or Renovations transactions found. In your budget, tag a charge with the Repairs or Renovations type, then come back.",
  repairDescriptionLabel: "Description",
  repairDescriptionPlaceholder: "What was done, e.g. Repainted the kitchen",
  repairSubtypeLabel: "Subtype",
  repairSubtypePlaceholder: "Pick a subtype…",
  repairCompanyLabel: "Company",
  repairCompanyHint:
    "Saved on the source transaction, shared with your budget.",
  repairTagsLabel: "Tags",
  repairTagsHint: "Tag the transaction to group repairs across properties.",

  // Manual repair editor — a repair / renovation with no backing bank
  // transaction (work older than your imported history reaches).
  manualRepairAddTitle: "Add repair manually",
  manualRepairEditTitle: "Edit repair",
  repairTypeLabel: "Type",
  repairDateLabel: "Date",
  repairAmountLabel: "Amount",
  repairAmountPlaceholder: "Cost",

  // Delete property confirm.
  deletePropertyTitle: "Delete property?",
  deletePropertyConfirm:
    "{name} and its mortgages will be removed. This cannot be undone.",
  deleteMortgageTitle: "Delete mortgage?",
  deleteMortgageConfirm:
    "{name} and its payments will be removed. This cannot be undone.",

  // Net sale profit estimator.
  netSale: {
    sliderLabel: "Sale price",
    purchasePrice: "Purchase price",
    repairs: "Repairs & renovations",
    advertisement: "Advertising (e.g. Hemnet)",
    taxableGain: "Taxable gain",
    netProfit: "Net profit",
    netLoss: "Net loss",
    broker: {
      label: "Broker fee",
      none: "No broker",
      fixed: "Fixed amount",
      percent: "Percentage of sale",
      tiered: "Base + percentage above a threshold",
      amount: "Broker fee",
      percentRate: "Percentage (%)",
      base: "Base fee",
      threshold: "Threshold",
      tieredHint:
        "The base fee always applies; the percentage applies only to the part of the sale price above the threshold.",
    },
    line: {
      sellPrice: "Sale price",
      broker: "Broker fee",
      advertisement: "Advertising",
      repairs: "Repairs & renovations",
      purchasePrice: "Purchase price",
      tax: "Capital-gains tax",
    },
  },

  // Files manager — arbitrary documents / photos uploaded against a property
  // (before/after images, inspection reports, non-receipt paperwork).
  filesTitle: "Files",
  filesEmpty: "No files uploaded yet.",
  filesUnavailable:
    "Uploading files needs a folder or cloud backend. Connect one in Settings → Storage.",
  uploadFileAction: "Upload",
  editFile: "Edit",
  deleteFile: "Delete",
  deleteFileTitle: "Delete file?",
  deleteFileConfirm:
    "{name} will be removed from this property. This cannot be undone.",
  // Title of the inline file viewer (reuses the receipt viewer).
  fileAttachment: "File",
  fileDescription: "Description",
  fileDescriptionPlaceholder: "What this is, e.g. Kitchen before renovation",
  fileCategory: "Category",
  fileTags: "Tags",
  // File-category picker.
  fileCategoryNone: "No category",
  newFileCategory: "New category",
  fileCategoryName: "Category name",
  fileCategoryNamePlaceholder: "e.g. Insurance",
  fileCategoryDuplicate: "A category with this name already exists.",
  // Per-file private flag (excluded from a property export by default).
  filePrivate: "Private",
  filePrivateHint:
    "Private files are left out of a property export unless you choose to include them.",
  filePrivateBadge: "Private",

  // Export / import — the sale-handover archive (a ZIP of the property's
  // details, repairs, receipts, and files) reachable from the "…" menu.
  exportProperty: "Export property",
  importProperty: "Import property",
  exportTitle: "Export {name}",
  exportIntro:
    "Bundle this property into a single file to hand to the new owner — its details, repairs, receipts, and uploaded documents.",
  exportIncludeReceipts: "Include receipts",
  exportIncludeReceiptsHint:
    "Bundle the receipt files attached to repairs and renovations.",
  exportIncludePrivate: "Include private files",
  exportIncludePrivateHint:
    "Files you marked private are left out unless this is on.",
  exportIncludeFinancials: "Include mortgages & payments",
  exportIncludeFinancialsHint:
    "Your loans, their payment history, purchase price, and value estimates — your own financial records, off by default.",
  exportDestinationLabel: "Where to save",
  exportDestinationDownload: "Download file",
  exportDestinationDownloadHint: "Save the archive to this device's downloads.",
  exportDestinationBackend: "Save to exports folder",
  exportDestinationBackendHint:
    "Store it in an exports/ folder on your connected storage.",
  exportSaved: "Saved to the exports/ folder on your storage.",
  exportAction: "Export",
  exportActionSave: "Save",
  exportUnavailable:
    "Exporting a property's files needs a folder or cloud backend. Connect one in Settings → Storage. Details still export.",
  exportSkippedOne:
    "{count} attachment couldn't be included (its file is missing).",
  exportSkippedOther:
    "{count} attachments couldn't be included (their files are missing).",
  importTitle: "Import property",
  importIntro:
    "Pick a property export file (a .zip you were given) to add it to your properties as a new property.",
  importChooseFile: "Choose file",
  importInvalid: "This file isn't a property export.",
  importNewerVersion:
    "This file was made by a newer version of the app. Update, then try again.",
  importReadError: "Couldn't read this file. It may be corrupt.",
  importSummaryRepairsOne: "{count} repair",
  importSummaryRepairsOther: "{count} repairs",
  importSummaryFilesOne: "{count} file",
  importSummaryFilesOther: "{count} files",
  importSummaryFinancials: "Mortgages & financial history",
  importUnavailableNote:
    "Files and receipts need a folder or cloud backend to store. Without one, only the property's details import. Connect one in Settings → Storage.",
  importAction: "Import",
  importSuccess: "Imported {name}.",
  importSkippedOne: "{count} attachment wasn't imported.",
  importSkippedOther: "{count} attachments weren't imported.",

  // Shared verbs.
  save: "Save",
  create: "Create",
  delete: "Delete",
} as const;

export type PropertiesCatalog = Widen<typeof properties>;

export default properties;
