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
  deleteItemConfirm:
    "Ta bort den här saken? Dess radkopplingar tas bort från alla poster.",
  editItemAria: "Redigera {name}",
  save: "Spara",
};

export default items;
