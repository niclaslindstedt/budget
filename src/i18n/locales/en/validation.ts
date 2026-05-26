import type { Widen } from "./_widen";

const validation = {
  requiredField: "This field is required.",
  invalidNumber: "Enter a valid number.",
  invalidDate: "Enter a valid date.",
  invalidAmount: "Enter a valid amount.",
  nameTaken: "That name is already in use.",
  pickAtLeastOne: "Pick at least one.",
  enterDescription: "Enter a description.",
} as const;

export type ValidationCatalog = Widen<typeof validation>;

export default validation;
