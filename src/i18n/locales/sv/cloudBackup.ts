import type { CloudBackupCatalog } from "../en/cloudBackup";

const cloudBackup: CloudBackupCatalog = {
  title: "Säkerhetskopior",
  none: "Inga säkerhetskopior än. Tryck ”Säkerhetskopiera nu” för att skapa en.",
  introHint:
    "Tidsstämplade ögonblicksbilder skrivna i mappen {name} backups. Att återställa en säkerhetskopia sparar din nuvarande fil som en säkerhetsnät först.",
  backUpNow: "Säkerhetskopiera nu",
  loadingBackups: "Laddar säkerhetskopior…",
  restore: "Återställ",
  restoreTitle: "Återställ från säkerhetskopia?",
  restoreHint:
    "Den aktuella budgeten ersätts med denna ögonblicksbild. Din nuvarande fil sparas som en automatisk säkerhetskopia först.",
  deleteAria: "Ta bort {filename}",
  deleteTitle: "Ta bort den här säkerhetskopian?",
  deleteHint:
    "Ögonblicksbilden tas bort från säkerhetskopiemappen. Det går inte att ångra.",
  deleting: "Tar bort säkerhetskopia…",
  deleted: "Tog bort {filename}.",
  deleteFailed: "Borttagning misslyckades: {error}",
  listing: "Listar säkerhetskopior…",
  failed: "Kunde inte lista säkerhetskopior.",
  download: "Ladda ner",
  downloadAria: "Ladda ner {filename}",
  autoCreated: "Skapad automatiskt före en återställning",
  autoBadge: "auto",
  encryptedBadge: "krypterad",
  couldNotParse: "Kunde inte tolka säkerhetskopia: {error}",
  restored: "Återställde {filename}. Tidigare fil sparades som {auto}.",
  restoredMigrated:
    "Återställde {filename} (migrerad till aktuell version). Tidigare fil sparades som {auto}.",
  restoreFailed: "Återställning misslyckades: {error}",
  accountOne: "{n} konto",
  accountOther: "{n} konton",
  entryOne: "{n} post",
  entryOther: "{n} poster",
  providerFolder: "mapp",
  creatingBackup: "Skapar säkerhetskopia…",
  backupSavedAs: "Säkerhetskopia sparad som {filename}.",
  backupFailed: "Säkerhetskopiering misslyckades: {error}",
  backingUpCurrent: "Säkerhetskopierar aktuell fil…",
  restoring: "Återställer…",
  couldNotLoad: "Kunde inte ladda säkerhetskopior: {error}",
};

export default cloudBackup;
