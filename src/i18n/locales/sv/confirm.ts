import type { ConfirmCatalog } from "../en/confirm";

const confirm: ConfirmCatalog = {
  title: "Är du säker?",
  confirm: "Bekräfta",
  confirmDelete: "Ja, ta bort",
  confirmDiscard: "Ja, förkasta",
  deleteRow: "Ta bort rad",
  deleteRecurring: "Ta bort återkommande post",
  deleteRecurringHint:
    "Denna post är en del av en återkommande serie. Hur mycket ska tas bort?",
  deleteRecurringStopAfter: "Stoppa efter ett datum",
  deleteRowHint: "Raden tas bort permanent.",
  deleteSelectedHintOne: "{n} rad tas bort permanent.",
  deleteSelectedHintOther: "{n} rader tas bort permanent.",
  deleteSheetHint:
    "{name} och alla dess rader tas bort permanent. Det går inte att ångra.",
  deleteAccountHint:
    "{name} tas bort permanent, tillsammans med dess överföringar och bankhistorik. Blad som är kopplade till det kopplas bort. Det går inte att ångra.",
  correctionRemoveHint:
    "Korrigeringen på {delta} tas bort och det löpande saldot återställs.",
  signOutWarningOne:
    "Av säkerhetsskäl loggas du ut om {n} sekund om du inte är aktiv.",
  signOutWarningOther:
    "Av säkerhetsskäl loggas du ut om {n} sekunder om du inte är aktiv.",
  stayActive: "Förbli inloggad",
};

export default confirm;
