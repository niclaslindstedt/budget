import type { DuplicatesCatalog } from "../en/duplicates";

const duplicates: DuplicatesCatalog = {
  title: "Hitta dubblettimporter",
  intro:
    "Transaktioner som importerats till mer än ett konto — samma datum, bankbeskrivning och belopp. Välj vilket konto var och en hör till; kopiorna i de andra kontona tas bort.",
  minAmountLabel: "Minsta belopp",
  empty: "Inga dubblettimporter hittades.",
  emptyHint: "Sänk minsta belopp för att bredda sökningen.",
  countOne: "{n} dubblett",
  countOther: "{n} dubbletter",
  ownerLabel: "Ägare",
  suggestedBadge: "föreslås",
  reconcilesBadge: "saldo stämmer",
  reconcilesTitle: "Kontots saldokedja förklarar den här transaktionen.",
  gapBadge: "saldoglapp",
  gapTitle:
    "Kontots saldo hoppar här utan någon transaktion som förklarar det — sannolikt en felimport.",
  noBalanceBadge: "inget saldo",
  noBalanceTitle:
    "Den här kontoutdraget hade inget löpande saldo att kontrollera.",
  balanceLabel: "Saldo",
  keepAll: "Behåll alla (inte en dubblett)",
  resolve: "Lös",
  resolveAria: "Ta bort dubblettkopiorna och behåll den valda ägaren",
  acceptAll: "Acceptera alla förslag",
  acceptAllAria: "Lös varje dubblett med den föreslagna ägaren",
  resolvedOne: "Tog bort 1 dubblettpost.",
  resolvedOther: "Tog bort {n} dubblettposter.",
};

export default duplicates;
