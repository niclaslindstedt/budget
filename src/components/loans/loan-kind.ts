import type { MessageKey } from "../../i18n";
import type { CategoryIcon, LoanKind } from "../../data/types";

// Display label key per loan kind. Lives on the component side because
// `MessageKey` is an i18n concern — the data layer maps kinds to preset
// type ids instead (`LOAN_PRESET_TYPE_BY_KIND`).
export const LOAN_KIND_LABEL_KEY: Readonly<Record<LoanKind, MessageKey>> = {
  student: "loansSheet.kindStudent",
  mortgage: "loansSheet.kindMortgage",
  car: "loansSheet.kindCar",
  private: "loansSheet.kindPrivate",
  personal: "loansSheet.kindPersonal",
};

// Fallback row glyph per kind, used when the loan carries no glyph of its
// own. Matches the matching preset type's glyph so a tagged transaction
// and its loan read the same.
export const LOAN_KIND_GLYPH: Readonly<Record<LoanKind, CategoryIcon>> = {
  student: "graduation-cap",
  mortgage: "landmark",
  car: "car",
  private: "landmark",
  personal: "hand-coins",
};
