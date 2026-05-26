import type { ToastCatalog } from "../en/toast";

const toast: ToastCatalog = {
  region: "Aviseringar",
  dismiss: "Stäng",
  undid: "Ångrade: {action}",
  redid: "Gjorde om: {action}",
  imported: "Importerade {n} blad",
  importedOne: "Importerade 1 blad",
  exported: "Exporterade budgetdata",
  cloudConnected: "Ansluten till {provider}",
  cloudDisconnected: "Frånkopplad från {provider}",
  folderConnected: "Ansluten till lokal mapp",
  folderDisconnected: "Frånkopplad från lokal mapp",
  sheetDeleted: "Tog bort bladet ”{name}”",
  accountDeleted: "Tog bort kontot ”{name}”",
  saveError: "Sparandet misslyckades — {reason}",
  rowsDeletedOne: "Tog bort 1 rad",
  rowsDeletedOther: "Tog bort {n} rader",
};

export default toast;
