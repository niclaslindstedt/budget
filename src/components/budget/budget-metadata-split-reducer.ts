// Split-mode state for `BudgetMetadataModal`. When the user splits the
// entry they're annotating, they build the parts one at a time: fill an
// amount + type / company / tags / description, press "Split again" to
// commit that part and start the next on the remaining sum, or press
// "Next" to let the final part absorb whatever is left. This reducer
// owns the committed parts plus the in-progress draft so the component
// stays a thin view; the pure selectors below back its button gating and
// are unit-tested in `tests/budget_metadata_split_reducer_test.ts`.
//
// `total` (the entry's signed bank amount) and `fallbackDescription`
// (its raw bank text) are captured on `begin` so the reducer can compute
// the remaining sum and seed each committed split's description without
// the component re-deriving them. Amounts are kept as magnitude text
// (sign on `negative`) so a mid-edit value like "12," survives a
// keystroke, matching `SignedAmountInput`.

import type { HistoryEntrySplit, Settings } from "../../data/types";
import { formatAmountForInput, parseAmount } from "../../utils/format";

export type MetadataSplitDraft = {
  // Magnitude only; the sign lives on `negative`.
  amount: string;
  negative: boolean;
  typeId: string | null;
  companyId: string | null;
  // Explicit "this part has no merchant" opt-out, mirroring the entry
  // form's `noCompany`. Mutually exclusive with `companyId` — picking a
  // company clears it and enabling it clears the company. When set,
  // `buildSplit` persists `companyId: null` (the explicit "no company"
  // the `HistoryEntrySplit.companyId` type reserves) so the saved split
  // records the deliberate choice rather than an unset field.
  noCompany: boolean;
  tagIds: string[];
  description: string;
};

export type MetadataSplitState = {
  // The entry's signed bank amount — the parts must sum to this.
  total: number;
  // The entry's raw bank description, used as a per-split fallback when
  // the user leaves a part's description blank.
  fallbackDescription: string;
  // Parts committed via "Split again", in the order they were entered.
  committed: HistoryEntrySplit[];
  // The part currently being filled.
  draft: MetadataSplitDraft;
};

export type MetadataSplitAction =
  | {
      kind: "begin";
      total: number;
      fallbackDescription: string;
      settings: Settings;
    }
  | { kind: "setAmount"; value: string }
  | { kind: "toggleSign" }
  | { kind: "setType"; value: string | null }
  // Mirrors the entry form's `pickCompany`: `autoTypeId` is the
  // pre-computed `autoTypeForCompany(...)` result (the reducer can't see
  // `companyTypeSuggestions`), `undefined` leaves the type alone.
  | {
      kind: "pickCompany";
      companyId: string | null;
      autoTypeId: string | undefined;
    }
  // Toggle the "no company" opt-out. Enabling it clears any picked
  // company; the picker fires `pickCompany` for the clear separately,
  // but the reducer keeps the two consistent on its own too.
  | { kind: "setNoCompany"; value: boolean }
  | { kind: "setTags"; value: string[] }
  | { kind: "setDescription"; value: string }
  // Commit the draft as a part and start a fresh one sized to the new
  // remaining. `settings` formats the seeded amount text.
  | { kind: "commit"; settings: Settings };

function emptyDraft(remaining: number, settings: Settings): MetadataSplitDraft {
  return {
    amount:
      remaining === 0
        ? ""
        : formatAmountForInput(Math.abs(remaining), settings),
    negative: remaining < 0,
    typeId: null,
    companyId: null,
    noCompany: false,
    tagIds: [],
    description: "",
  };
}

export function makeInitialSplitState(): MetadataSplitState {
  return {
    total: 0,
    fallbackDescription: "",
    committed: [],
    draft: {
      amount: "",
      negative: true,
      typeId: null,
      companyId: null,
      noCompany: false,
      tagIds: [],
      description: "",
    },
  };
}

// Signed numeric value of the draft, or null when blank / unparseable /
// zero (a zero-amount part is never committable).
export function draftSignedAmount(draft: MetadataSplitDraft): number | null {
  const abs = parseAmount(draft.amount);
  if (abs === null || abs === 0) return null;
  return draft.negative ? -abs : abs;
}

function sumAmounts(splits: readonly HistoryEntrySplit[]): number {
  return splits.reduce((acc, s) => acc + s.amount, 0);
}

// What's still unallocated — the signed amount the next "Split again"
// carves from and the final "Next" part absorbs.
export function splitRemaining(state: MetadataSplitState): number {
  return state.total - sumAmounts(state.committed);
}

function buildSplit(
  draft: MetadataSplitDraft,
  fallbackDescription: string,
  signedAmount: number,
): HistoryEntrySplit {
  const split: HistoryEntrySplit = {
    description: draft.description.trim() || fallbackDescription,
    amount: signedAmount,
  };
  if (draft.typeId) split.typeId = draft.typeId;
  // An explicit opt-out persists as `null`; a real pick persists its id;
  // an untouched draft leaves the field absent.
  if (draft.noCompany) split.companyId = null;
  else if (draft.companyId) split.companyId = draft.companyId;
  if (draft.tagIds.length > 0) split.tagIds = [...draft.tagIds];
  return split;
}

// "Split again" is reachable when the draft carves a strictly smaller,
// same-direction slice off the remaining sum — so a positive remainder
// in the entry's own direction is always left for the final part.
export function canCommitContinue(state: MetadataSplitState): boolean {
  const remaining = splitRemaining(state);
  const amount = draftSignedAmount(state.draft);
  if (amount === null) return false;
  return (
    Math.sign(amount) === Math.sign(remaining) &&
    Math.abs(amount) < Math.abs(remaining)
  );
}

// "Next" is reachable once at least one part is committed — the draft
// then becomes the final part and absorbs the remaining sum, so the
// parts always sum back to the bank total (>= 2 parts, never a pointless
// single part equal to the whole entry).
export function canFinish(state: MetadataSplitState): boolean {
  return state.committed.length >= 1;
}

// The full decomposition to persist on "Next": every committed part plus
// a final part carrying the draft's metadata and the entire remaining
// amount.
export function buildFinalSplits(
  state: MetadataSplitState,
): HistoryEntrySplit[] {
  const remaining = splitRemaining(state);
  return [
    ...state.committed,
    buildSplit(state.draft, state.fallbackDescription, remaining),
  ];
}

export function budgetMetadataSplitReducer(
  state: MetadataSplitState,
  action: MetadataSplitAction,
): MetadataSplitState {
  switch (action.kind) {
    case "begin":
      return {
        total: action.total,
        fallbackDescription: action.fallbackDescription,
        committed: [],
        draft: emptyDraft(action.total, action.settings),
      };
    case "setAmount":
      return { ...state, draft: { ...state.draft, amount: action.value } };
    case "toggleSign":
      return {
        ...state,
        draft: { ...state.draft, negative: !state.draft.negative },
      };
    case "setType":
      return { ...state, draft: { ...state.draft, typeId: action.value } };
    case "pickCompany": {
      const draft: MetadataSplitDraft = {
        ...state.draft,
        companyId: action.companyId,
        // A real pick contradicts an active opt-out — clear it so the
        // two states never disagree.
        noCompany: action.companyId !== null ? false : state.draft.noCompany,
      };
      if (action.autoTypeId !== undefined) draft.typeId = action.autoTypeId;
      return { ...state, draft };
    }
    case "setNoCompany":
      return {
        ...state,
        draft: {
          ...state.draft,
          noCompany: action.value,
          // Enabling the opt-out clears any picked company.
          companyId: action.value ? null : state.draft.companyId,
        },
      };
    case "setTags":
      return { ...state, draft: { ...state.draft, tagIds: action.value } };
    case "setDescription":
      return {
        ...state,
        draft: { ...state.draft, description: action.value },
      };
    case "commit": {
      const signed = draftSignedAmount(state.draft);
      if (signed === null) return state;
      const committed = [
        ...state.committed,
        buildSplit(state.draft, state.fallbackDescription, signed),
      ];
      const remaining = state.total - sumAmounts(committed);
      return {
        ...state,
        committed,
        draft: emptyDraft(remaining, action.settings),
      };
    }
  }
}
