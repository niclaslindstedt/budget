import { PRESET_TYPE_MORTGAGE_ID } from "../presets/types";
import type { LoanKind } from "../types";

// The preset entry type each loan kind anchors on. The payment-import
// candidate scan offers bank entries whose resolved type matches the
// loan's kind, so tagging a transaction "Car loan" makes it surface when
// importing payments on a car loan. `mortgage` and `csn` predate the
// Loans category — see the id-immutability note in `presets/types.ts`.
export const LOAN_PRESET_TYPE_BY_KIND: Readonly<Record<LoanKind, string>> = {
  student: "preset-type-csn",
  mortgage: PRESET_TYPE_MORTGAGE_ID,
  car: "preset-type-car-loan",
  private: "preset-type-private-loan",
  personal: "preset-type-personal-loan",
};

// All five kinds, in the order the kind picker presents them.
export const LOAN_KINDS: readonly LoanKind[] = [
  "mortgage",
  "student",
  "car",
  "private",
  "personal",
];
