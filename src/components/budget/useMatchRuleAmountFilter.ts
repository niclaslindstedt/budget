import { useEffect, useMemo, useState } from "react";

import type { MatchRule, Settings } from "../../data/types";
import { formatAmountForInput, parseAmount } from "../../utils/format";

import type { MatchRuleSeed } from "./BudgetMatchRuleModal";

type AmountSign = NonNullable<MatchRule["amountSign"]>;

// UI-only mode that extends the persisted `amountSign` with two extra
// options: "exact" pins to a single amount (stored as
// `amountMin === amountMax`), and "range" stores a signed band. Both
// are mutually exclusive with the sign filters — picking either hides
// the sign filter and surfaces the bounded-amount inputs; picking
// Any / Negative / Positive clears the bounds. The persisted
// `amountSign` stays "any" while in either mode (the bounds carry
// their own sign) so the data model is unchanged.
export type SignMode = AmountSign | "exact" | "range";

export type AmountFilterInputs = {
  signMode: SignMode;
  minText: string;
  minNegative: boolean;
  maxText: string;
  maxNegative: boolean;
  exactText: string;
  exactNegative: boolean;
};

export type AmountFilterDerived = {
  isRangeMode: boolean;
  isExactMode: boolean;
  amountMin: number | undefined;
  amountMax: number | undefined;
  amountSign: AmountSign;
  rangeInverted: boolean;
  exactBlank: boolean;
};

export type AmountFilterApi = {
  state: AmountFilterInputs;
  setSignMode: (m: SignMode) => void;
  setMinText: (s: string) => void;
  toggleMinNegative: () => void;
  setMaxText: (s: string) => void;
  toggleMaxNegative: () => void;
  setExactText: (s: string) => void;
  toggleExactNegative: () => void;
  derived: AmountFilterDerived;
};

export function useMatchRuleAmountFilter(
  open: boolean,
  existing: MatchRule | null,
  seed: MatchRuleSeed | null,
  settings: Settings,
): AmountFilterApi {
  const [signMode, setSignMode] = useState<SignMode>("any");
  // The "between" range. Each bound has a magnitude (text) and a
  // sign, mirroring the +/- toggle pattern used by the other amount
  // inputs in the app. An empty text means "no bound".
  const [minText, setMinText] = useState("");
  const [minNegative, setMinNegative] = useState(true);
  const [maxText, setMaxText] = useState("");
  const [maxNegative, setMaxNegative] = useState(true);
  // Single signed amount used when the user picks the Exact mode.
  // Persisted as `amountMin === amountMax` so the matcher needs no
  // changes — only the UI distinguishes "exact" from "1-wide range".
  const [exactText, setExactText] = useState("");
  const [exactNegative, setExactNegative] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      // A rule with both bounds equal collapses to Exact mode (one
      // input). A rule with any other combination of bounds keeps the
      // legacy Range mode. A rule without bounds shows the saved sign
      // filter as before.
      const minDef = existing.amountMin !== undefined;
      const maxDef = existing.amountMax !== undefined;
      const isExact =
        minDef && maxDef && existing.amountMin === existing.amountMax;
      setSignMode(
        isExact
          ? "exact"
          : minDef || maxDef
            ? "range"
            : (existing.amountSign ?? "any"),
      );
      if (minDef) {
        setMinText(
          formatAmountForInput(Math.abs(existing.amountMin!), settings),
        );
        setMinNegative(existing.amountMin! < 0);
      } else {
        setMinText("");
        setMinNegative(true);
      }
      if (maxDef) {
        setMaxText(
          formatAmountForInput(Math.abs(existing.amountMax!), settings),
        );
        setMaxNegative(existing.amountMax! < 0);
      } else {
        setMaxText("");
        setMaxNegative(true);
      }
      if (isExact) {
        setExactText(
          formatAmountForInput(Math.abs(existing.amountMin!), settings),
        );
        setExactNegative(existing.amountMin! < 0);
      } else {
        setExactText("");
        setExactNegative(true);
      }
      return;
    }
    // Seed sign filter from the row the user invoked from: most
    // descriptions are tied to one direction (a refund vs a purchase
    // for the same merchant), so defaulting to the seed's sign keeps
    // a fat-fingered "BAUHAUS" rule from sweeping the inverse
    // direction by accident. The user can flip to "Any" if they
    // really want both.
    setSignMode(seed ? (seed.amount < 0 ? "negative" : "positive") : "any");
    setMinText("");
    setMaxText("");
    setExactText("");
    // Default the toggles to the seed's direction so the user can
    // type magnitudes without first remembering to flip the sign.
    const seedNeg = seed ? seed.amount < 0 : true;
    setMinNegative(seedNeg);
    setMaxNegative(seedNeg);
    setExactNegative(seedNeg);
  }, [open, existing, seed, settings]);

  const isRangeMode = signMode === "range";
  const isExactMode = signMode === "exact";

  // Resolve each bound to a signed JS number (or undefined when the
  // user left the field blank or range/exact mode is off). Done once
  // so the preview, the draft, and the submit handler all agree on
  // what "this band means".
  const amountExact = useMemo(
    () =>
      isExactMode ? parseSignedAmount(exactText, exactNegative) : undefined,
    [isExactMode, exactText, exactNegative],
  );
  // In Exact mode the single value drives both ends of the band so
  // the matcher (which still compares amountMin <= a <= amountMax)
  // accepts only that exact amount. Range mode keeps the user's
  // From/To inputs. Otherwise both ends are undefined (no bounds).
  const amountMin = useMemo(() => {
    if (isExactMode) return amountExact;
    if (isRangeMode) return parseSignedAmount(minText, minNegative);
    return undefined;
  }, [isExactMode, isRangeMode, amountExact, minText, minNegative]);
  const amountMax = useMemo(() => {
    if (isExactMode) return amountExact;
    if (isRangeMode) return parseSignedAmount(maxText, maxNegative);
    return undefined;
  }, [isExactMode, isRangeMode, amountExact, maxText, maxNegative]);

  // Reject a band where the user has typed both ends but inverted
  // them (min > max). The preview falls through to zero matches so
  // the user sees the mistake immediately. Exact mode collapses min
  // and max to the same value, so this can only fire in range mode.
  const rangeInverted =
    amountMin !== undefined && amountMax !== undefined && amountMin > amountMax;
  // Persisted sign filter — "any" while in range or exact mode, since
  // the bounds carry their own sign.
  const amountSign: AmountSign = isRangeMode || isExactMode ? "any" : signMode;
  const exactBlank = isExactMode && amountExact === undefined;

  const derived = useMemo<AmountFilterDerived>(
    () => ({
      isRangeMode,
      isExactMode,
      amountMin,
      amountMax,
      amountSign,
      rangeInverted,
      exactBlank,
    }),
    [
      isRangeMode,
      isExactMode,
      amountMin,
      amountMax,
      amountSign,
      rangeInverted,
      exactBlank,
    ],
  );

  return {
    state: {
      signMode,
      minText,
      minNegative,
      maxText,
      maxNegative,
      exactText,
      exactNegative,
    },
    setSignMode,
    setMinText,
    toggleMinNegative: () => setMinNegative((s) => !s),
    setMaxText,
    toggleMaxNegative: () => setMaxNegative((s) => !s),
    setExactText,
    toggleExactNegative: () => setExactNegative((s) => !s),
    derived,
  };
}

// Convert one bound's magnitude text + sign toggle into a signed
// number. Returns `undefined` when the field is blank (no bound) so
// the caller can leave that end of the band open.
function parseSignedAmount(
  text: string,
  negative: boolean,
): number | undefined {
  if (text.trim() === "") return undefined;
  const abs = parseAmount(text);
  if (abs === null) return undefined;
  const mag = Math.abs(abs);
  if (mag === 0) return 0;
  return negative ? -mag : mag;
}
