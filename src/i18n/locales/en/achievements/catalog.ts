import type { Widen } from "../_widen";

// Per-achievement strings. Order roughly tracks the tier hierarchy in
// `src/data/achievements/catalog.ts`, but it isn't load-bearing — the
// runtime reads each entry by id, not by position. New entries land
// here and in the matching sv/ catalog file; the catalog-shape parity
// test (`tests/i18n_catalog_test.ts`) catches drift.

const catalog = {
  firstSteps: {
    name: "First Steps",
    condition: "Add your first row.",
    learnMore:
      "Click the bottom row of the sheet, type a description, tab through to amount and date. That's a budget entry — the core loop.",
  },
  localHero: {
    name: "Local Hero",
    condition: "Use the app as a guest, or create an account.",
    learnMore:
      "Guest mode keeps your data in this browser only, unencrypted. An account adds a password that encrypts the data on this device — it never leaves your machine.",
  },
  label: {
    name: "Label It",
    condition: "Assign a type to a row.",
    learnMore:
      "The type chip groups rows for analysis. Browse by category — the starter set covers Swedish-flavoured basics.",
  },
  checkPlease: {
    name: "Check, Please",
    condition: "Tick a row's completed checkbox.",
    learnMore:
      "Unticked = forecast, ticked = real. The app uses this when reconciling against bank imports later.",
  },
  timeTraveller: {
    name: "Time Traveller",
    condition: "Discover the Today pill by scrolling away from this month.",
  },
  secondThoughts: {
    name: "Second Thoughts",
    condition: "Undo an action.",
    learnMore:
      "⌘Z walks back the last action. Every cell edit, every row delete, every settings change is reversible — undo is the safety net.",
  },
  houseKeeper: {
    name: "House Keeper",
    condition: "Hide a preset category or type you'll never use.",
    learnMore:
      "Hiding is safer than deleting until you know what you want. Anything hidden can be brought back from the same screen.",
  },
  preparedMind: {
    name: "Prepared Mind",
    condition: "Export your budget to a JSON file.",
    learnMore:
      "A snapshot you can drop back in later via Import. Do this once early so you know how.",
  },
  interiorDesigner: {
    name: "Interior Designer",
    condition: "Switch the theme to something other than the default.",
    learnMore:
      "Themes include One Dark, One Light, Dracula, GitHub Dark, and GitHub Light. The Custom-theme tokens in Expert tier stack on top.",
  },
  watchful: {
    name: "Watchful",
    condition: "Watch the balance build itself for the first time.",
    learnMore:
      "The Balance column is the running total of every row above it. You never type into it — it computes from the rows.",
  },
  trustButVerify: {
    name: "Trust, But Verify",
    condition: "Notice the save-state indicator confirming a save.",
  },
  homeScreen: {
    name: "Home Screen",
    condition: "Install Budget on your device.",
    learnMore:
      "On iPhone and iPad in Safari, share-sheet → Add to Home Screen. On Android and desktop Chromium, tap the Install button in the banner — or your browser's address-bar install hint. Once installed, Budget runs in its own window with no browser chrome.",
  },
  shortcut: {
    name: "Shortcut",
    condition: "Change what the header title does when tapped.",
  },
  bookKeeper: {
    name: "Book Keeper",
    condition: "Create your first real account.",
    learnMore:
      "Optionally attach bank details (clearing, account number, IBAN). The next tier — bank import — uses them to pair rows automatically.",
  },
  tieTheKnot: {
    name: "Tie the Knot",
    condition: "Link a sheet to an account.",
    learnMore:
      "Once linked, the sheet's running balance mirrors the real balance and bank imports land in the right place.",
  },
  payDay: {
    name: "Pay Day",
    condition: "Change Start of month from the default.",
    learnMore:
      "If salary lands on the 25th, set 25 — every month then runs 25th-to-24th instead of calendar-first.",
  },
  spreadOut: {
    name: "Spread Out",
    condition: "Add more than one sheet.",
    learnMore:
      "One sheet per account, one per goal. Tabs at the top switch between them.",
  },
  pinnedFavorite: {
    name: "Pinned",
    condition: "Favorite a sheet from its … menu.",
    learnMore:
      "Favorite up to five sheets and they pin to the bottom bar as quick-switch icons — one tap to jump between the sheets you use most.",
  },
  birdsEye: {
    name: "Bird's Eye",
    condition: "Visit the Accounts overview.",
  },
  tabShuffler: {
    name: "Tab Shuffler",
    condition: "Drag a sheet into a new position under Settings → General.",
    learnMore:
      "Reorder your sheets to put the one you reach for most first. The order you set drives the tab strip in the bottom bar.",
  },
  shuffler: {
    name: "Shuffler",
    condition: "Record an inter-account transaction.",
    learnMore:
      "One row, two effects: debits one account and credits the other on the same date. No need to type the two halves.",
  },
  quietMover: {
    name: "Quiet Mover",
    condition: "Flag a row as a transfer.",
    learnMore:
      "Combined with Hide transfers, internal moves still affect balances but disappear from the expense totals.",
  },
  groundhogDay: {
    name: "Groundhog Day",
    condition: "Make a row recurring.",
    learnMore:
      "Salary, rent, Spotify, gym. The preview shows the next ten occurrences before you save so you can sanity-check the pattern.",
  },
  earlyBird: {
    name: "Early Bird",
    condition:
      "Mark a recurring series as your primary income so an early-arriving paycheck still counts toward the next fiscal month.",
    learnMore:
      "When the 25th lands on a weekend or holiday and the bank pays out a few days early, the row (plus every transfer and expense dated the same day) shifts into the next fiscal month — so April doesn't accidentally absorb May's salary. Set the real payday once and the cascade applies retroactively to every occurrence in the series.",
  },
  showMeTheMoney: {
    name: "Show Me the Money",
    condition: "Add your first salary on the Salary sheet.",
    learnMore:
      "Find salaries scans a chosen account's full bank history — even years back, before you tagged anything — finds your recurring paycheck, establishes a baseline, and walks you through it year by year so you can accept, edit, or skip each month.",
  },
  taxEstimator: {
    name: "Tax Estimator",
    condition: "Create a tax profile on a salary sheet.",
    learnMore:
      "A tax profile (municipality, church membership, age, income type) lets the Salary sheet estimate each paycheck's gross from its net deposit using Swedish tax rules — so a salary you only know the net of still shows a gross and a tax. Type the exact gross any time to override the estimate.",
  },
  homeOwner: {
    name: "Home Owner",
    condition: "Add your first property on the Properties sheet.",
    learnMore:
      "The Properties sheet tracks the homes and apartments you own: what each cost, what it's worth now (update the value any time to add a point to its history), and the mortgages against it. Give a mortgage a lender and a bank account, then let Find mortgage payments pull its payments out of that account's history.",
  },
  secondDraft: {
    name: "Second Draft",
    condition: "Edit a recurring series.",
  },
  taxonomist: {
    name: "Taxonomist",
    condition: "Create your own category.",
    learnMore:
      "Categories group expenses for analysis. Give each a glyph and a color — the shared 16-hue palette is consistent across the app.",
  },
  labelMaker: {
    name: "Label Maker",
    condition: "Create your own entry type.",
    learnMore:
      "Types are the labels you assign to rows. Each has a glyph, color, and direction (+, −, ◆) so the picker stays clean.",
  },
  tagger: {
    name: "Tagged",
    condition: "Assign a tag to an entry.",
    learnMore:
      "Tags are your own colour-coded labels that cut across categories — a row can carry several. They never clutter the table; they only show while editing, and let you pull up everything tagged the same way from search. Manage them under Settings → Tags.",
  },
  companies: {
    name: "Storefront",
    condition: "Tag an entry with a company.",
    learnMore:
      "Companies are the merchants your money flows to — Fortum, H&M, the corner café. Pick one from the description popover or any edit modal and the row shows who it paid even when it carries no description of its own. Manage them under Settings → Companies.",
  },
  moverShaker: {
    name: "Mover & Shaker",
    condition: "Move or copy rows across months.",
  },
  splitTheBill: {
    name: "Split the Bill",
    condition: "Split a row into multiple parts.",
    learnMore:
      "When a single bank charge bundles different categories (groceries + household + gift), split so each part gets its own type.",
  },
  bulkOps: {
    name: "Bulk Ops",
    condition: "Bulk-edit two or more rows in one action.",
  },
  estimateRange: {
    name: "Give or Take",
    condition:
      "Add an entry with an estimate range instead of an exact amount.",
    learnMore:
      "Switch the amount from Exact to Estimate and set a low, a likely, and a high figure — handy for bills that wander month to month, like electricity. The estimate is what shows in the table and counts toward your balance, and any imported amount inside the range still matches the entry.",
  },
  reckoner: {
    name: "Reckoner",
    condition: "Record a balance correction.",
    learnMore:
      "When the running total drifts from what the bank shows, Set balance writes a single correction row dated today. Honest fix; don't rewrite old history.",
  },
  detective: {
    name: "Detective",
    condition: "Search across every sheet.",
  },
  numberWhisperer: {
    name: "Number Whisperer",
    condition: "Customise the number or currency format.",
  },
  rearranger: {
    name: "Rearranger",
    condition: "Reorder the columns in a sheet.",
  },
  polyglot: {
    name: "Polyglot",
    condition: "Switch the app language.",
  },
  tidyAndQuiet: {
    name: "Tidy & Quiet",
    condition: "Turn on Hide transfers.",
  },
  swiper: {
    name: "Swiper",
    condition: "Swipe left or right to switch sheets.",
  },
  searchSmith: {
    name: "Search Smith",
    condition: "Tune the search ranking settings.",
  },
  importExport: {
    name: "Import / Export",
    condition: "Import your first bank statement.",
    learnMore:
      "The app auto-detects Skandiabanken, Swedbank, Bank Norwegian, or ICA Banken. Drop the .xlsx or .csv from your bank and pick the account.",
  },
  dedupe: {
    name: "Dedupe",
    condition: "Re-import a statement; the importer skips the duplicates.",
  },
  loanRanger: {
    name: "Loan Ranger",
    condition: "Record a mortgage's payments with Find mortgage payments.",
    learnMore:
      "Tag a month of your mortgage charges with their lender and the Mortgage type, then open Find mortgage payments on the mortgage: it homes in on those tagged charges, learns their bank description, and pulls every matching month from the account's history — ranking the likeliest first and leaving a previous home's loan out by its different amount.",
  },
  mortgageFree: {
    name: "Mortgage Free",
    condition: "Pay a mortgage all the way off — its payoff bar hits 100%.",
    learnMore:
      "Each mortgage card carries a payoff bar showing how much of the original loan you've amortised away. Keep the loan amount and current balance up to date as you pay it down; when the balance reaches zero the bar fills green and reads 100% — the house is yours, free and clear.",
  },
  paymentLedger: {
    name: "Payment Ledger",
    condition: "Edit or remove a recorded mortgage payment from a property.",
  },
  firstRepair: {
    name: "Fixer-Upper",
    condition: "Add your first repair or renovation to a property.",
    learnMore:
      "Tag a bank charge with the Repairs or Renovations type, then open a property's wrench view and add it. Each repair links to its source transaction, and attaching the receipt keeps the cost ready for a future tax deduction — a repair with no receipt is flagged so you don't lose the paperwork.",
  },
  netSaleProfit: {
    name: "For Sale",
    condition: "Open the Net sale profit estimator on a property.",
    learnMore:
      "From a property's … menu, pick Net sale profit. Drag the sale-price slider and watch the breakdown: broker fee, advertising, repairs, the purchase price, and your location's capital-gains tax all come off before the bottom line. Try the broker modes — fixed, a percentage, or a base plus a percentage above a threshold — to match how your agent charges.",
  },
  archaeologist: {
    name: "Archaeologist",
    condition: "Override an imported history entry's description or type.",
    learnMore:
      "Open the history view, click a row, change its label. Useful when a noisy merchant has a useful name buried in the bank text.",
  },
  patternRecognition: {
    name: "Pattern Recognition",
    condition: "Write your first match rule.",
    learnMore:
      "*App Store* → type 'App'. Every past and future App Store charge labels itself. Rules can also filter by amount range or transfer flag.",
  },
  elephantsRemember: {
    name: "Elephants Remember",
    condition: "Promote a merchant — the type sticks for next time.",
  },
  matchmaker: {
    name: "Matchmaker",
    condition: "Reconcile a series — the rule sticks for next month.",
  },
  twoSidedCoin: {
    name: "Two-Sided Coin",
    condition: "Collapse a mirror pair into a single transfer.",
  },
  doppelganger: {
    name: "Doppelgänger",
    condition: "Merge a duplicate pair from the Find conflicts modal.",
    learnMore:
      "Sheet title ⋯ menu → Find conflicts. Scans the active budget for same-day, same-category, near-equal pairs and folds them into one row — the bank record wins when there is one, otherwise the row with the richer label keeps its place.",
  },
  cleanSplit: {
    name: "Clean Split",
    condition: "Split a bank-history entry across multiple types.",
  },
  cloudWalker: {
    name: "Cloud Walker",
    condition: "Connect a cloud backend (Dropbox, Google Drive, or Folder).",
    learnMore:
      "Browser-only data lives on this device. Connect a cloud and your budget rides with you across devices.",
  },
  paranoidMode: {
    name: "Paranoid Mode",
    condition: "Turn on end-to-end encryption.",
    learnMore:
      "AES-GCM, 256-bit key, 600 000 PBKDF2 iterations. The cloud sees ciphertext only.",
  },
  snapshotter: {
    name: "Snapshotter",
    condition: "Restore a cloud backup.",
  },
  airplaneMode: {
    name: "Airplane Mode",
    condition: "Edit offline; the app reconnects gracefully.",
  },
  rekindled: {
    name: "Rekindled",
    condition: "Re-authorize a cloud backend.",
  },
  lockUp: {
    name: "Lock Up",
    condition: "Change the idle sign-out timeout.",
  },
  spreadsheetSensei: {
    name: "Spreadsheet Sensei",
    condition: "Export a sheet to CSV or Excel.",
  },
  sealedEnvelope: {
    name: "Sealed Envelope",
    condition: "Export your budget as encrypted JSON.",
  },
  timeMachine: {
    name: "Time Machine",
    condition: "Jump to a point in the action history.",
  },
  freshPull: {
    name: "Fresh Pull",
    condition: "Pull down from the top of the page to refresh.",
    learnMore:
      "When you pull, Budget flushes any unsaved local edits to your cloud backend first, then reads the latest copy back — so updates from another device or another tab show up without a reload.",
  },
  receiptKeeper: {
    name: "Receipt Keeper",
    condition: "Attach a receipt to a purchase.",
    learnMore:
      "Open Line items on a purchase and attach a photo or PDF of the receipt — every item that purchase paid for shares it. It is saved as a file in a receipts folder on your storage, named from the pattern you pick in Settings → Items, so you can find it later. Available on the local-folder and cloud backends.",
  },
  payslipKeeper: {
    name: "Payslip Keeper",
    condition: "Attach a payslip to a salary.",
    learnMore:
      "Open a salary on the Salary sheet and attach a photo or PDF of the payslip (lönerapport). It is saved as a file in a payslips folder on your storage, named after the employer and pay month, so you can find it later. Available on the local-folder and cloud backends.",
  },
  spellbinder: {
    name: "Spellbinder",
    condition: "Write your first amount formula.",
    learnMore:
      "Type = and write an expression. salary * 0.05 saves 5% of income; min(rent, 12000) caps a transfer. The formula recomputes when inputs change.",
  },
  variablesUnleashed: {
    name: "Variables Unleashed",
    condition: "Insert a variable pill from the formula helper.",
  },
  crossWired: {
    name: "Cross-Wired",
    condition: "Reference another sheet inside a formula.",
  },
  compoundInterest: {
    name: "Compound Interest",
    condition: "Build a compound entry with multiple parts.",
  },
  calendarBender: {
    name: "Calendar Bender",
    condition: "Use last-day-of-month or a custom recurrence interval.",
  },
  dateShifter: {
    name: "Date Shifter",
    condition: "Nudge a recurring series with the Shift days by input.",
  },
  fineSieve: {
    name: "Fine Sieve",
    condition: "Write a match rule with amount or transfer filters.",
  },
  themeWizard: {
    name: "Theme Wizard",
    condition: "Switch to the Custom theme.",
  },
  fontFanatic: {
    name: "Font Fanatic",
    condition: "Swap the font family.",
  },
  stillness: {
    name: "Stillness",
    condition: "Turn on Reduce motion.",
  },
  household: {
    name: "Household",
    condition: "Add another user account on this device.",
  },
  shapeShifter: {
    name: "Shape Shifter",
    condition: "Switch storage backends.",
  },
  underTheHood: {
    name: "Under the Hood",
    condition: "Turn on Developer mode.",
  },
  itemized: {
    name: "Itemized",
    condition: "Tie part of a purchase to an item you own.",
    learnMore:
      "Open a row's “…” menu and pick Line items to link part of its amount to something you own — 15 000 of a 20 000 purchase was the phone, the rest is just remainder. Build up a catalog of items (and optionally classify each with a subtype), the groundwork for tracking what you own and what it's worth over time.",
  },
  completionist: {
    name: "Completionist",
    condition: "Unlock every other achievement.",
    learnMore:
      "The hardest one to earn — your trophy room is full when this one lights up.",
  },
} as const;

export type AchievementsCatalogEntries = Widen<typeof catalog>;

export default catalog;
