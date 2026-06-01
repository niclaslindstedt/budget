import type { ItemsCatalog } from "../en/items";

const items: ItemsCatalog = {
  // ItemPicker
  pickItemEllipsis: "Välj en pryl…",
  noItemsYet: "Inga prylar än.",
  clearItem: "Rensa pryl",
  newItem: "Ny pryl",
  itemName: "Namn",
  itemNamePlaceholder: "iPhone 15 Pro",
  subtypeOptional: "Underkategori (valfritt)",
  // SubtypePicker
  pickSubtypeEllipsis: "Välj en underkategori…",
  noSubtypesYet: "Inga underkategorier än.",
  clearSubtype: "Rensa underkategori",
  newSubtype: "Ny underkategori",
  subtypeName: "Namn",
  subtypeNamePlaceholder: "Laptop",
  subtypeDuplicateName:
    "En underkategori med det här namnet finns redan under den typen.",
  parentType: "Typ",
  parentTypePlaceholder: "Välj en typ…",
  // Shared
  create: "Skapa",
  // Line-items modal
  lineItemsTitle: "Prylar",
  lineItemsIntro:
    "Koppla en del av det här köpet till prylar du äger. Det du inte fördelar blir en rest.",
  purchase: "Köp",
  item: "Pryl",
  lineN: "Pryl {n}",
  removeLine: "Ta bort pryl",
  lineAmount: "Belopp",
  lineNote: "Anteckning (valfritt)",
  lineNotePlaceholder: "t.ex. med AppleCare",
  addLine: "Lägg till pryl",
  remainder: "Rest",
  remainderZero: "Helt fördelat",
  remainderHint: "Det ofördelade beloppet lämnas som en rest.",
  remainderOver: "Prylarna överstiger köpets totalbelopp.",
  needItemAndAmount: "Varje pryl behöver både en pryl och ett belopp.",
  button: "Spara",
  buttonDisabled: "Slutför eller rensa den halvfyllda prylen först.",
  // Edit-item modal
  editItemTitle: "Redigera sak",
  newItemTitle: "Ny sak",
  purchasePrice: "Inköpspris",
  purchasePricePlaceholder: "t.ex. 12 000",
  linkedTotal: "Kopplade rader: {amount}",
  acquiredAt: "Inköpt",
  depreciates: "Skrivs av över tid",
  ratePerYear: "Takt per år (%)",
  ratePerYearPlaceholder: "t.ex. 20",
  depreciationFloor: "Lägsta värde (valfritt)",
  resaleValue: "Andrahandsvärde",
  disposed: "Såld eller avyttrad",
  disposedAt: "Datum",
  soldFor: "Såld för",
  itemNote: "Notering",
  itemNotePlaceholder: "t.ex. serienummer, skick",
  deleteItem: "Ta bort sak",
  editItemAria: "Redigera {name}",
  save: "Spara",
  // Kvittosektion i redigera sak-modalen
  receipt: "Kvitto",
  receiptUpload: "Ladda upp kvitto",
  receiptReplace: "Byt kvitto",
  receiptView: "Visa",
  receiptRemove: "Ta bort",
  receiptUploading: "Laddar upp…",
  receiptUnsupported:
    "Kvitton kräver lagring i lokal mapp eller moln. Byt lagring under Inställningar → Lagring för att bifoga ett.",
  receiptError: "Kunde inte spara kvittot. Försök igen.",
  receiptMissing: "Kvittofilen hittades inte i den här lagringen.",
  // Undermappens namn för typmapp-namnmönstret när en sak saknar typ.
  receiptUncategorized: "Okategoriserat",
  // Hitta saker-modalen (skanna kontohistoriken efter troliga köp)
  find: {
    menu: "Hitta saker",
    title: "Hitta saker",
    intro:
      "De här transaktionerna ser ut som sakköp. Lägg till rader för att katalogisera vad du köpt, hoppa över för nu, ignorera en enskild post, eller uteslut alla liknande transaktioner på en gång.",
    empty:
      "Inga troliga sakköp hittades. Justera beloppet eller typfiltret under Inställningar → Saker, eller importera mer historik.",
    addLineItems: "Lägg till rader",
    skip: "Hoppa över för nu",
    ignore: "Ignorera transaktionen",
    excludeSimilar: "Uteslut liknande transaktioner",
    excludeSimilarHint:
      "Uteslut hädanefter alla transaktioner med liknande beskrivning",
    linkedCount: "{n} kopplade",
  },
};

export default items;
