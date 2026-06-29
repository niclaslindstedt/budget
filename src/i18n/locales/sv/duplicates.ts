import type { DuplicatesCatalog } from "../en/duplicates";

const duplicates: DuplicatesCatalog = {
  title: "Hitta dubblettimporter",
  importTitle: "Dubbletter i denna import",
  importIntro:
    "Några rader du just importerade finns redan på ett annat konto. Välj rätt ägare — varje kopia flyttas dit, så att varje transaktion hamnar på endast ett konto.",
  importFits: "saldot stämmer",
  intro:
    "Välj vilket konto varje transaktion hör till; kopiorna i de andra kontona tas bort. Tryck på en rad för att se omgivande bankhistorik — ett saldo i grönt stämmer med kontots löpande saldo, ett markerat i rött gör det inte.",
  empty: "Inga dubblettimporter hittades.",
  emptyHint: "Varje importerad transaktion finns bara på ett konto.",
  countOne: "{n} dubblett",
  countOther: "{n} dubbletter",
  ownerLabel: "Ägare",
  skip: "Hoppa över",
  resolve: "Lös",
  resolveAria: "Ta bort dubblettkopiorna och behåll den valda ägaren",
  acceptAll: "Acceptera alla",
  acceptAllAria: "Lös varje dubblett med den föreslagna ägaren",
  setAllOwner: "Ange ägare för alla:",
  resolvedOne: "Tog bort 1 dubblettpost.",
  resolvedOther: "Tog bort {n} dubblettposter.",
  ignore: "Ignorera",
  ignoreAria: "Flagga aldrig denna transaktion som dubblett igen",
  ignored: "Ignorerad. Denna transaktion flaggas inte som dubblett igen.",
  showContextAria: "Visa omgivande bankhistorik",
  hideContextAria: "Dölj omgivande bankhistorik",
  contextNone: "Ingen omgivande historik på detta konto.",
  contextThisEntry: "denna transaktion",
  balanceError: "Detta saldo stämmer inte med kontots löpande saldo",
  balanceOk: "Detta saldo stämmer med kontots löpande saldo",
  removeSessionOne:
    "Ta även bort den andra {n} posten från samma import (hela kontoutdraget hamnade på fel konto)",
  removeSessionOther:
    "Ta även bort de andra {n} posterna från samma import (hela kontoutdraget hamnade på fel konto)",
};

export default duplicates;
