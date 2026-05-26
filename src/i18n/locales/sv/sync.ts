import type { SyncCatalog } from "../en/sync";

const sync: SyncCatalog = {
  ok: "Synkat",
  syncing: "Synkar…",
  syncingNow: "Synkar nu…",
  loading: "Laddar…",
  saving: "Sparar…",
  offline: "Offline",
  failed: "Synk misslyckades",
  failedWithMessage: "Synk misslyckades: {message}",
  throttled: "Sparning pausad en stund",
  throttledDetail:
    "{name} bad oss sakta ner. Autosparning återupptas om några sekunder — dina ändringar skickas i nästa sparning.",
  syncConflict: "Synkkonflikt",
  syncConflictDetail:
    "{name} ändrades under den här enheten. Ladda om för att hämta fjärrkopian.",
  syncedTo: "Synkat till {name}",
  saveUnsaved: "Spara osparade ändringar",
  pendingSync: "Synk väntar",
  pendingSyncDetail:
    "Ändringar finns inte i molnet än. Tryck Spara nu för att skicka direkt, eller vänta på nästa autospar.",
  cloudSync: "Molnsynk",
  status: "Status",
  provider: "Leverantör",
  fileLocation: "Filplats",
  openIn: "Öppna i {name}",
  saveNow: "Spara nu",
  tryAgain: "Försök igen",
  retry: "Försök igen",
  reauthRequired: "Återanslutning krävs",
  reauthRequiredDetail:
    "Din {name}-session har gått ut. Återanslut för att fortsätta synka — inga data går förlorade.",
  reconnect: "Återanslut {name}",
  pending: "Sparar…",
  details: "Synkdetaljer",
  lastSyncedAt: "Senast synkad {time}",
  conflict: "Konflikt",
  conflictHint:
    "Den här enheten och {name} redigerade budgeten var för sig medan du var offline. Välj vilken kopia som ska behållas — den andra kastas.",
  conflictTitle: "Synkkonflikt med {name}",
  conflictLocalLabel: "Den här enheten",
  conflictRemoteLabel: "{name}",
  conflictSheetsEntries: "{sheets} ark · {entries} poster",
  keepLocal: "Behåll min",
  keepRemote: "Behåll den andra",
  offlineMode: "{name} ej nåbar",
  offlineModeDetail:
    "Redigerar en lokal kopia eftersom {name} inte kan nås. Ändringar skickas automatiskt när anslutningen är tillbaka.",
  parseError: "Filen kan inte läsas",
  parseErrorDetail:
    "{name} returnerade data som den här versionen inte kan tolka: {message}. Autosparning är pausad så att din lagrade data inte skrivs över. Försök ladda om i en nyare version, eller återställ en tidigare version från leverantörens filhistorik.",
  shrinkWarning: "Sparning pausad — stor minskning",
  shrinkWarningDetail:
    "Nästa sparning skulle krympa din budget från {prev} till {next} byte ({pct}% mindre). Bekräfta för att spara ändå, eller kassera för att återställa minnesläget till senast sparade kopia.",
  confirmShrink: "Spara ändå",
  discardShrink: "Kassera lokala ändringar",
};

export default sync;
