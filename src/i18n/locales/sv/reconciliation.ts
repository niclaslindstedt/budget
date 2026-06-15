import type { ReconciliationCatalog } from "../en/reconciliation";

const reconciliation: ReconciliationCatalog = {
  title: "Matcha importerade poster",
  nothingToTriage:
    "Inget kvar att hantera — varje importerad post har antingen ett stabilt id eller matchar redan en inlärd serieregel.",
  probableMatches: "Troliga matchningar",
  predictionsThatDidntPost: "Förutsägelser som inte bokfördes",
  skipAll: "Hoppa över alla",
  applyToSeries: "Använd för hela serien",
  seriesRuleQueued: "Serieregel köad",
  keep: "Behåll",
  deleteRow: "Ta bort",
  moveTo: "Flytta till",
  moveToNextMonthStart: "Nästa månadsstart",
  moveToNextMonthSameDate: "Nästa månad, samma datum",
  monthCoveredHeader: "{month}",
  monthCoveredSubtitle: "täcks helt av kontohistorik",
  bulkKeepAll: "Behåll alla",
  bulkDeleteAll: "Ta bort alla",
  bulkMoveAllToNextMonthStart: "Flytta alla till nästa månadsstart",
  infoAria: "Om förutsägelser som inte bokfördes",
  hint: "Matcha importerade bankposter mot rader du förutsåg.",
  matched: "Matchade",
  orphans: "Omatchade förutsägelser",
  orphanHint:
    "Dessa månader täcks nu helt av din kontohistorik. Raderna nedan bokfördes inte — ta bort dem eller flytta dem till ett senare datum.",
  nothingToDo: "Inget att stämma av.",
  bankSide: "Bank",
  rowSide: "Förutsett",
  confirmTitle: "Använd avstämningen?",
  confirmHint: "{n} rader tas bort och {m} flyttas.",
};

export default reconciliation;
