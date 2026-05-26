import type { Widen } from "./_widen";

const color = {
  pick: "Pick a color",
  none: "No color",
} as const;

export type ColorCatalog = Widen<typeof color>;

export default color;
