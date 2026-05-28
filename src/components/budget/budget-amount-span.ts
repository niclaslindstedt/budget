import type { Settings } from "../../data/types";
import { formatAmountForInput, parseAmount } from "../../utils/format";

// Pure conversions between the amount-span modal inputs (mode + three
// magnitude strings + a shared sign) and the persisted signed numbers
// (the estimate in the amount cell plus `amountMin` / `amountMax` on the
// row). Kept out of the component so all three entry modals share one
// implementation of the sign math.

export type AmountMode = "exact" | "estimate";

export type ResolvedSpan = {
  // Signed estimate (or the exact amount in exact mode). `null` when the
  // amount field is empty.
  amount: number | null;
  // Signed, numerically-ordered bounds (`amountMin <= amountMax`), or
  // `null` when the row isn't a complete estimate band.
  amountMin: number | null;
  amountMax: number | null;
};

// Build the persisted numbers from the modal's input strings. The "min"
// / "max" fields are entered as positive magnitudes (cheapest vs most
// expensive bill); the shared sign turns them into signed bounds and the
// pair is ordered so a negative band still satisfies amountMin <=
// amountMax.
export function resolveAmountSpan(
  mode: AmountMode,
  negative: boolean,
  amountStr: string,
  minStr: string,
  maxStr: string,
): ResolvedSpan {
  const sign = negative ? -1 : 1;
  const estMag = parseAmount(amountStr);
  const amount = estMag === null ? null : sign * estMag;
  if (mode !== "estimate") {
    return { amount, amountMin: null, amountMax: null };
  }
  const aMag = parseAmount(minStr);
  const bMag = parseAmount(maxStr);
  if (aMag === null || bMag === null) {
    return { amount, amountMin: null, amountMax: null };
  }
  const a = sign * aMag;
  const b = sign * bMag;
  return { amount, amountMin: Math.min(a, b), amountMax: Math.max(a, b) };
}

// Seed the "Minimum" / "Maximum" input strings from a row's stored
// bounds. The smaller magnitude is the cheapest occurrence (the
// "Minimum" field) regardless of sign; the larger is the "Maximum".
export function spanInputStringsFromBounds(
  amountMin: number,
  amountMax: number,
  settings: Settings,
): { min: string; max: string } {
  const lo = Math.min(Math.abs(amountMin), Math.abs(amountMax));
  const hi = Math.max(Math.abs(amountMin), Math.abs(amountMax));
  return {
    min: formatAmountForInput(lo, settings),
    max: formatAmountForInput(hi, settings),
  };
}

// "estimate" iff the row carries both bounds.
export function amountModeFromRow(
  amountMin: number | undefined,
  amountMax: number | undefined,
): AmountMode {
  return amountMin !== undefined && amountMax !== undefined
    ? "estimate"
    : "exact";
}
