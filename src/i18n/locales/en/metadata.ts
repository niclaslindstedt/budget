import type { Widen } from "./_widen";

const metadata = {
  title: "Metadata mode",
  progress: "{month} · {index} of {total}",
  fromBank: "From the bank",
  typeLabel: "Type",
  companyLabel: "Company",
  companyHint: "Tag the merchant this entry paid.",
  noCompanyLabel: "No company needed",
  noCompanyHint: "This entry won't surface here again over a missing company.",
  descriptionLabel: "Description",
  descriptionPlaceholder: "Leave blank to keep the bank's text",
  descriptionHint: "Blank keeps the bank's text.",
  skip: "Skip",
  save: "Save",
  needsTypePrompt: "Pick a type to save.",
  needsCompanyPrompt:
    'Pick a company — or check "No company needed" — to save.',
  allCaught: "All caught up.",
  allCaughtHint:
    "Every imported entry on this account has a type or a custom description.",
} as const;

export type MetadataCatalog = Widen<typeof metadata>;

export default metadata;
