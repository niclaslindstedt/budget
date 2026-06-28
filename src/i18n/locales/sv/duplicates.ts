import type { DuplicatesCatalog } from "../en/duplicates";

const duplicates: DuplicatesCatalog = {
  title: "Hitta dubblettimporter",
  intro:
    "Transaktioner som importerats till mer än ett konto — samma datum, bankbeskrivning och belopp. Välj vilket konto var och en hör till; kopiorna i de andra kontona tas bort.",
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
};

export default duplicates;
