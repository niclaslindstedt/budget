import type { Widen } from "./_widen";

const calc = {
  open: "Calculate amount",
  title: "Add up the amount",
  placeholder: "e.g. 100 + 30 + 50",
  hint: "Type a sum — the result replaces the amount.",
  invalid: "Can't work that out",
} as const;

export type CalcCatalog = Widen<typeof calc>;

export default calc;
