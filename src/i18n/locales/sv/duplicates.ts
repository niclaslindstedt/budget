import type { DuplicatesCatalog } from "../en/duplicates";

const duplicates: DuplicatesCatalog = {
  title: "Hitta dubblettimporter",
  intro:
    "Transaktioner som importerats till mer än ett konto med samma datum, bankbeskrivning, belopp och saldo — kännetecknet på en kontoutdrag importerat till fel konto. Välj vilket konto var och en hör till; kopiorna i de andra kontona tas bort. Tryck på en rad för att se omgivande bankhistorik och kontrollera att saldona stämmer.",
  empty: "Inga dubblettimporter hittades.",
  emptyHint: "Varje importerad transaktion finns bara på ett konto.",
  countOne: "{n} dubblett",
  countOther: "{n} dubbletter",
  ownerLabel: "Ägare",
  keepAll: "Behåll alla (inte en dubblett)",
  resolve: "Lös",
  resolveAria: "Ta bort dubblettkopiorna och behåll den valda ägaren",
  acceptAll: "Acceptera alla",
  acceptAllAria: "Lös varje dubblett med den föreslagna ägaren",
  resolvedOne: "Tog bort 1 dubblettpost.",
  resolvedOther: "Tog bort {n} dubblettposter.",
  ignore: "Ignorera",
  ignoreAria: "Flagga aldrig denna transaktion som dubblett igen",
  ignored: "Ignorerad. Denna transaktion flaggas inte som dubblett igen.",
  showContextAria: "Visa omgivande bankhistorik",
  hideContextAria: "Dölj omgivande bankhistorik",
  contextNone: "Ingen omgivande historik på detta konto.",
  contextThisEntry: "denna transaktion",
};

export default duplicates;
