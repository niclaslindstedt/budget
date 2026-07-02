import type { SheetModalCatalog } from "../en/sheetModal";

const sheetModal: SheetModalCatalog = {
  titleNew: "Nytt blad",
  titleEdit: "Redigera blad",
  name: "Namn",
  namePlaceholder: "Lönekonto, Resefond, Barnkonto…",
  type: "Typ",
  typeBudget: "Budget",
  typeAccountsOverview: "Kontoöversikt",
  accountsHint:
    "Kontobladet är en arbetsytesövergripande översikt. Hantera konton och överföringar därifrån — ingen koppling per blad behövs.",
  itemsHint:
    "Prylbladet listar allt du äger, med vad varje sak kostade och vad den är värd nu. Lägg till prylar därifrån — ingen koppling per blad behövs.",
  propertiesHint:
    "Fastighetsbladet håller koll på bostäderna du äger — vad var och en kostade, vad den är värd nu, och bolånen på den. Lägg till fastigheter därifrån; varje bolån kopplas till sitt eget konto för att hitta betalningar.",
  carsHint:
    "Bilbladet visar vad det verkligen kostar att ha bil — länkade transportkostnader, värdeminskning och låneränta. Lägg till bilar därifrån — ingen koppling per blad behövs.",
  loansHint:
    "Lånebladet håller koll på pengarna du är skyldig — studielån, billån, bolån, lånade pengar — och betalningarna på varje lån. Lägg till lån därifrån; ett bolån kan länka en fastighets bolån så att de två bladen alltid stämmer överens.",
  insightsHint:
    "Insiktsbladet läser allt du redan håller koll på — konton, sparande, saker, fastigheter, lån — och visar helheten, med din nettoförmögenhet först. Inget att lägga till här; det följer de andra bladen.",
  scenariosHint:
    "Scenariobladet spelar upp tänk-om-framtider mot en budget du redan för — förlora jobbet, köpa bil — utan att någonsin ändra den riktiga budgeten.",
  baseBudgetHint:
    "Budgetbladet som scenarierna utgår ifrån. Din riktiga budget ändras aldrig.",
  baseChangeWarning:
    "Att byta basbudget rensar varje scenarios ändringar (de hör till den gamla budgetens rader). Scenarionamnen behålls.",
  salaryAccountHint:
    "Kontot din lön betalas in på. ”Hitta löner” söker igenom det här kontots bankhistorik efter löner. Använd ett löneblad per person, vart och ett kopplat till den personens lönekonto.",
  color: "Färg",
  glyph: "Ikon",
  account: "Konto",
  newAccountName: "Nytt kontonamn",
  newAccountPlaceholder: "Lönekonto, Kontanter, Resefond…",
  accountHint:
    "Koppla budgeten till ett konto så att det löpande saldot kan återspegla kontots verkliga saldo. Lämna okopplad för en fristående framtidsorienterad ledger.",
  descriptionPlaceholder: "Valfritt. t.ex. utgifter för barnkonto.",
  description: "Beskrivning",
  pickAccount: "Välj ett konto",
  noAccount: "Inget konto",
  newAccount: "Nytt konto",
  alreadyExists: "Finns redan",
  deleteTitle: "Ta bort blad?",
  deleteHint: "Raderna i detta blad tas bort. Det går inte att ångra.",
  deleteThisSheet: "Ta bort detta blad",
  cantDeleteLast: "Kan inte ta bort det enda bladet",
  create: "Skapa",
};

export default sheetModal;
