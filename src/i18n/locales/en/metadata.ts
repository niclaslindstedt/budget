import type { Widen } from "./_widen";

const metadata = {
  title: "Metadata mode",
  progress: "{month} · {index} of {total}",
  fromBank: "From the bank",
  typeLabel: "Type",
  companyLabel: "Company",
  companyHint: "Tag the merchant this entry paid.",
  noCompanyHint: "This entry won't surface here again over a missing company.",
  descriptionLabel: "Description",
  descriptionPlaceholder: "Leave blank to keep the bank's text",
  descriptionHint: "Blank keeps the bank's text.",
  tagsLabel: "Tags",
  tagsHint: "Optional — tags never bring an entry back to this list.",
  markAsTransfer: "Mark as transfer",
  markAsTransferHint:
    "Transfers are just money moving between accounts — no type or company needed.",
  bulkApplyOne: "Also apply to {n} similar entry",
  bulkApplyOther: "Also apply to {n} similar entries",
  bulkApplyHint:
    "Matches the bank text of older entries and fills only the fields they're still missing.",
  skip: "Skip",
  back: "Back",
  forward: "Forward",
  amountLabel: "Amount",
  splitCta: "Split into parts…",
  splitIntro:
    "One bank transaction, several categories — give each part its own " +
    "amount, type, company and tags.",
  splitPart: "Part {n}",
  splitRemainingLabel: "Left to split",
  splitFinishHint: '"Next" gives the last part whatever is left.',
  splitAgain: "Split again",
  splitFinish: "Next",
  needsTypePrompt: "Pick a type to save.",
  needsCompanyPrompt: 'Pick a company — or "Omit company" — to save.',
  allCaught: "All caught up.",
  allCaughtHint:
    "Every imported entry on this account has a type or a custom description.",
} as const;

export type MetadataCatalog = Widen<typeof metadata>;

export default metadata;
