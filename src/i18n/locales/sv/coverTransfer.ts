import type { CoverTransferCatalog } from "../en/coverTransfer";

const coverTransfer: CoverTransferCatalog = {
  // Create modal
  createTitle: "Täck med en överföring",
  createHint:
    "Ersätt de här utgifterna från ett annat konto. Vi summerar dem och genererar ett kort meddelande att ange på överföringen så att den kan matchas när du importerar banken senare.",
  motivationLabel: "Motivering",
  motivationPlaceholder: "Varför täcker du dessa? (t.ex. barnens kläder)",
  fromLabel: "Täck från",
  fromPlaceholder: "Välj ett konto",
  accountsGroup: "Konton",
  savingsGroup: "Sparkonton",
  totalLabel: "Totalt",
  coveringOne: "Täcker {n} transaktion",
  coveringOther: "Täcker {n} transaktioner",
  create: "Skapa täckningsöverföring",
  sameAccountError: "Alla täckta transaktioner måste ligga på samma konto.",
  noFromError: "Välj kontot att överföra från.",
  // Info modal
  infoTitle: "Täckningsöverföring",
  amountToTransfer: "Belopp att överföra",
  messageLabel: "Meddelande",
  copyAmount: "Kopiera belopp",
  copyMessage: "Kopiera meddelande",
  copied: "Kopierat",
  instructions:
    "Gör överföringen i din bank med beloppet och meddelandet ovan. Den upptäcks automatiskt vid nästa import.",
  motivationHeading: "Motivering",
  coveredHeading: "Täckta transaktioner",
  routeLabel: "Från → Till",
  statusPending: "Inte överförd än",
  statusCompleted: "Överförd",
  // Toolbar + row affordances
  coverAction: "Täck",
  coverSelected: "Täck valda transaktioner",
  menuCover: "Täck med överföring",
  coveredGlyphTitle:
    "Redovisad via en täckningsöverföring — tryck för detaljer",
  openInfo: "Visa detaljer för täckningsöverföring",
};

export default coverTransfer;
