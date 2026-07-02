import type { CarsSheetCatalog } from "../en/carsSheet";

const carsSheet: CarsSheetCatalog = {
  // Page
  addCar: "Lägg till bil",
  noCars: "Inga bilar än. Lägg till en för att se vad den verkligen kostar.",
  soldSection: "Sålda bilar",

  // Ownership labels (badge + editor pill).
  ownershipOwned: "Ägd",
  ownershipLeased: "Leasad",
  ownershipShared: "Delad",
  ownershipPool: "Bilpool",

  // Card
  currentValue: "Nuvarande värde",
  noValue: "Ange värde",
  updateValue: "Uppdatera värde & mätarställning",
  boughtFor: "Köpt för",
  purchased: "Köpt",
  mileageLabel: "Mätarställning",
  distanceDriven: "Körd sträcka",
  costPerDistance: "Kostnad per km",
  totalCosts: "Totala kostnader",
  loanLabel: "Lån",
  soldBadge: "Såld",
  soldFor: "Såld för",
  soldOn: "Såld den",
  sharePill: "{pct}% andel",
  valueChartTitle: "Visualisera värde",
  costChartTitle: "Kostnadsfördelning",
  viewExpenses: "Kostnader",

  // Card "…" menu
  findExpenses: "Hitta bilkostnader",
  addManualExpense: "Lägg till kostnad manuellt",
  editCar: "Redigera bil",
  deleteCar: "Ta bort bil",
  deleteCarTitle: "Ta bort bil",
  deleteCarConfirm:
    "Ta bort {name}? Dess registrerade avläsningar och länkade kostnader tas bort. Bankhistoriken påverkas inte.",

  // Create / edit modal
  newCarTitle: "Ny bil",
  editCarTitle: "Redigera bil",
  nameLabel: "Namn",
  namePlaceholder: "t.ex. Volvo V60",
  ownershipLabel: "Ägande",
  descriptionLabel: "Beskrivning",
  descriptionPlaceholder: "Modell, årsmodell, regnummer…",
  purchasePriceLabel: "Inköpspris",
  purchaseDateLabel: "Inköpsdatum",
  purchaseMileageLabel: "Mätarställning vid köp",
  purchaseMileagePlaceholder: "0 för en ny bil",
  sharePctLabel: "Din andel (%)",
  sharePctHint:
    "Procent av bilen du äger (1–99). Skalar dess värde i din nettoförmögenhet.",
  depreciates: "Tappar värde över tid",
  depreciationModel: "Värdeminskningsmodell",
  depreciationSteady: "Jämn",
  depreciationAccelerated: "Accelererad",
  depreciationSteadyHint: "Tappar samma andel av värdet varje år.",
  depreciationAcceleratedHint:
    "Tappar direkt vid köpet, faller snabbt första året och planar sedan ut.",
  ratePerYear: "Takt (%/år)",
  ratePerYearPlaceholder: "t.ex. 10",
  initialDrop: "Initialt tapp (%)",
  initialDropPlaceholder: "t.ex. 10",
  firstYearRate: "Första året (%/år)",
  firstYearRatePlaceholder: "t.ex. 20",
  rateAfterFirstYear: "Efter första året (%/år)",
  rateAfterFirstYearPlaceholder: "t.ex. 10",
  depreciationFloor: "Lägsta värde",
  loanPickerLabel: "Lån",
  loanNone: "Inget lån",
  loanHint:
    "Länka lånet som finansierar bilen så att räntan räknas in i kostnaden.",
  soldDateLabel: "Såld den",
  soldDateHint: "Ange ett datum om du inte längre har bilen.",
  soldForLabel: "Såld för",

  // Update value & mileage modal
  updateValueTitle: "Uppdatera värde & mätarställning",
  valueLabel: "Värde",
  valuePlaceholder: "t.ex. 150 000",
  mileagePlaceholder: "t.ex. 42 000",
  valueOrMileageHint: "Registrera ett värde, en mätarställning eller båda.",
  asOfLabel: "Per den",
  valueHistory: "Registrerad historik",
  noValueHistory: "Inget registrerat än.",
  purchaseTag: "Köp",

  // Value chart modal
  valueChartEmpty:
    "Inte tillräckligt med data att rita än. Registrera ett värde först.",
  mileageChartEmpty:
    "Inte tillräckligt med data att rita än. Registrera en mätarställning först.",
  chartModeAria: "Diagramläge",
  chartValueLabel: "Värde",
  chartMileageLabel: "Mätarställning",
  chartPurchaseLabel: "Inköpspris",
  subtractCosts: "Dra av löpande kostnader",
  subtractCostsHint:
    "Sänk kurvan med allt som lagts på bilen fram till varje datum.",
  subtractLoanInterest: "Dra av låneränta",
  subtractLoanInterestHint:
    "Dra också av räntan som löpt på det länkade lånet.",

  // Expenses modal
  expensesTitle: "Bilkostnader",
  expensesEmpty:
    "Inga kostnader länkade än. Hitta dem i din bankhistorik eller lägg till en manuellt.",
  expensesTotal: "Totalt",
  uncategorizedType: "Okategoriserad",

  // Find car expenses modal
  findTitle: "Hitta bilkostnader",
  findIntro:
    "Transportkostnader från din bankhistorik som ännu inte hör till någon bil. Bocka i de som hör till {name}.",
  findEmpty:
    "Inga oanvända transportkostnader hittades. Importera bankhistorik, eller märk kostnader med en transporttyp först.",
  selectAll: "Markera alla",
  ignoreEntry: "Ignorera",
  ignoreEntryHint: "Föreslå aldrig den här kostnaden igen",
  excludeSimilar: "Uteslut liknande",
  excludeSimilarHint: "Föreslå aldrig kostnader med den här beskrivningen",
  addCountOne: "Lägg till {n} kostnad",
  addCountOther: "Lägg till {n} kostnader",

  // Manual expense modal
  manualExpenseTitle: "Lägg till kostnad",
  editExpenseTitle: "Redigera kostnad",
  expenseDescription: "Beskrivning",
  expenseDescriptionPlaceholder: "t.ex. Vinterdäck",
  expenseAmount: "Belopp",
  expenseDate: "Datum",
  expenseType: "Typ",

  // Cost chart modal
  costChartEmpty: "Inga kostnader i det här intervallet än.",
  includeDepreciation: "Inkludera värdeminskning",
  includeLoanInterest: "Inkludera låneränta",
  chartDepreciation: "Värdeminskning",
  chartLoanInterest: "Låneränta",
  chartTotal: "Totalt",
  totalInRange: "Totalt i intervallet",
};

export default carsSheet;
