import type { PropertiesCatalog } from "../en/properties";

const properties: PropertiesCatalog = {
  // Page chrome.
  sheetTitle: "Fastigheter",
  noProperties: "Inga fastigheter ännu.",
  addProperty: "Lägg till fastighet",
  total: "Totalt",
  editSheet: "Redigera blad",

  // Property card.
  boughtFor: "Köpt för",
  purchased: "Köpt",
  size: "Storlek",
  rooms: "Rum",
  fee: "Månadsavgift",
  currentValue: "Nuvarande värde",
  noValue: "Inget värde registrerat",
  valuePerAreaTitle: "Värde per {unit}",
  feePerAreaTitle: "Årsavgift per {unit}",
  perYearUnit: "år",
  loanToValueTitle: "Andel av köpeskillingen",
  updateValue: "Uppdatera värde",
  uploadFile: "Ladda upp fil",
  netSaleProfit: "Nettovinst vid försäljning",
  editProperty: "Redigera fastighet",
  deleteProperty: "Ta bort fastighet",
  mortgages: "Bolån",
  noMortgages: "Inga bolån på den här fastigheten.",
  addMortgage: "Lägg till bolån",
  viewUnified: "Sammanslagen vy",
  viewSplit: "Delad vy",
  viewToggle: "Bolånevy",
  mortgageCountOne: "{count} bolån",
  mortgageCountOther: "{count} bolån",
  editMortgage: "Redigera bolån",
  deleteMortgage: "Ta bort bolån",
  noPaymentsYet: "Inga betalningar ännu",
  paymentsCountOne: "{count} betalning",
  paymentsCountOther: "{count} betalningar",
  paidTotal: "Betalt",
  balanceShort: "Skuld",
  loanShort: "Lån",
  rateShort: "Ränta",
  effectiveRateShort: "Effektiv ränta",
  interestShort: "Räntekostnad",
  rateResetPillOne: "varje månad",
  rateResetPillOther: "var {count}:e mån",
  rateResetPillYearOne: "varje år",
  rateResetPillYearOther: "vart {count}:e år",
  nextRateChangeShort: "Nästa ändring",
  amortShort: "Amortering",
  amortPerMonthLabel: "Amortering / mån",
  interestPerMonthLabel: "Räntekostnad / mån",
  payoffLabel: "Avbetalat",
  payoffPercent: "{percent}%",
  payoffBarLabel: "{percent}% av lånet avbetalat",
  payoffToggleShow: "Visa betalningsfördelning",
  payoffToggleHide: "Dölj betalningsfördelning",

  // Property editor modal.
  newPropertyTitle: "Ny fastighet",
  editPropertyTitle: "Redigera fastighet",
  nameLabel: "Namn",
  namePlaceholder: "Lägenhet, sommarstuga…",
  purchaseAmountLabel: "Köpesumma",
  purchaseAmountPlaceholder: "Vad du betalade för den",
  purchaseDateLabel: "Köpdatum",
  sizeLabel: "Storlek",
  sizePlaceholder: "Boyta",
  roomsLabel: "Rum",
  roomsPlaceholder: "Antal rum",
  feeLabel: "Månadsavgift",
  feePlaceholder: "Vad du betalar varje månad",
  feeHint:
    "Återkommande avgift för att äga bostaden, t.ex. en bostadsrättsavgift.",

  // Update-value modal.
  updateValueTitle: "Uppdatera värde",
  valueLabel: "Nuvarande värde",
  valuePlaceholder: "Vad den är värd nu",
  asOfLabel: "Per datum",
  valueHistory: "Värdehistorik",
  noValueHistory: "Inga värden registrerade ännu.",
  purchaseValueTag: "Köp",
  deleteValueTitle: "Ta bort värde?",
  deleteValueConfirm:
    "Värdet som registrerats för {date} tas bort. Det går inte att ångra.",

  // Visualisera värde-diagrammet — nås från fastighetens "…"-meny.
  valueChartTitle: "Visualisera värde",
  valueChartEmpty:
    "Registrera minst två värden över tid för att se hur fastigheten har förändrats.",
  valueChartMarketValue: "Marknadsvärde",
  valueChartNetValue: "Nettovärde",
  valueChartIncludeRepairs: "Inkludera reparationer",
  valueChartIncludeRepairsHint:
    "Lägg pengarna du lagt på reparationer till värdet, allt eftersom de gjordes.",
  valueChartShowNetValue: "Visa nettovärde",
  valueChartShowNetValueHint:
    "Vad du faktiskt får kvar — efter mäklararvode, annonsering, reparationer, inköpspris och vinstskatt.",

  // Mortgage editor modal.
  newMortgageTitle: "Nytt bolån",
  editMortgageTitle: "Redigera bolån",
  mortgageNameLabel: "Namn",
  mortgageNamePlaceholder: "SBAB lån 1…",
  loanAmountLabel: "Lånebelopp",
  loanAmountPlaceholder: "Summan du lånade",
  currentBalanceLabel: "Nuvarande skuld",
  currentBalancePlaceholder: "Vad som är kvar att betala",
  interestRateLabel: "Räntesats (%)",
  interestRatePlaceholder: "t.ex. 3,45",
  rateChangeDateLabel: "Datum för ränteändring",
  rateChangeRateLabel: "Ränta (%)",
  addRateChange: "Lägg till ränteändring",
  removeRateChange: "Ta bort ränteändring",
  rateHistoryHint:
    "Lägg till en ränteändring med datumet den trädde i kraft — den nyaste är den aktuella räntan. Lämna det första datumet tomt för ursprungsräntan. Tidigare räntor låter sökningen dela upp varje betalning korrekt.",
  rateChangeMonthsLabel: "Räntan ändras var (månad)",
  rateChangeMonthsPlaceholder: "t.ex. 3",
  rateChangeMonthsHint:
    "Hur ofta räntan omförhandlas — 3 för rörlig ränta, 12 för 1 års bindningstid.",
  nextRateChangeLabel: "Nästa ränteändring",
  amortizationLabel: "Månadsamortering",
  amortModePercent: "% av ursprungslån",
  amortModeFixed: "Fast summa",
  amortPercentPlaceholder: "t.ex. 2",
  amortFixedPlaceholder: "Belopp per månad",
  amortPercentHint:
    "Årlig amortering som en procent av det ursprungliga lånebeloppet. Ange ett lånebelopp för att se månadsbeloppet.",
  amortFixedHint: "Ett fast belopp som amorteras varje månad.",
  amortPreview: "≈ {amount} per månad",
  cadenceLabel: "Betalningsintervall",
  cadenceHint:
    "Hur ofta amortering och ränta dras. De flesta lån betalas månadsvis — ”Hitta bolånebetalningar” förväntar sig en dragning så här ofta sedan lånet togs.",
  cadenceMonthly: "Månadsvis",
  cadenceQuarterly: "Kvartalsvis",
  cadenceSemiAnnual: "Var 6:e månad",
  cadenceAnnual: "Årsvis",
  cadenceEveryN: "Var {n}:e månad",
  loanStartLabel: "Lånets startdatum",
  loanStartHint:
    "När lånet började betalas. ”Hitta bolånebetalningar” räknar hur många dragningar som förväntas sedan dess, så en dragning som saknar några av de månaderna flaggas inte som mycket trolig. Utgår från fastighetens köpdatum.",
  accountLabel: "Konto",
  accountHint:
    "Kontot fastighetens bolån betalas från. ”Hitta bolånebetalningar” söker igenom kontots bankhistorik efter dragningarna.",
  chooseAccount: "Välj ett konto",
  noAccount: "Inget konto",
  noAccountsYet: "Inga konton ännu",
  lenderLabel: "Långivare",
  lenderPlaceholder: "Välj ett företag…",
  lenderHint:
    "Banken som fastighetens bolån finns hos. ”Hitta bolånebetalningar” använder den — och bolånetypen — för att hitta rätt dragningar.",

  // Find-payments walk.
  findTitle: "Hitta bolånebetalningar",
  findNoProperties: "Lägg till en fastighet med ett bolån först.",
  findSelectProperty: "Fastighet",
  findNoMortgages: "Den här fastigheten har inga bolån ännu.",
  findNoAccount:
    "Ge fastighetens bolån ett bankkonto först — sökningen går igenom kontots historik efter dragningen.",
  findNoneFound: "Inga matchande dragningar hittades i kontohistoriken.",
  findNeedsTags:
    "Inget att utgå från ännu. Märk den här fastighetens bolånedragningar med deras företag och bolånetypen i din budget (en månad räcker), och kom sedan tillbaka — sökningen använder de märkningarna för att hitta resten.",
  findSplitHint:
    "Varje dragning delas upp på fastighetens {count} bolån efter deras amortering och ränta.",
  findTxnCountOne: "{count} transaktion",
  findTxnCountOther: "{count} transaktioner",
  findSelectCharges: "Dragningar att lägga till",
  findSeedTags:
    "Matchat från dragningar du märkt med det här bolånets företag eller bolånetypen.",
  findSeedPayments: "Matchat från betalningarna som redan finns på bolånet.",
  findSeedAmount:
    "Matchat från lånevillkoren — dragningar nära bolånets förväntade månadsbelopp. Kontrollera varje post innan du lägger till.",
  findHighlyProbable: "Mycket trolig",
  findPreview: "Betalningar att lägga till",
  findAlreadyAdded: "Redan tillagd",
  findAddOne: "Lägg till {count} betalning",
  findAddOther: "Lägg till {count} betalningar",

  // Amount band around each matched charge.
  findToleranceLabel: "Matchningstolerans",
  findToleranceValue: "±{pct}%",
  findToleranceHint:
    "Hur mycket en dragnings belopp får variera mellan månaderna och ändå räknas — vidga det om räntan ändrats under perioden.",
  findSpanMonthsOne: "över {count} månad",
  findSpanMonthsOther: "över {count} månader",
  findRange: "{start} – {end}",

  // Payments view.
  viewPayments: "Visa betalningar",
  paymentsTitle: "Bolånebetalningar",
  paymentsEmpty: "Inga betalningar registrerade än.",
  chargeTotal: "Dragningens summa",
  loanColumn: "Lån",
  paymentDate: "Datum",
  paymentAmount: "Belopp",
  actionsColumn: "Åtgärder",
  sourceTransactionTitle: "Ursprunglig transaktion",
  sourceTransactionShow: "Visa ursprunglig transaktion",
  editPayment: "Redigera betalning",
  deletePayment: "Ta bort betalning",
  unaccountedTitle: "Ej redovisat",
  unaccountedHint:
    "Amorteringen som registrerats på det här lånet stämmer inte med skillnaden mellan ursprungsbeloppet och nuvarande skuld — en betalning kan saknas, eller så är den registrerade skulden fel.",
  paymentRebalanceHint:
    "De andra lånen i dragningen balanseras om så att summan förblir {total} — amortering först, sedan ränta.",
  deletePaymentTitle: "Ta bort betalning?",
  deletePaymentConfirm:
    "{name}s del av dragningen {date} ({amount}) tas bort. Det går inte att ångra.",
  deleteAllPayments: "Ta bort alla",
  deleteAllPaymentsTitle: "Ta bort alla betalningar?",
  deleteAllPaymentsConfirm:
    "Alla registrerade betalningar på {name} tas bort så att du kan köra Hitta bolånebetalningar från början igen. Det går inte att ångra.",

  // Repairs & renovations view.
  viewRepairs: "Visa reparationer och renoveringar",
  // The repairs menu entry when some repairs lack a receipt.
  viewRepairsMissing: "Visa reparationer ({count} kvitton saknas)",
  repairsTitle: "Reparationer & renoveringar",
  // Subfolder a repair receipt files under when its property name is blank /
  // unusable as a folder name (a filesystem fallback, rarely seen).
  repairsFolderFallback: "Reparationer",
  repairsEmpty: "Inga reparationer eller renoveringar registrerade ännu.",
  repairsAdd: "Lägg till",
  repairsQuickAdd: "Snabblägg till",
  repairsAddManual: "Lägg till manuellt",
  editRepair: "Redigera",
  editRepairAria: "Redigera {description}",
  deleteRepairAria: "Ta bort {description}",
  repairTypeRepairs: "Reparation",
  repairTypeRenovations: "Renovering",
  repairReceipt: "Kvitto",
  manageReceipts: "Hantera kvitton",
  missingReceipt: "Saknar kvitto",
  repairReceiptsCountOne: "{count} kvitto",
  repairReceiptsCountOther: "{count} kvitton",
  repairsMissingReceiptsOne: "{count} saknat kvitto",
  repairsMissingReceiptsOther: "{count} saknade kvitton",
  deleteRepair: "Ta bort",
  deleteRepairTitle: "Ta bort post?",
  deleteRepairConfirm:
    "{description} ({amount}) tas bort från fastigheten. Källtransaktionen och eventuella kvitton behålls. Det går inte att ångra.",

  // Repair receipts manager — en reparation äger en lista daterade kvitton
  // (ett jobb kan ge flera fakturor över tid).
  repairReceiptsTitle: "Kvitton",
  repairReceiptsEmpty: "Inga kvitton tillagda ännu.",
  repairReceiptAdd: "Lägg till kvitto",
  repairReceiptDateAria: "Kvittodatum",
  repairReceiptOpenAria: "Öppna kvitto",
  repairReceiptRemoveAria: "Ta bort kvitto",

  // Add repairs / renovations picker.
  addRepairsTitle: "Lägg till reparationer & renoveringar",
  addRepairsEmpty:
    "Inga oanvända Reparation- eller Renovering-transaktioner hittades. Tagga en utgift med typen Reparation eller Renovering i din budget och kom tillbaka.",
  addRepairsSelect: "Transaktioner att lägga till",
  addRepairsOne: "Lägg till {count} post",
  addRepairsOther: "Lägg till {count} poster",

  // Single repair editor — add (pick one or more source transactions) and
  // edit (add / remove transactions, description, subtype).
  repairEditorAddTitle: "Lägg till reparation",
  repairEditorEditTitle: "Redigera reparation",
  // The multi-select list of source transactions; a repair can group several
  // bank charges that paid one invoice, sharing one receipt.
  repairSourcesLabel: "Transaktioner",
  // Count of selected transactions, shown beside the running total.
  repairSourcesCountOne: "{count} transaktion",
  repairSourcesCountOther: "{count} transaktioner",
  repairSourceEmpty:
    "Inga oanvända Reparation- eller Renovering-transaktioner hittades. Tagga en utgift med typen Reparation eller Renovering i din budget och kom tillbaka.",
  repairDescriptionLabel: "Beskrivning",
  repairDescriptionPlaceholder: "Vad gjordes, t.ex. Målade om köket",
  repairSubtypeLabel: "Underkategori",
  repairSubtypePlaceholder: "Välj en underkategori…",
  repairCompanyLabel: "Företag",
  repairCompanyHint: "Sparas på källtransaktionen och delas med din budget.",
  repairTagsLabel: "Taggar",
  repairTagsHint:
    "Tagga transaktionen för att gruppera reparationer mellan fastigheter.",

  // Manual repair editor — en reparation / renovering utan underliggande
  // banktransaktion (arbete äldre än din importerade historik når).
  manualRepairAddTitle: "Lägg till reparation manuellt",
  manualRepairEditTitle: "Redigera reparation",
  repairTypeLabel: "Typ",
  repairDateLabel: "Datum",
  repairAmountLabel: "Belopp",
  repairAmountPlaceholder: "Kostnad",

  // Delete property confirm.
  deletePropertyTitle: "Ta bort fastighet?",
  deletePropertyConfirm:
    "{name} och dess bolån tas bort. Det går inte att ångra.",
  deleteMortgageTitle: "Ta bort bolån?",
  deleteMortgageConfirm:
    "{name} och dess betalningar tas bort. Det går inte att ångra.",

  // Net sale profit estimator.
  netSale: {
    sliderLabel: "Försäljningspris",
    purchasePrice: "Inköpspris",
    repairs: "Reparationer & renoveringar",
    advertisement: "Annonsering (t.ex. Hemnet)",
    taxableGain: "Skattepliktig vinst",
    netProfit: "Nettovinst",
    netLoss: "Nettoförlust",
    broker: {
      label: "Mäklararvode",
      none: "Ingen mäklare",
      fixed: "Fast belopp",
      percent: "Procent av försäljning",
      tiered: "Bas + procent över en gräns",
      amount: "Mäklararvode",
      percentRate: "Procent (%)",
      base: "Basarvode",
      threshold: "Gräns",
      tieredHint:
        "Basarvodet gäller alltid; procentsatsen gäller bara den del av försäljningspriset som överstiger gränsen.",
    },
    line: {
      sellPrice: "Försäljningspris",
      broker: "Mäklararvode",
      advertisement: "Annonsering",
      repairs: "Reparationer & renoveringar",
      purchasePrice: "Inköpspris",
      tax: "Vinstskatt",
    },
  },

  // Files manager — uppladdade dokument / foton kopplade till en fastighet.
  filesTitle: "Filer",
  filesEmpty: "Inga filer uppladdade ännu.",
  filesUnavailable:
    "Att ladda upp filer kräver en mapp eller molntjänst. Anslut en under Inställningar → Lagring.",
  uploadFileAction: "Ladda upp",
  editFile: "Redigera",
  deleteFile: "Ta bort",
  deleteFileTitle: "Ta bort fil?",
  deleteFileConfirm:
    "{name} tas bort från den här fastigheten. Detta går inte att ångra.",
  fileAttachment: "Fil",
  fileDescription: "Beskrivning",
  fileDescriptionPlaceholder: "Vad det är, t.ex. Köket före renovering",
  fileCategory: "Kategori",
  fileTags: "Etiketter",
  fileCategoryNone: "Ingen kategori",
  newFileCategory: "Ny kategori",
  fileCategoryName: "Kategorinamn",
  fileCategoryNamePlaceholder: "t.ex. Försäkring",
  fileCategoryDuplicate: "En kategori med det här namnet finns redan.",
  filePrivate: "Privat",
  filePrivateHint:
    "Privata filer utesluts från en fastighetsexport om du inte väljer att ta med dem.",
  filePrivateBadge: "Privat",

  // Export / import — överlämningsarkivet (en ZIP med fastighetens uppgifter,
  // reparationer, kvitton och filer) nås från "…"-menyn.
  exportProperty: "Exportera fastighet",
  importProperty: "Importera fastighet",
  exportTitle: "Exportera {name}",
  exportIntro:
    "Samla den här fastigheten i en enda fil att lämna över till den nya ägaren — uppgifter, reparationer, kvitton och uppladdade dokument.",
  exportIncludeReceipts: "Ta med kvitton",
  exportIncludeReceiptsHint:
    "Ta med kvittofilerna som är kopplade till reparationer och renoveringar.",
  exportIncludePrivate: "Ta med privata filer",
  exportIncludePrivateHint:
    "Filer du markerat som privata utelämnas om inte detta är på.",
  exportIncludeFinancials: "Ta med lån och betalningar",
  exportIncludeFinancialsHint:
    "Dina lån, deras betalningshistorik, inköpspris och värdeuppskattningar — dina egna ekonomiska uppgifter, av som standard.",
  exportDestinationLabel: "Var ska den sparas",
  exportDestinationDownload: "Ladda ner fil",
  exportDestinationDownloadHint:
    "Spara arkivet bland den här enhetens nedladdningar.",
  exportDestinationBackend: "Spara i exports-mappen",
  exportDestinationBackendHint:
    "Lagra det i en exports/-mapp på din anslutna lagring.",
  exportSaved: "Sparat i exports/-mappen på din lagring.",
  exportAction: "Exportera",
  exportActionSave: "Spara",
  exportUnavailable:
    "Att exportera en fastighets filer kräver en mapp- eller molnlagring. Anslut en i Inställningar → Lagring. Uppgifter exporteras ändå.",
  exportSkippedOne: "{count} bilaga kunde inte tas med (filen saknas).",
  exportSkippedOther: "{count} bilagor kunde inte tas med (filerna saknas).",
  importTitle: "Importera fastighet",
  importIntro:
    "Välj en fastighetsexportfil (en .zip du fått) för att lägga till den bland dina fastigheter som en ny fastighet.",
  importChooseFile: "Välj fil",
  importInvalid: "Den här filen är inte en fastighetsexport.",
  importNewerVersion:
    "Den här filen skapades av en nyare version av appen. Uppdatera och försök igen.",
  importReadError: "Kunde inte läsa filen. Den kan vara skadad.",
  importSummaryRepairsOne: "{count} reparation",
  importSummaryRepairsOther: "{count} reparationer",
  importSummaryFilesOne: "{count} fil",
  importSummaryFilesOther: "{count} filer",
  importSummaryFinancials: "Lån och ekonomisk historik",
  importUnavailableNote:
    "Filer och kvitton behöver en mapp- eller molnlagring för att sparas. Utan en importeras bara fastighetens uppgifter. Anslut en i Inställningar → Lagring.",
  importAction: "Importera",
  importSuccess: "Importerade {name}.",
  importSkippedOne: "{count} bilaga importerades inte.",
  importSkippedOther: "{count} bilagor importerades inte.",

  // Shared verbs.
  save: "Spara",
  create: "Skapa",
  delete: "Ta bort",
};

export default properties;
