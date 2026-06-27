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
  bookworm: {
    name: "Bookworm",
    condition: 'Open a feature doc from a "Learn more" link in What\'s new.',
    learnMore:
      'Big features get a "Learn more" link in the changelog that opens the full write-up right inside the What\'s new window. A back arrow returns you to the list.',
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
  borrower: {
    name: "Borrower",
    condition: "Add your first loan on the Loans sheet.",
    learnMore:
      "The Loans sheet tracks the money you owe — student loans, car loans, mortgages, money borrowed from a person — with a start date, start sum, monthly payment, and optional rate and setup fee. With a rate set, the remaining balance is simulated month by month. A mortgage can instead link a mortgage from the Properties sheet, so its terms and payments stay in one place.",
  },
  investor: {
    name: "Investor",
    condition: "Add your first investment on the Investment sheet.",
    learnMore:
      "The Investment sheet has two tables. Holdings are funds, shares, gold, or crypto with a value you update by hand; the account type (ISK, KF, or depå) decides the tax when sold. Private stocks track buy/sell trades, the share count, the average cost, and a current price, owned either privately or by your company — which changes the net value because the gain is taxed differently.",
  },
  bigPicture: {
    name: "Big Picture",
    condition: "Add an Insights sheet.",
    learnMore:
      "The Insights sheet reads everything you track — accounts, savings, items, properties, loans — and rolls it into your net worth, with a breakdown and a chart over time. Its settings let you exclude things and set an ownership share for anything co-owned, like a house split with a spouse.",
  },
  whatIf: {
    name: "What If",
    condition: "Create your first scenario on a Scenarios sheet.",
    learnMore:
      "A Scenarios sheet plays what-if futures against a budget you already track — lose a job, buy a car — without ever changing the real budget. Change values, drop expenses, or add rows in a scenario, watch every variant's monthly end balance on one chart, and add monitor dates to see how much money is left on a day that matters.",
  },
  recurringDreams: {
    name: "Recurring Dreams",
    condition: "Add a recurring row to a scenario.",
    learnMore:
      "When you add a row to a scenario, the date field is a full recurrence picker — a gym membership every month, a benefit every 30 days, an annual fee. The whole series lands in the scenario at once, and deleting one occurrence offers to take the rest of the series with it.",
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
  notMyTaste: {
    name: "Not My Taste",
    condition: "Ignore an entry for statistics.",
    learnMore:
      "Paid for someone else? Flag the entry as ignored: it stays in the ledger and your running balance, but it won't skew the spending charts — like baby songs that shouldn't shape your taste profile.",
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
  manualPayslip: {
    name: "Off the Books",
    condition: "Add a payslip manually, with no bank transaction behind it.",
    learnMore:
      "Bank history only stretches back so far, but your salary record doesn't have to stop there. Use Add payslip on the Salary sheet to record a paycheck from scratch — pick the pay month, type the net (and gross, if you have it), and it joins the per-year tables alongside the ones Find salaries discovered.",
  },
  taxEstimator: {
    name: "Tax Estimator",
    condition: "Create a tax profile on a salary sheet.",
    learnMore:
      "A tax profile (municipality, church membership, age, income type) lets the Salary sheet estimate each paycheck's gross from its net deposit using Swedish tax rules — so a salary you only know the net of still shows a gross and a tax. Type the exact gross any time to override the estimate.",
  },
  saver: {
    name: "Saver",
    condition: "Add your first savings account on the Savings sheet.",
    learnMore:
      "The Savings sheet tracks money you set aside — a buffer, a vacation fund — in savings accounts. Unlike a regular account, you record its balance with a date (update it any time to add a point to its history), so the listing always shows what you have set aside. Savings accounts also take part in transfer detection, so a transfer from your everyday account into savings gets matched automatically.",
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
  coverYourTracks: {
    name: "Cover Your Tracks",
    condition: "Create a cover transfer to reimburse expenses.",
    learnMore:
      "When you pay for something from the wrong account, a cover transfer reimburses it from the right one — totalling the expenses, generating a bank reference message, and linking back to exactly what it covered.",
  },
  splitTheBill: {
    name: "Split the Bill",
    condition: "Split a row into multiple parts.",
    learnMore:
      "When a single bank charge bundles different categories (groceries + household + gift), split so each part gets its own type.",
  },
  quickMaths: {
    name: "Quick Maths",
    condition: "Use the calculator button to work out a split amount.",
    learnMore:
      "Tap the calculator next to a split's amount and type a sum like 100 + 30 + 50 — the result drops straight into the field. Handy when a credit-card bill lumps several charges from the same shop together and you just want them added up.",
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
  copycat: {
    name: "Copycat",
    condition: "Copy an entry's details from its info view.",
    learnMore:
      "Tap the info button on any row (left of the edit pencil, or in the “…” menu) to open a read-only view of every field. Each value has a copy glyph, and “Copy all details” lifts the whole entry — description, amount, type, and more — onto your clipboard.",
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
  debtCollector: {
    name: "Debt Collector",
    condition: "Import bank transactions as payments on a loan.",
    learnMore:
      "Mark bank transactions with the loan's type (Student loan, Car loan, Private loan, …) and they show up in Import payments on the loan's row menu. Importing also remembers the bank description, so the next statement you import attaches matching charges to the loan automatically — no modal, no clicks.",
  },
  loanRanger: {
    name: "Loan Ranger",
    condition: "Record a mortgage's payments with Find mortgage payments.",
    learnMore:
      "Tag a month of your mortgage charges with their lender and the Mortgage type, then open Find mortgage payments on the mortgage: it homes in on those tagged charges, learns their bank description, and pulls every matching month from the account's history — ranking the likeliest first and leaving a previous home's loan out by its different amount.",
  },
  amortisationStep: {
    name: "Step Down",
    condition: "Record an amortisation-plan change on a mortgage.",
    learnMore:
      "Banks step a loan's amortisation requirement down over time as the loan-to-value ratio falls (3% → 2% → 1%). Open a mortgage's editor and add an amortisation change with the date it took effect, just like an interest-rate change — each payment then splits against the plan that was in effect that month, so the amortisation leg steps cleanly while the small month-to-month difference stays on interest.",
  },
  mortgageFree: {
    name: "Mortgage Free",
    condition: "Pay a mortgage all the way off — its payoff bar hits 100%.",
    learnMore:
      "Each mortgage card carries a payoff bar showing how much of the original loan you've amortised away. Keep the loan amount and current balance up to date as you pay it down; when the balance reaches zero the bar fills green and reads 100% — the house is yours, free and clear.",
  },
  unifiedMortgage: {
    name: "Big Picture",
    condition: "Switch a property's mortgages into the unified summary view.",
    learnMore:
      "A property with several loans is hard to read row by row. Use the view toggle beside the mortgage section's … menu to pick Unified view: every mortgage collapses into one card showing the combined balance and loan, the balance-weighted effective rate, and the total monthly interest and amortisation. Tap the other glyph to switch back to Split view and edit an individual loan.",
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
  groupedRepair: {
    name: "Itemized",
    condition: "Group more than one transaction under a single repair.",
    learnMore:
      "One invoice is often paid across several bank charges — a deposit and a balance, staged payments to a contractor. In a property's wrench view, add or edit a repair and tick every transaction that paid the same invoice: the amounts add up into one repair, and a single receipt on the primary transaction covers them all.",
  },
  manualRepair: {
    name: "Paper Trail",
    condition:
      "Record a repair or renovation with no bank transaction behind it.",
    learnMore:
      "Some improvements predate your imported bank history — but they still count toward a property's deductible-cost record. In a property's wrench view, choose Add manually and enter the work directly: type (Repairs or Renovations), date, amount, description, contractor, and tags. Attach the receipt and the cost is ready for a future capital-gains calculation, just like a transaction-backed one.",
  },
  netSaleProfit: {
    name: "For Sale",
    condition: "Open the Net sale profit estimator on a property.",
    learnMore:
      "From a property's … menu, pick Net sale profit. Drag the sale-price slider and watch the breakdown: broker fee, advertising, repairs, the purchase price, and your location's capital-gains tax all come off before the bottom line. Try the broker modes — fixed, a percentage, or a base plus a percentage above a threshold — to match how your agent charges.",
  },
  propertySold: {
    name: "Moving On",
    condition: "Record the sale date on a property you no longer own.",
    learnMore:
      "Edit a property and set its sale date — and what it sold for. The home stays on the Properties page as history: its recorded values, repairs, and mortgage payments still belong to it, so old bank charges keep attributing to the right home. But from the day of the sale it stops counting toward your net worth, and Find mortgage payments stops offering charges after that date.",
  },
  valueChart: {
    name: "Trend Spotter",
    condition: "Visualize a property's value over time.",
    learnMore:
      "From a property's … menu, pick Visualize value to chart its recorded values over time — the app's first visualization. Toggle Include repairs to fold the money you've put in onto the line, and Show net value to overlay what you'd actually take home after broker, advertising, repairs, purchase price, and capital-gains tax. The chart follows your theme: colours, font, corners, and spacing all match.",
  },
  associationLoan: {
    name: "Hidden Debt",
    condition: "Record a property's share of a housing association's loan.",
    learnMore:
      "A bostadsrätt's monthly fee often hides a big indirect debt: the housing association's own loans, which you own a slice of through your apartment. In the property editor, enter the loan per square metre and the association's interest rate — both usually found in the årsredovisning. The Visualize-value chart then lets you subtract that hidden interest, so a high-fee flat no longer looks like pure gain.",
  },
  savingsValueChart: {
    name: "Nest Egg",
    condition: "Visualize your savings over time.",
    learnMore:
      "From the Savings sheet's … menu, pick Visualize value to chart how much you've set aside over time. Tick the accounts you want to include — all of them by default — and the line shows their combined balance at each recorded date, climbing as accounts come online and as each is topped up. The chart follows your theme: colours, font, corners, and spacing all match.",
  },
  investmentValueChart: {
    name: "Portfolio Pulse",
    condition: "Visualize your investments over time.",
    learnMore:
      "From the Investment sheet's … menu, pick Visualize value to chart the combined worth of every holding and stock over time. Use the range buttons below the graph to zoom the window, and toggle Show net value to see what the portfolio is worth after tax if you sold today. The chart follows your theme: colours, font, corners, and spacing all match.",
  },
  loansChart: {
    name: "Debt Mapper",
    condition: "Visualize your loans over time.",
    learnMore:
      "From the Loans sheet's … menu, pick Visualize loans to chart your debt as stacked bands — one per loan, with the top of the stack as the total. Switch to Payments for month-by-month bars of what you paid, and break the estimated interest out into its own segment to see how much of each month's payment went to the bank rather than the debt. Tick student loans and mortgages in or out of the stack. The chart follows your theme: colours, font, corners, and spacing all match.",
  },
  spendingDetective: {
    name: "Spending Detective",
    condition: "Visualize how you spend your money.",
    learnMore:
      "From a budget sheet's … menu, pick Visualize spending to see where the money actually went: monthly bars stacked per category, a donut you can click to drill into the types inside a category, income against expenses month by month, and the merchants you spend the most at. Only completed entries and imported bank history count, so the picture shows real spending — not plans. Use the 3M / 6M / 12M / All row to widen the window. The charts follow your theme: colours, font, corners, and spacing all match.",
  },
  archaeologist: {
    name: "Archaeologist",
    condition: "Override an imported history entry's description or type.",
    learnMore:
      "Open the history view, click a row, change its label. Useful when a noisy merchant has a useful name buried in the bank text.",
  },
  caseClosed: {
    name: "Case Closed",
    condition:
      "Finish an imported transaction: give it a type and either a company or 'omit company'.",
    learnMore:
      "A finished transaction turns green with a check in its Done column, so you can scan a statement for what still needs work. The Done column is the real confirm signal — it greens only once an imported row is fully categorised.",
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
  receiptArchivist: {
    name: "Receipt Archivist",
    condition: "Attach two receipts to one repair.",
    learnMore:
      "A big job is often paid across several invoices — a deposit at the start, a balance at the end, staged payments over a year. Open Manage receipts on a repair and attach each one, with its own date (it defaults to the repair's date). They're filed as a dated log in the property's receipts folder. Available on the local-folder and cloud backends.",
  },
  payslipKeeper: {
    name: "Payslip Keeper",
    condition: "Attach a payslip to a salary.",
    learnMore:
      "Open a salary on the Salary sheet and attach a photo or PDF of the payslip (lönerapport). It is saved as a file in a payslips folder on your storage, named after the employer and pay month, so you can find it later. Available on the local-folder and cloud backends.",
  },
  propertyFiler: {
    name: "Property Filer",
    condition: "Upload a file to a property.",
    learnMore:
      "Open Upload file on a property and attach a photo or PDF — a before/after picture, an inspection report, an insurance document. Give it a description, tags, and a category (which becomes a subfolder). Files are saved under a per-property properties folder on your storage. Available on the local-folder and cloud backends.",
  },
  propertyHandover: {
    name: "Clean Handover",
    condition: "Export or import a property.",
    learnMore:
      "Selling a home? Open a property's … menu and choose Export to bundle everything about it — details, repairs, receipts, and uploaded documents — into a single ZIP you can hand to the new owner. Mark sensitive files private to keep them out, and toggle whether receipts and your mortgage details come along. The new owner opens Import on their own Properties sheet to bring it all in as a fresh property.",
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
  tidyMind: {
    name: "Tidy Mind",
    condition: "Collapse a tall settings section by tapping its title.",
    learnMore:
      "Any settings section taller than half the screen — the Categories and types list is the obvious one — turns its title into a fold toggle. Tap it to tuck the whole section away into a slim bar so the sections below come into reach without endless scrolling; tap again to unfold it.",
  },
  itemized: {
    name: "Itemized",
    condition: "Tie part of a purchase to an item you own.",
    learnMore:
      "Open a row's “…” menu and pick Line items to link part of its amount to something you own — 15 000 of a 20 000 purchase was the phone, the rest is just remainder. Build up a catalog of items (and optionally classify each with a subtype), the groundwork for tracking what you own and what it's worth over time.",
  },
  appreciated: {
    name: "Appreciated",
    condition: "Record a value for an item you own.",
    learnMore:
      "Open an item's “…” menu on the Items sheet and pick Update value to log what it's worth today. Some things gain value — art, collectibles, antiques — so record a snapshot now and then; each one shows up on the net-worth graph, letting an appreciating item climb instead of sitting flat at what you paid.",
  },
  bulkImporter: {
    name: "Bulk Importer",
    condition: "Import a batch of dated values from a CSV or Excel file.",
    learnMore:
      "Any “Update value / balance” modal — items, property, savings, loans, holdings, stock prices — has an Import from file button. Drop in a CSV or Excel export, click the column holding the dates and the one holding the values, and every row lands as a dated point in one go. The modal previews exactly which dates and values it read (and flags rows it couldn't), so a few years of history take seconds instead of one snapshot at a time.",
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
