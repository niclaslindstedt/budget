import type { SalaryCatalog } from "../en/salary";

const salary: SalaryCatalog = {
  // Page chrome
  sheetTitle: "Lön",
  findSalaries: "Hitta löner",
  manageEmployers: "Arbetsgivare",
  noSalaries: "Inga löner än. Hitta dem i din bankhistorik nedan.",
  selected: "{count} markerade",
  selectAllInYear: "Markera alla i året",
  deselectAllInYear: "Avmarkera alla i året",

  // Table
  month: "Månad",
  employer: "Arbetsgivare",
  title: "Titel",
  gross: "Brutto",
  tax: "Skatt",
  net: "Netto",
  days: "Dagar",
  actions: "Åtgärder",
  yearTotal: "Totalt",
  noEmployer: "Ingen arbetsgivare",
  editAria: "Redigera lön för {month}",
  deleteAria: "Ta bort lön för {month}",
  selectRowAria: "Markera {month}",
  deselectRowAria: "Avmarkera {month}",

  // Absence-day badges
  careOfChildShort: "VAB",
  parentalLeaveShort: "Föräldraledig",
  vacationShort: "Semester",
  sickShort: "Sjuk",
  daysValue: "{n} d",

  // Edit modal
  editTitle: "Redigera lön",
  deleteTitle: "Ta bort lön",
  deleteConfirm: "Ta bort lönen för {month}? Detta går inte att ångra.",
  delete: "Ta bort",
  grossLabel: "Brutto",
  grossHint: "Det du tjänade före skatt. Skatten är brutto minus nettot.",
  netLabel: "Netto",
  netHint: "Beloppet som betalades in på ditt konto.",
  taxLabel: "Skatt",
  careOfChildDaysLabel: "VAB-dagar",
  parentalLeaveDaysLabel: "Föräldralediga dagar",
  vacationDaysLabel: "Semesterdagar",
  sickDaysLabel: "Sjukdagar",
  noteLabel: "Anteckning",
  notePlaceholder: "Valfritt. T.ex. varför denna lön avviker från snittet.",

  // Payslip (lönerapport) attachment
  payslip: "Lönerapport",
  payslipUpload: "Ladda upp lönerapport",
  payslipReplace: "Ersätt lönerapport",
  payslipView: "Visa",
  viewPayslip: "Visa lönerapport",
  payslipRemove: "Ta bort",
  payslipUploading: "Laddar upp…",
  payslipUnsupported:
    "Lönerapporter kräver lagring i en lokal mapp eller i molnet. Byt lagring i Inställningar → Lagring för att bifoga en.",
  payslipError: "Kunde inte spara lönerapporten. Försök igen.",
  payslipMissing: "Lönerapportfilen hittades inte i den här lagringen.",
  payslipFallbackName: "Lönerapport",

  // Bulk edit
  bulkTitle: "Redigera {count} löner",
  bulkEmployerToggle: "Ange arbetsgivare",
  bulkRoleToggle: "Ange jobbtitel",
  bulkRoleHint:
    "Pekar varje vald lön mot denna titel hos sin arbetsgivare och skapar rollen om den är ny. Lämna tomt för att ta bort titeln.",
  bulkRolePlaceholder: "Utvecklare, Chef, …",
  bulkTaxRateToggle: "Ange skattesats",
  bulkTaxRateHint:
    "Procent av brutto som dras i skatt. Varje löns brutto räknas baklänges från dess eget netto.",
  bulkTaxRatePlaceholder: "t.ex. 30",
  apply: "Tillämpa",

  // Find-salaries guided walk
  findTitle: "Hitta löner",
  likelyNewEmployer: "Trolig ny arbetsgivare",
  raise: "Löneförhöjning",
  add: "Lägg till",
  confidenceHigh: "Trolig",
  confidenceMedium: "Kanske",
  confidenceLow: "Gissning",

  // Intro step — lönekontot är en bladinställning, så detta bekräftar
  // det kopplade kontot i stället för att välja ett.
  scanAccountTitle: "Söker igenom {name}",
  pickAccountHint:
    "Vi söker igenom kontots hela bankhistorik efter troliga löner — även flera år bakåt, innan du märkte något.",
  noBoundAccount:
    "Det här lönebladet är inte kopplat till ett konto än. Öppna bladets ⋯-meny → Redigera blad och välj kontot din lön betalas in på.",
  noAccountsWithHistory:
    "Ingen importerad bankhistorik än. Importera ett kontoutdrag på Konto-sidan först.",
  discoverySummary: "{count} troliga lönemånader från {start} till {end}.",
  discoveryNone: "Ingen återkommande lön hittades i kontots historik.",

  // Cluster summary — löneperioder mellan höjningar / arbetsgivarbyten.
  clustersTitle: "Löneperioder",
  clustersHint:
    "Varje period höll ungefär en lönenivå. Ett steg upp är en löneförhöjning eller titeländring; en bestående sänkning är oftast en ny arbetsgivare. Den här nivån är också utgångsvärdet som flaggar en låg månad som semester eller sjukfrånvaro.",
  clusterSpanMonths: "{count} mån",
  clusterPaychecksOne: "{count} lön",
  clusterPaychecksOther: "{count} löner",

  // Year review step
  yearStepTitle: "Löner {year}",
  yearMonthsOne: "{count} månad hittad",
  yearMonthsOther: "{count} månader hittade",
  yearFlagged: "{count} ser ovanliga ut",
  offBaselineTag: "Ovanlig",
  yearReviewHint:
    "Det här är lönerna vi hittade i år. Lägg till alla, eller granska var och en för att ändra beloppet, märka en arbetsgivare eller hoppa över.",
  reviewMonths: "Granska var och en",
  acceptYearOne: "Lägg till {count}",
  acceptYearOther: "Lägg till alla {count}",

  // Month step
  monthProgress: "{index} av {total}",
  fromBank: "Från din bank",
  offAverageHint:
    "Detta avviker från din vanliga lön — en bonus, ledighet eller löneökning?",
  accept: "Lägg till",
  skip: "Hoppa över",
  alreadyAccepted: "Tillagd — lägg till igen för att uppdatera.",
  alreadySkipped: "Överhoppad.",

  // Summary step
  readyToAddOne: "{count} lön redo att läggas till.",
  readyToAddOther: "{count} löner redo att läggas till.",

  // Employer management
  employersTitle: "Arbetsgivare",
  addEmployer: "Lägg till arbetsgivare",
  employerName: "Namn",
  employerNamePlaceholder: "Acme AB, …",
  employerColor: "Färg",
  employerGlyph: "Ikon",
  saveEmployer: "Spara arbetsgivare",
  deleteEmployer: "Ta bort arbetsgivare",
  deleteEmployerConfirm:
    "Ta bort {name}? Lönerna behåller sina data men förlorar arbetsgivaren.",
  noEmployers: "Inga arbetsgivare än. Lägg till en för att märka dina löner.",
  editEmployerAria: "Redigera {name}",
  deleteEmployerAria: "Ta bort {name}",
  roles: "Roller",
  addRole: "Lägg till roll",
  roleTitle: "Titel",
  roleTitlePlaceholder: "Utvecklare, Chef, …",
  roleRange: "{start} – {end}",
  roleRangeEmpty: "Inte kopplad till någon lön än",
  removeRole: "Ta bort roll",
  noRoles: "Inga roller än.",

  // Employer picker
  pickEmployer: "Välj arbetsgivare",
  newEmployer: "Ny arbetsgivare",
  duplicateEmployer: "En arbetsgivare med detta namn finns redan.",
};

export default salary;
