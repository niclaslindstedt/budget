import type { ValueImportCatalog } from "../en/valueImport";

const valueImport: ValueImportCatalog = {
  title: "Importera från fil",
  trigger: "Importera från fil",
  dropHint: "Släpp en CSV- eller Excel-fil här",
  browse: "Välj fil",
  supported: "CSV eller Excel (.xlsx)",
  instruction:
    "Klicka på en kolumnrubrik för att ange den som datum- eller värdekolumn. De markerade kolumnerna förhandsvisas nedan så som de kommer att importeras.",
  dateColumn: "Datum",
  pickBoth: "Välj en datumkolumn och en värdekolumn för att fortsätta.",
  readyOne: "1 värde redo att importeras.",
  readyOther: "{count} värden redo att importeras.",
  skipped: "{count} hoppas över",
  rowsShown: "Visar de första {shown} av {total} raderna.",
  chooseDifferent: "Välj en annan fil",
  importOne: "Importera 1 värde",
  importOther: "Importera {count} värden",
  emptyFile: "Den här filen har inga rader att importera.",
  unreadable: "Kunde inte läsa filen. Prova en CSV- eller .xlsx-export.",
};

export default valueImport;
