import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  Archive,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRightLeft,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  Brain,
  Calculator,
  Calendar,
  CalendarClock,
  CalendarCog,
  Check,
  ChevronDown,
  Cloud,
  Code2,
  Columns3,
  Compass,
  CopyCheck,
  Download,
  Eye,
  EyeOff,
  FileLock2,
  FileSpreadsheet,
  FileUp,
  Filter,
  FolderTree,
  FunctionSquare,
  GitMerge,
  Hash,
  History,
  LayoutDashboard,
  LayoutGrid,
  Link as LinkIcon,
  ListChecks,
  Lock,
  LockKeyhole,
  Menu,
  Merge,
  Move,
  Network,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Save,
  Scale,
  Search,
  Sigma,
  Split,
  Sprout,
  Tag,
  Trash2,
  Type as TypeIcon,
  Undo2,
  UserPlus,
  Users,
  Wallet,
  Wand2,
  WifiOff,
  Workflow,
} from "lucide-react";

// Last meaningful change to the guide below. Bump this whenever the
// prose is edited — the value renders verbatim at the top of the
// page and is the only line readers have to look at to see how fresh
// the guide is.
const LAST_UPDATED = "2026-05-22";

export function SystemPage() {
  return (
    <div className="min-h-dvh bg-page-bg px-4 py-10 text-fg">
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-8 text-sm leading-relaxed">
        <header className="flex flex-col gap-3">
          <a
            href={import.meta.env.BASE_URL}
            className="inline-flex items-center gap-1.5 self-start text-xs text-link hover:underline"
          >
            <ArrowLeft size={14} aria-hidden focusable={false} />
            Back to budget
          </a>
          <h1 className="text-lg font-bold text-fg-bright">
            How to use Budget
          </h1>
          <p className="text-xs text-muted">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="flex flex-col gap-2">
          <p>
            A short guide to every feature in the app, ordered as you would bump
            into them. Skim the summary on each item; click <em>Learn more</em>{" "}
            to expand the full explanation when you want it. Four tiers, from{" "}
            <em>just opened the app</em> to{" "}
            <em>bending it to your situation</em>. Skip to whichever tier
            matches you.
          </p>
        </section>

        <Tier
          icon={Sprout}
          title="Beginner"
          subtitle="You just opened the app. What do you do?"
        >
          <Feature
            icon={UserPlus}
            title="Use it as a guest, or sign up"
            summary="Type immediately as a guest, or create an account when you want a password on it."
          >
            Guest mode keeps your data in this browser only, unencrypted. If you
            create an account from the sign-in screen, your password encrypts
            the data on this device — it never leaves your machine. You can
            promote your guest budget into an account later, no data loss.
          </Feature>

          <Feature
            icon={Plus}
            title="Add your first row"
            summary="Click the bottom row, type a description, tab through to amount and date."
          >
            That's the whole core loop: a row is a budget entry. The Date,
            Description, and Amount columns are the only ones you ever fill in
            by hand. Everything else is computed or optional.
          </Feature>

          <Feature
            icon={Calculator}
            title="Watch the balance build itself"
            summary='The "Balance" column is the running total of every row above it. You never type into it.'
          >
            If the running total ever drifts from what your bank shows, that's a
            real-world signal — keep reading until you reach Intermediate →{" "}
            <em>Correct a drifted balance</em>.
          </Feature>

          <Feature
            icon={Check}
            title="Tick a row when it posts at the bank"
            summary="The leftmost checkbox marks a row as completed. Unticked = forecast, ticked = real."
          >
            Use this to track what has actually happened versus what you've only
            planned. The app uses this distinction when reconciling against bank
            imports later on.
          </Feature>

          <Feature
            icon={Calendar}
            title="Find your way back to today"
            summary="A floating Today pill appears in the bottom bar when you scroll away from the current month."
          >
            Months also collapse and expand from their header, so you can hide
            history you don't need to see. The current month is the one the
            Today pill scrolls you to.
          </Feature>

          <Feature
            icon={Tag}
            title="Label the row with a type"
            summary="Click the type chip next to the description to open the type picker. Drill in one category at a time."
          >
            The starter set covers Swedish-flavoured basics — Rent, Groceries,
            Salary, Spotify. Browsing by category instead of one wall of buttons
            keeps the picker calm even after you've added your own types.
          </Feature>

          <Feature
            icon={EyeOff}
            title="Hide presets you'll never use"
            summary="Settings → Categories lets you hide entries from the picker without deleting them."
          >
            Hiding is safer than deleting until you know what you want. Anything
            hidden can be brought back from the same screen.
          </Feature>

          <Feature
            icon={Undo2}
            title="Make a mistake — undo it"
            summary="⌘Z (or the undo button in the bottom bar) walks back the last action; ⌘⇧Z replays it."
          >
            Every action — every cell edit, every row delete, every settings
            change — is reversible. There is no "are you sure" modal blocking
            your way; undo is the safety net.
          </Feature>

          <Feature
            icon={Save}
            title="Trust that it's saving"
            summary="The save-state indicator in the bottom bar shows syncing → synced on every edit."
          >
            If it ever says <em>failed</em>, click it for details. In
            browser-only mode it basically never fails — failures show up once
            you've connected a cloud backend at the Pro tier.
          </Feature>

          <Feature
            icon={Download}
            title="Save a copy somewhere safe"
            summary="Settings → Import / Export → Download as JSON writes your whole budget to a file."
          >
            Do this once early so you know how. The file is a normal JSON
            document — drop it back in later via Import to restore. Once you
            reach Pro, you can also export an encrypted version.
          </Feature>

          <Feature
            icon={Palette}
            title="Make the app feel like yours"
            summary="Settings → Appearance picks a theme; Settings → General switches language (English / Swedish)."
          >
            Themes include One Dark, One Light, Dracula, GitHub Dark, and GitHub
            Light. Everything you do in Expert tier with Custom theme tokens
            stacks on top of these.
          </Feature>

          <Feature
            icon={Menu}
            title="Peek at the burger menu"
            summary="Top-right hides the changelog, this guide, the privacy page, and sign-out."
          >
            The burger menu is the home for everything you don't reach for every
            day — release notes, account switching, privacy policy.
          </Feature>

          <Graduation>
            Rows go in, they're labelled, you trust they're saved, and you can
            find your way around without thinking.
          </Graduation>
        </Tier>

        <Tier
          icon={Compass}
          title="Intermediate"
          subtitle="You want this to reflect your real finances."
        >
          <Feature
            icon={Wallet}
            title="Create a real account"
            summary="Settings → Accounts → New. Give it an opening balance, color, and optionally bank details."
          >
            Bank details (clearing, account number, IBAN) aren't required, but
            they make the next tier — bank import — much smarter. Reconciliation
            uses them to pair imported rows with the right account
            automatically.
          </Feature>

          <Feature
            icon={LinkIcon}
            title="Link the sheet to that account"
            summary="Long-press a sheet tab (or use its edit button) and bind it to the account."
          >
            Once a sheet is bound to an account, its running balance mirrors the
            real balance, and bank imports for that account land in the right
            place.
          </Feature>

          <Feature
            icon={CalendarClock}
            title="Tell the app when you get paid"
            summary="Settings → General → Start of month. If salary lands on the 25th, set 25."
          >
            Each month in the table then runs 25th-to-24th instead of
            calendar-first. The app can also auto-detect this from your salary
            entries once you have a few — look for the suggestion in Settings.
          </Feature>

          <Feature
            icon={LayoutDashboard}
            title="Add more sheets"
            summary="One per account, one per goal (travel fund, child savings, tax buffer)."
          >
            Tabs at the top switch between them. Each carries its own running
            balance. Drag tabs to reorder; the active sheet is remembered across
            reloads.
          </Feature>

          <Feature
            icon={LayoutGrid}
            title="Use the Accounts overview"
            summary="A special dashboard sheet lists every account's balance side-by-side."
          >
            It's the right place to start each session: glance at the whole
            picture, then drill into the sheet that needs attention.
          </Feature>

          <Feature
            icon={ArrowRightLeft}
            title="Move money between your own accounts"
            summary="The Transaction modal records an inter-account move as a single row."
          >
            One row, two effects: it debits one account and credits the other on
            the same date. No need to type the two halves manually.
          </Feature>

          <Feature
            icon={Eye}
            title="Hide transfer noise"
            summary="Settings → General → Hide transfers. Transfer rows still affect balances but disappear from the table."
          >
            With this on, a month's total expenses no longer includes the money
            you shuffled between your own accounts — only real spending shows
            up.
          </Feature>

          <Feature
            icon={Repeat}
            title="Make recurring entries"
            summary="Salary, rent, Spotify, gym. Edit a row → Make recurring → pick the cadence."
          >
            Monthly, weekly, biweekly, quarterly, or yearly. The preview shows
            the next ten occurrences so you can sanity-check the pattern before
            saving.
          </Feature>

          <Feature
            icon={Pencil}
            title="Edit a recurring series later"
            summary="Open any occurrence, change it, then pick: this row only, this-and-future, or stop the series."
          >
            You decide whether history gets rewritten. Rent went up? Apply
            forward only. Wrong description from the start? Apply to all.
          </Feature>

          <Feature
            icon={FolderTree}
            title="Customise your categories"
            summary="Settings → Categories → New. Give each a glyph and a color, then add the types you actually use."
          >
            The shared 16-hue palette is consistent across sheets, accounts,
            categories, and types. Build the taxonomy that matches how you
            actually think about your money — your gym, your phone plan, your
            specific grocery store.
          </Feature>

          <Feature
            icon={ArrowUpDown}
            title="Restrict a type to income or expense"
            summary="Each type has a direction: + (income), − (expense), or ◆ (both)."
          >
            Income types don't clutter the picker when you're entering an
            expense, and vice versa. Set the direction when you create the type
            — it's a one-click switch on the type editor.
          </Feature>

          <Feature
            icon={ListChecks}
            title="Bulk-edit a month"
            summary="Select multiple rows (click-drag or tap-to-select on mobile), then Bulk edit changes all of them at once."
          >
            The fastest way to clean up a backlog: relabel a month of coffee
            purchases, shift a series of dates, or reassign types after you've
            reshaped your category tree.
          </Feature>

          <Feature
            icon={Move}
            title="Move or copy across months"
            summary="Move preserves day-of-month into another month. Copy duplicates the pattern into many future months at once."
          >
            Useful for propagating a monthly pattern forward, or for fixing a
            row that was dated incorrectly without rebuilding it.
          </Feature>

          <Feature
            icon={Split}
            title="Split a charge"
            summary="One bank transaction covers multiple categories? Open the row, Split, give each part its own type."
          >
            The remainder stays on the original row. Useful when a single
            supermarket trip covered groceries, household supplies, and a
            birthday gift you want booked to different types.
          </Feature>

          <Feature
            icon={Scale}
            title="Correct a drifted balance"
            summary="Open the account and click Set balance. A single correction row dated today fixes the gap."
          >
            Don't rewrite old history to make the numbers match — a correction
            row is the honest fix. Cash withdrawals, forgotten entries, or
            rounding errors all get reconciled this way.
          </Feature>

          <Feature
            icon={Search}
            title="Search across everything"
            summary="The search button in the bottom bar searches every sheet at once."
          >
            Search by description, type, category, or amount. Click a result to
            jump straight to it — no scrolling through years of months.
          </Feature>

          <Feature
            icon={Eye}
            title="Audit a sheet read-only"
            summary="The sheet-viewer modal opens any sheet in a search-friendly read-only view spanning every month."
          >
            Useful when you want to look without risking an accidental edit —
            for example reviewing a previous year for tax purposes.
          </Feature>

          <Feature
            icon={Hash}
            title="Tune the number formatting"
            summary="Settings → Numbers picks decimal separator, thousands separator, currency token, and abbreviation."
          >
            Large numbers can abbreviate (1.2M vs. 1,200,000), with a separate
            setting for the balance column if you want it always-abbreviated
            even when the rest stays in full.
          </Feature>

          <Feature
            icon={Columns3}
            title="Customize columns"
            summary="Drag column headers to reorder. The column picker adds or removes columns from the table."
          >
            The table should show what you actually look at. Hide the type
            column if you only label some rows; hide the balance if you only
            care about the per-month total.
          </Feature>

          <Graduation>
            Every sheet maps to a real account, recurring entries cover your
            fixed costs, and your categories match how you actually think about
            spending.
          </Graduation>
        </Tier>

        <Tier
          icon={Workflow}
          title="Pro"
          subtitle="Stop typing things the bank already knows."
        >
          <Feature
            icon={FileUp}
            title="Import your first bank statement"
            summary="Settings → Import history → drop an .xlsx or .csv export from your bank."
          >
            The app auto-detects which bank (Skandiabanken, Swedbank, Bank
            Norwegian, ICA Banken) and parses accordingly. Pick which account
            the statements belong to and the importer handles the rest.
          </Feature>

          <Feature
            icon={CopyCheck}
            title="Trust the dedupe"
            summary="Importing the same file twice doesn't duplicate rows — duplicates are recognised by content."
          >
            The preview tells you how many rows are new and how many are skipped
            before you commit. Re-importing a longer statement to catch the
            latest transactions is safe.
          </Feature>

          <Feature
            icon={History}
            title="Open the history view"
            summary="Browse every imported transaction for an account, search inside it, and relabel anything."
          >
            This is where the patterns become obvious — you see months of
            "Spotify" or "App Store" or "ICA" in a list, ready to be promoted
            into rules and recurring series.
          </Feature>

          <Feature
            icon={Repeat}
            title="Promote recurring candidates"
            summary="The app surfaces transactions that look periodic with confidence % and suggested cadence."
          >
            One click turns "Spotify every month" into a forecasted recurring
            entry, and labels every past Spotify charge retroactively. The
            cheapest way to find subscriptions you forgot you had.
          </Feature>

          <Feature
            icon={GitMerge}
            title="Reconcile predictions against actuals"
            summary="After import, pair your forecasted rows with matching bank entries; accept, adjust dates, or delete orphans."
          >
            Choose <em>Apply to series</em> and the app learns the rule for next
            month — Spotify will pair itself automatically from then on.
          </Feature>

          <Feature
            icon={Wand2}
            title="Write a pattern rule"
            summary='Match-rule modal: *App Store* → type "App", category "Entertainment". Every past and future App Store charge labels itself.'
          >
            Rules can also filter by amount range or by transfer flag, so a rule
            fires only when you mean it to. This is the single biggest
            time-saver in the app once you have a few months of import history.
          </Feature>

          <Feature
            icon={Brain}
            title="Let merchant memory do the rest"
            summary="The app remembers which type you assigned to each cleaned-up merchant name."
          >
            Next time the same merchant appears — whether you type it or import
            it — the type is suggested automatically. No rule needed.
          </Feature>

          <Feature
            icon={Merge}
            title="Collapse transfer pairs"
            summary="The transfer-collapse tool detects mirror rows (debit one account, credit another) and merges them."
          >
            When you transfer between your own accounts, the bank exports two
            rows. Collapse them into a single transfer row across accounts so
            the transfer doesn't double-count.
          </Feature>

          <Feature
            icon={History}
            title="Dig into action history"
            summary="Beyond ⌘Z: the action-history modal lists every action with timestamps and lets you jump back."
          >
            "I broke something five edits ago" becomes recoverable without
            leaving the app. Jump to a past state, inspect it, and re-apply
            actions forward from there.
          </Feature>

          <Feature
            icon={Cloud}
            title="Move off browser-only storage"
            summary="Settings → Storage picks Folder, Dropbox, or Google Drive — with a version preview when you switch."
          >
            <strong className="text-fg-bright">Folder</strong> writes a file to
            a folder you choose (point it at your Dropbox / iCloud / OneDrive
            folder and let the OS sync).{" "}
            <strong className="text-fg-bright">Dropbox</strong> and{" "}
            <strong className="text-fg-bright">Google Drive</strong> connect via
            OAuth with auto-refreshing tokens. The version preview shows exactly
            which copy stays where before you commit.
          </Feature>

          <Feature
            icon={Lock}
            title="Turn on end-to-end encryption"
            summary="Settings → Storage → Encrypt. Data is encrypted with your password before it leaves the browser."
          >
            AES-GCM, 256-bit key, 600 000 PBKDF2 iterations. The cloud provider
            sees ciphertext only — even if Dropbox is compromised, your budget
            stays private.
          </Feature>

          <Feature
            icon={Archive}
            title="Take cloud backups"
            summary="With a cloud backend connected, timestamped snapshots are kept automatically."
          >
            Restore any one from the cloud-backup modal. Useful when you've made
            a sweeping bulk-edit you want to undo, or simply for peace of mind.
          </Feature>

          <Feature
            icon={WifiOff}
            title="Edit offline"
            summary="If the cloud is unreachable, you keep editing against a local mirror; the app pushes when you reconnect."
          >
            If the cloud changed while you were offline, you're asked which copy
            to keep — no silent merging. Edit on a plane, sync when you land.
          </Feature>

          <Feature
            icon={RefreshCw}
            title="Re-authorize when tokens expire"
            summary="Dropbox / Drive tokens occasionally need a refresh nudge — the reconnect modal handles it in one click."
          >
            You won't lose data; syncing pauses until you reconnect, then
            resumes from where it left off.
          </Feature>

          <Feature
            icon={LockKeyhole}
            title="Set an idle sign-out"
            summary="Settings → Session picks an inactivity timeout (1–60 minutes) with a 60-second warning."
          >
            After timeout, your password drops from memory and the
            cloud-decrypted state is cleared. Essential for shared devices.
          </Feature>

          <Feature
            icon={FileSpreadsheet}
            title="Export to CSV or Excel"
            summary="The Download modal exports a sheet, with toggles for history, future, and transactions."
          >
            Hand the file to your accountant, or pivot it in a spreadsheet for
            analysis the app doesn't do natively.
          </Feature>

          <Feature
            icon={FileLock2}
            title="Export encrypted JSON"
            summary="Same envelope as cloud storage. Restore-anywhere safe — email it to yourself, drop it on a USB stick."
          >
            Decryption needs your account password. A great way to keep a
            personal off-site backup that nobody but you can read.
          </Feature>

          <Graduation>
            New bank exports import in seconds and label themselves, your data
            is encrypted on a cloud you control, and you've stopped keeping a
            separate manual copy on the side.
          </Graduation>
        </Tier>

        <Tier
          icon={Wand2}
          title="Expert"
          subtitle="Bend the app to your exact situation."
        >
          <Feature
            icon={Sigma}
            title="Write amount formulas"
            summary="Edit a row's amount, type =, and write a real expression."
          >
            <code className="text-meta">salary * 0.05</code> saves 5% of income;{" "}
            <code className="text-meta">min(rent, 12000)</code> caps a transfer;{" "}
            <code className="text-meta">previousSheetMonthTotal * 0.9</code>{" "}
            budgets 10% less than last month. The formula recomputes every time
            its inputs change.
          </Feature>

          <Feature
            icon={FunctionSquare}
            title="Pick variables from the helper"
            summary="Typing = opens a dropdown of every variable in scope. Each one inserts as a removable color-coded pill."
          >
            No typos. Variables include{" "}
            <code className="text-meta">balance</code>,{" "}
            <code className="text-meta">openingBalance</code>,{" "}
            <code className="text-meta">endOfMonthBalance</code>,{" "}
            <code className="text-meta">sum</code>, and every type you've
            defined (referenced by name).
          </Feature>

          <Feature
            icon={BookOpen}
            title="Open the formula reference"
            summary="The ? button next to the formula input lists every variable and function with examples."
          >
            Available functions include <code className="text-meta">min</code>,{" "}
            <code className="text-meta">max</code>,{" "}
            <code className="text-meta">abs</code>,{" "}
            <code className="text-meta">round</code>, and the cross-sheet
            accessor below.
          </Feature>

          <Feature
            icon={Network}
            title="Reference other sheets"
            summary={`Use sheet("Tax Account").endOfMonthBalance to pull a value from another sheet by name.`}
          >
            Build chains: income on one sheet feeds a transfer to another, which
            feeds a forecast on a third. Useful for modelling envelopes, tax
            buffers, or shared household budgets.
          </Feature>

          <Feature
            icon={Sigma}
            title="Build a complex / compound entry"
            summary="When one row isn't enough — a paycheck with base + bonus − tax — the complex-entry modal models parts with their own formulas."
          >
            Each part carries its own type and notes. The whole compound becomes
            a single row in the sheet, but the parts roll up into the right
            types for reporting.
          </Feature>

          <Feature
            icon={CalendarCog}
            title="Use last-day-of-month and custom intervals"
            summary='Recurring options include "last day of month" (always lands on the calendar last day) and a custom-interval mode.'
          >
            Last-day handles February gracefully. Custom intervals cover
            anything that isn't weekly / monthly / quarterly / yearly — every 17
            days, every 6 weeks, whatever you need.
          </Feature>

          <Feature
            icon={BarChart3}
            title="Read the coverage report"
            summary="Computes how much of your forecast is backed by actual entries."
          >
            Surfaces gaps where you're forecasting income or expenses that
            haven't materialised. The cheapest sanity-check that your forecast
            still reflects reality.
          </Feature>

          <Feature
            icon={Filter}
            title="Pattern rules with amount and transfer filters"
            summary="A rule can fire only when the amount falls in a specific range, or only when the row is (or isn't) a transfer."
          >
            Catches "App Store under 50 kr" without grabbing the big app
            purchases. Combine multiple narrow rules to label tricky merchants
            precisely.
          </Feature>

          <Feature
            icon={Palette}
            title="Custom theme tokens"
            summary="Settings → Appearance → Custom. Override every color individually, plus corner radius, density, and border width."
          >
            The whole app re-skins live as you tune. Save your favorite
            combination by simply leaving it on — the theme is part of your
            settings and rides with you across devices via cloud sync.
          </Feature>

          <Feature
            icon={TypeIcon}
            title="Swap the font family"
            summary="JetBrains Mono / Inter / Source Serif 4, all bundled — no network requests."
          >
            Tune the text size scale (100–200%) for readability. The choice
            persists across the whole UI, including modals and the sheet itself.
          </Feature>

          <Feature
            icon={Accessibility}
            title="Reduce motion"
            summary="Disables every transition and animation across the app."
          >
            Use for motion sensitivity or pure focus. The reduce-motion setting
            overrides every component's animation, so you don't have to keep
            fighting them.
          </Feature>

          <Feature
            icon={Users}
            title="Multiple users on one device"
            summary="Each user account gets its own encrypted store; sign out and switch without crossing data."
          >
            Useful for household devices. Each user has their own password,
            their own budget, their own preferences. The switch-user button in
            the burger menu hops between them.
          </Feature>

          <Feature
            icon={ArrowLeftRight}
            title="Switch backends with version preview"
            summary="When you change storage backends, the preview shows exactly which copy stays where."
          >
            Move from browser → Dropbox → folder without wondering which version
            "won". The preview is read-only until you confirm.
          </Feature>

          <Feature
            icon={Code2}
            title="Developer mode and logs"
            summary="Settings → toggle Developer mode. Unlocks a Logs tab that captures app output filterable by level."
          >
            Essential for diagnosing issues on mobile, where browser devtools
            aren't available. Copy logs to the clipboard for bug reports.
          </Feature>

          <Feature
            icon={Trash2}
            title="Delete account (destructive)"
            summary="Settings → Account → Delete permanently wipes one user's data from this device."
          >
            Requires password confirmation. Irreversible. The cloud copy stays
            unless you also delete it from the provider's UI — disconnect the
            backend first if you want a clean sweep.
          </Feature>

          <Graduation>
            The app does what you want, not what its defaults assumed.
          </Graduation>
        </Tier>
      </article>
    </div>
  );
}

function Tier({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line bg-surface-2 text-pipe">
          <Icon size={18} aria-hidden focusable={false} />
        </span>
        <div className="flex flex-col">
          <h2 className="text-base font-bold tracking-wide text-fg-bright">
            {title}
          </h2>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Feature({
  icon: Icon,
  title,
  summary,
  children,
}: {
  icon: LucideIcon;
  title: string;
  summary: string;
  children?: ReactNode;
}) {
  return (
    <details className="group rounded border border-line bg-surface px-3 py-2 open:bg-surface-2">
      <summary className="flex cursor-pointer list-none items-start gap-2">
        <Icon
          size={16}
          aria-hidden
          focusable={false}
          className="mt-0.5 shrink-0 text-meta"
        />
        <div className="flex-1">
          <span className="font-bold text-fg-bright">{title}.</span>{" "}
          <span className="text-fg">{summary}</span>
          {children ? (
            <span className="ml-1 inline-flex items-center gap-1 text-xs text-link group-open:hidden">
              Learn more
              <ChevronDown size={12} aria-hidden focusable={false} />
            </span>
          ) : null}
        </div>
      </summary>
      {children ? <div className="ml-6 mt-2 text-muted">{children}</div> : null}
    </details>
  );
}

function Graduation({ children }: { children: ReactNode }) {
  return (
    <blockquote className="mt-2 border-l-2 border-pipe bg-surface-2 px-3 py-2 text-xs text-fg">
      <span className="font-bold text-fg-bright">You've graduated when:</span>{" "}
      {children}
    </blockquote>
  );
}
