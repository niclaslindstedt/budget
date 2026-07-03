import type { Widen } from "./_widen";

const carsSheet = {
  // Page
  addCar: "Add car",
  noCars: "No cars yet. Add one to see what it really costs.",
  soldSection: "Sold cars",

  // Ownership labels (badge + editor pill).
  ownershipOwned: "Owned",
  ownershipLeased: "Leased",
  ownershipShared: "Shared",
  ownershipPool: "Car pool",

  // Card
  currentValue: "Current value",
  noValue: "Set value",
  updateValue: "Update value & mileage",
  boughtFor: "Bought for",
  purchased: "Purchased",
  mileageLabel: "Mileage",
  distanceDriven: "Distance driven",
  costPerDistance: "Cost per km",
  totalCosts: "Total costs",
  loanLabel: "Loan",
  soldBadge: "Sold",
  soldFor: "Sold for",
  soldOn: "Sold on",
  sharePill: "{pct}% share",
  valueChartTitle: "Visualize value",
  costChartTitle: "Cost breakdown",
  viewExpenses: "Expenses",

  // Card "…" menu
  findExpenses: "Find car expenses",
  addManualExpense: "Add expense manually",
  contractsMenu: "Contracts",
  editCar: "Edit car",
  deleteCar: "Delete car",
  deleteCarTitle: "Delete car",
  deleteCarConfirm:
    "Delete {name}? Its recorded snapshots and linked expenses are removed. Bank history is untouched.",

  // Create / edit modal
  newCarTitle: "New car",
  editCarTitle: "Edit car",
  nameLabel: "Name",
  namePlaceholder: "e.g. Volvo V60",
  ownershipLabel: "Ownership",
  descriptionLabel: "Description",
  descriptionPlaceholder: "Model, year, plate…",
  purchasePriceLabel: "Purchase price",
  purchaseDateLabel: "Purchase date",
  purchaseMileageLabel: "Mileage at purchase",
  purchaseMileagePlaceholder: "0 for a new car",
  sharePctLabel: "Your share (%)",
  sharePctHint:
    "Percent of the car you own (1–99). Scales its value in your net worth.",
  depreciates: "Loses value over time",
  depreciationModel: "Depreciation model",
  depreciationSteady: "Steady",
  depreciationAccelerated: "Accelerated",
  depreciationSteadyHint: "Loses the same share of its value every year.",
  depreciationAcceleratedHint:
    "Drops when driven off the lot, falls fast the first year, then flattens out.",
  ratePerYear: "Rate (%/year)",
  ratePerYearPlaceholder: "e.g. 10",
  initialDrop: "Initial drop (%)",
  initialDropPlaceholder: "e.g. 10",
  firstYearRate: "First year (%/year)",
  firstYearRatePlaceholder: "e.g. 20",
  rateAfterFirstYear: "After first year (%/year)",
  rateAfterFirstYearPlaceholder: "e.g. 10",
  depreciationFloor: "Floor value",
  loanPickerLabel: "Loan",
  loanNone: "No loan",
  loanHint:
    "Link the loan financing this car so its interest counts toward the cost.",

  // Leasing terms (leased cars only)
  leaseHint: "Lease terms",
  leaseStartLabel: "Lease start",
  leaseMonthsLabel: "Length (months)",
  leaseStartValueLabel: "Value at start",
  leaseEndValueLabel: "Value at end",
  leaseMonthlyCostLabel: "Monthly cost",
  leaseInterestRateLabel: "Interest (%/year)",
  leaseInterestRatePlaceholder: "e.g. 5",
  leaseNetPosition: "Net position",
  leaseNetWorthHint:
    "The car depreciates faster than the lease amortizes, so early on it drags your net worth down; the gap closes by the end of the lease.",
  soldDateLabel: "Sold on",
  soldDateHint: "Set a date if you no longer have this car.",
  soldForLabel: "Sold for",

  // Update value & mileage modal
  updateValueTitle: "Update value & mileage",
  valueLabel: "Value",
  valuePlaceholder: "e.g. 150 000",
  mileagePlaceholder: "e.g. 42 000",
  valueOrMileageHint: "Record a value, a mileage reading, or both.",
  asOfLabel: "As of",
  valueHistory: "Recorded history",
  noValueHistory: "Nothing recorded yet.",
  purchaseTag: "Purchase",

  // Value chart modal
  valueChartEmpty: "Not enough data to chart yet. Record a value first.",
  mileageChartEmpty:
    "Not enough data to chart yet. Record a mileage reading first.",
  chartModeAria: "Chart mode",
  chartValueLabel: "Value",
  chartMileageLabel: "Mileage",
  chartPurchaseLabel: "Purchase price",
  subtractCosts: "Subtract running costs",
  subtractCostsHint:
    "Lower the curve by everything spent on the car up to each date.",
  subtractLoanInterest: "Subtract loan interest",
  subtractLoanInterestHint:
    "Also subtract the interest accrued on the linked loan.",

  // Expenses modal
  expensesTitle: "Car expenses",
  expensesEmpty:
    "No expenses linked yet. Find them in your bank history or add one manually.",
  expensesTotal: "Total",
  uncategorizedType: "Uncategorized",

  // Find car expenses modal
  findTitle: "Find car expenses",
  findIntro:
    "Transport charges from your bank history not attributed to a car yet. Tick the ones that belong to {name}.",
  findEmpty:
    "No unclaimed transport charges found. Import bank history, or tag charges with a transport type first.",
  selectAll: "Select all",
  ignoreEntry: "Ignore",
  ignoreEntryHint: "Never suggest this charge again",
  excludeSimilar: "Exclude similar",
  excludeSimilarHint: "Never suggest charges with this description",
  addCountOne: "Add {n} expense",
  addCountOther: "Add {n} expenses",

  // Manual expense modal
  manualExpenseTitle: "Add expense",
  editExpenseTitle: "Edit expense",
  expenseDescription: "Description",
  expenseDescriptionPlaceholder: "e.g. Winter tyres",
  expenseAmount: "Amount",
  expenseDate: "Date",
  expenseType: "Type",

  // Contracts modal
  contractsTitle: "Contracts",
  contractsEmpty: "No contracts uploaded yet.",
  contractsUnavailable:
    "Uploading contracts needs a local-folder or cloud backend.",
  uploadContract: "Upload contract",
  uploadContractAction: "Upload",
  editContract: "Edit contract",
  deleteContract: "Delete contract",
  deleteContractTitle: "Delete contract",
  deleteContractConfirm: "Delete {name}? The stored file is removed too.",
  contractAttachment: "Contract",
  contractKindLabel: "Contract type",
  contractKindPurchase: "Purchase",
  contractKindLease: "Leasing",
  contractKindSale: "Sale",
  contractDescriptionLabel: "Description",
  contractDescriptionPlaceholder: "e.g. Purchase agreement",
  // Segment used as the top folder when a car's name sanitises to empty.
  contractsFolderFallback: "Cars",

  // Cost chart modal
  costChartEmpty: "No costs in this range yet.",
  includeDepreciation: "Include depreciation",
  includeLoanInterest: "Include loan interest",
  chartDepreciation: "Depreciation",
  chartLoanInterest: "Loan interest",
  chartTotal: "Total",
  totalInRange: "Total in range",
  rollingAverage: "{n}-month average",
} as const;

export type CarsSheetCatalog = Widen<typeof carsSheet>;

export default carsSheet;
