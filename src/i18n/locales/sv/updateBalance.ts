import type { UpdateBalanceCatalog } from "../en/updateBalance";

const updateBalance: UpdateBalanceCatalog = {
  title: "Uppdatera saldo",
  account: "Konto",
  currentBalance: "Aktuellt saldo",
  newBalance: "Nytt saldo",
  targetBalance: "Önskat saldo",
  asOfDate: "Per",
  confirm: "Lägg till korrigering",
  confirmUpdate: "Bekräfta saldouppdatering",
  noBudgetHint:
    "Inget budgetblad spårar detta konto än. Lägg till ett (Blad → Redigera → välj kontot) innan du registrerar en korrigering.",
  correctionHintPrefix: "Lägger till en saldokorrigering på",
  correctionHintMiddle: "den",
  correctionHintEnd: "så att det löpande saldot hamnar på",
  alreadyAtBalance: "Redan på detta saldo — inget att registrera.",
};

export default updateBalance;
