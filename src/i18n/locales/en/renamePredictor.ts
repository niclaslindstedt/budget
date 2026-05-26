import type { Widen } from "./_widen";

const renamePredictor = {
  title: "Review suggested renames",
  intro:
    "Based on past edits, these new entries can be renamed automatically. Uncheck the ones you want to keep as-is, or edit the suggested text inline.",
  original: "From bank",
  suggested: "Rename to",
  suggestedPlaceholder: "Suggested name",
  suggestionAria: "Rename suggestion for {description}",
  acceptAria: "Accept rename for {description}",
  hitCountOne: "1 prior rename",
  hitCountOther: "{n} prior renames",
  cancel: "Cancel import",
  skip: "Skip renames",
  commit: "Apply renames",
  commitCountOne: "Apply 1 rename",
  commitCountOther: "Apply {n} renames",
} as const;

export type RenamePredictorCatalog = Widen<typeof renamePredictor>;

export default renamePredictor;
