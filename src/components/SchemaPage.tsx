import { ArrowLeft } from "lucide-react";

import { LATEST_VERSION } from "../data/migrations";
import { SCHEMA_ID, USER_DATA_SCHEMA } from "../data/schema";

// Stringified once at module load so the rendered code block and a
// hypothetical `view-source:` consumer see the same bytes. Sorted keys
// keep the output stable across rebuilds.
const SCHEMA_JSON = stableStringify(USER_DATA_SCHEMA, 2);

// Last meaningful change to the prose below. Bump when the
// explanation text changes; the schema's own freshness comes from the
// `version` field it embeds.
const LAST_UPDATED =
  "2026-05-17 (v9 — added Transaction, AccountsView, account metadata)";

export function SchemaPage() {
  return (
    <div className="min-h-dvh bg-page-bg px-4 py-10 text-fg">
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 text-sm leading-relaxed">
        <header className="flex flex-col gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 self-start text-xs text-link hover:underline"
          >
            <ArrowLeft size={14} aria-hidden focusable={false} />
            Back to budget
          </a>
          <h1 className="text-lg font-bold text-fg-bright">
            Budget data schema
          </h1>
          <p className="text-xs text-muted">
            JSON Schema (Draft 2020-12) for the file Budget exports and stores.
            Current version:{" "}
            <code className="text-meta">v{LATEST_VERSION}</code>. Last updated:{" "}
            {LAST_UPDATED}.
          </p>
        </header>

        <Section title="For agents in a hurry">
          <p>
            You were handed a <code className="text-meta">budget-*.json</code>{" "}
            file. Validate it against the schema below — it tells you every
            field, every enum, every constraint, and what each piece means. The
            stable identifier is <span className="text-path">{SCHEMA_ID}</span>.
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              The top-level <code className="text-meta">version</code> field is
              the schema version, not the app version. This document targets{" "}
              <code className="text-meta">v{LATEST_VERSION}</code>. A higher
              value means the file was written by a newer build than this schema
              describes; lower values are upgraded by the migration chain in{" "}
              <code className="text-meta">src/data/migrations.ts</code> before
              validation runs.
            </li>
            <li>
              Cells inside a row are keyed by <em>column id</em>, not by column{" "}
              <em>type</em>. To know what a cell means, look up its column's{" "}
              <code className="text-meta">type</code> in the same{" "}
              <code className="text-meta">AccountBudget.columns</code> array.
            </li>
            <li>
              The <code className="text-meta">balance</code> column has no
              stored cell — it's derived as a running total of{" "}
              <code className="text-meta">amount</code> over rows sorted by{" "}
              <code className="text-meta">date</code>. Don't treat a missing
              balance cell as a bug.
            </li>
            <li>
              A <code className="text-meta">category</code> cell holds the id
              (string) of an entry in the top-level{" "}
              <code className="text-meta">categories</code> array — not the
              name.
            </li>
            <li>
              Rows generated from a recurring entry share a{" "}
              <code className="text-meta">seriesId</code>. Use it to group "this
              and all future" operations.
            </li>
            <li>
              Transfers between accounts live in the top-level{" "}
              <code className="text-meta">transactions</code> array, not as rows
              on either budget. <code className="text-meta">amount</code> is
              always positive; the direction is{" "}
              <code className="text-meta">fromAccountId → toAccountId</code>.
              The app synthesizes a read-only row on each endpoint's budget at
              render time — do NOT add those synthesized rows back into{" "}
              <code className="text-meta">rows</code> when summing balances or
              you'll double-count.
            </li>
            <li>
              The <code className="text-meta">"accounts"</code> sheet flavour
              holds a single item with{" "}
              <code className="text-meta">type: "accountsView"</code> and no
              data of its own — the dashboard renders directly from the global{" "}
              <code className="text-meta">accounts</code> and{" "}
              <code className="text-meta">transactions</code> arrays. Only one
              such sheet exists per user.
            </li>
          </ul>
        </Section>

        <Section title="What this file represents">
          <p>
            Budget is a local-first app served at{" "}
            <span className="text-path">budget.niclaslindstedt.se</span>. There
            is no backend: a user's data lives in their browser's{" "}
            <code className="text-meta">localStorage</code> and, optionally, as
            a copy in their own Dropbox app folder. Exporting writes the same
            in-memory document to a JSON file the user saves themselves. That
            file is exactly the shape described below — no envelope, no metadata
            wrapper, no credentials.
          </p>
          <p>
            Account credentials (usernames, PBKDF2 password hashes) live in a
            separate device-wide registry and are NOT part of this schema.
            Anything you receive that conforms to this schema is portable user
            data only.
          </p>
        </Section>

        <Section title="At a glance">
          <pre className="overflow-x-auto rounded border border-line bg-surface-2 p-3 font-mono text-xs leading-snug text-fg">
            {OVERVIEW_TEXT}
          </pre>
        </Section>

        <Section title="JSON Schema">
          <p>
            The schema below validates a decoded export verbatim. It is strict (
            <code className="text-meta">additionalProperties: false</code>) so
            any field not in this document is a signal that the writer is a
            newer build of the app than this schema covers — re-fetch this page
            when you see one.
          </p>
          {/* `type="application/schema+json"` is the registered media type
              for JSON Schema; agents that prefer machine-readable input
              can pull the script tag directly instead of scraping the
              pre block. Any literal `<` in the schema bytes is rewritten
              to the JSON unicode escape `<` so a stray `</script>`
              in a future schema string cannot break out of the tag —
              the JSON parses back to the same value. */}
          <script
            type="application/schema+json"
            dangerouslySetInnerHTML={{
              __html: SCHEMA_JSON.replace(/</g, "\\u003c"),
            }}
          />
          <pre className="overflow-x-auto rounded border border-line bg-surface-2 p-3 font-mono text-xs leading-snug text-fg">
            {SCHEMA_JSON}
          </pre>
        </Section>

        <Section title="Reading a file step by step">
          <ol className="ml-5 list-decimal space-y-1">
            <li>
              Parse the file with <code className="text-meta">JSON.parse</code>{" "}
              (or your language's equivalent).
            </li>
            <li>
              Check <code className="text-meta">version</code>. If it's less
              than <code className="text-meta">{LATEST_VERSION}</code>, the file
              is from an older build — the app would migrate it on import; you
              can either upgrade it yourself by walking the migration chain or
              note that the field shapes match an earlier version of this
              schema. A higher value means the file is from a build newer than
              this schema describes.
            </li>
            <li>
              Build a column lookup: for each sheet, for each item with{" "}
              <code className="text-meta">type: "accountBudget"</code>, index
              its <code className="text-meta">columns</code> array by{" "}
              <code className="text-meta">id</code>. You'll need this to read
              row cells.
            </li>
            <li>
              For each row in that item, walk{" "}
              <code className="text-meta">cells</code>. For every column id
              present, the column's <code className="text-meta">type</code>{" "}
              tells you how to interpret the value (see the{" "}
              <code className="text-meta">ColumnType</code> definition in the
              schema).
            </li>
            <li>
              To compute the running balance the UI shows, sort rows
              chronologically by their date cell and accumulate{" "}
              <code className="text-meta">amount</code>. The first row's balance
              equals its own amount — the file does not store an opening balance
              separately.
            </li>
            <li>
              Resolve <code className="text-meta">category</code> cells by
              looking the id up in the top-level{" "}
              <code className="text-meta">categories</code> array.
            </li>
            <li>
              Resolve <code className="text-meta">AccountBudget.accountId</code>{" "}
              (when non-null) in the top-level{" "}
              <code className="text-meta">accounts</code> array.
            </li>
            <li>
              To compute an account's true balance, sum the{" "}
              <code className="text-meta">amount</code> cells of every budget
              row whose <code className="text-meta">accountId</code> matches,
              then for each entry in{" "}
              <code className="text-meta">transactions</code> add{" "}
              <code className="text-meta">amount</code> when the account is the{" "}
              <code className="text-meta">toAccountId</code> and subtract it
              when the account is the{" "}
              <code className="text-meta">fromAccountId</code>. Skip{" "}
              <code className="text-meta">"accountsView"</code> items — they
              hold no rows.
            </li>
          </ol>
        </Section>

        <Section title="Common pitfalls">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong className="text-fg-bright">
                Amounts can be any sign.
              </strong>{" "}
              Income is positive, spending is negative. There is no separate
              debit/credit flag.
            </li>
            <li>
              <strong className="text-fg-bright">Dates are strings,</strong> not
              numbers — ISO <code className="text-meta">YYYY-MM-DD</code>. The
              validator only checks the primitive type, so a malformed string
              passes the schema but breaks month grouping in the UI.
            </li>
            <li>
              <strong className="text-fg-bright">
                Fiscal months can shift.
              </strong>{" "}
              <code className="text-meta">settings.startOfMonth</code> rolls the
              month over on a non-1st day (default 25). When summarising "May
              2026" check what start-of-month the settings declare.
            </li>
            <li>
              <strong className="text-fg-bright">
                Category cells hold ids.
              </strong>{" "}
              A cell value like <code className="text-meta">"groceries"</code>{" "}
              is a category id, not a name — look it up in{" "}
              <code className="text-meta">categories</code>.
            </li>
            <li>
              <strong className="text-fg-bright">
                Half-finished rows are stripped on save.
              </strong>{" "}
              An exported file only contains rows with both a description and a
              numeric amount; you won't see placeholders.
            </li>
            <li>
              <strong className="text-fg-bright">
                Don't double-count transactions.
              </strong>{" "}
              A transfer between two accounts is stored once in{" "}
              <code className="text-meta">transactions</code>. The app
              synthesizes a read-only row on each endpoint's budget at render
              time, but those rows are NEVER persisted. If you're computing
              balances, ignore the budget rows for the transactions and add them
              once from <code className="text-meta">transactions</code>.
            </li>
          </ul>
        </Section>

        <Section title="Source and feedback">
          <p>
            This document is generated from the same constants the runtime
            validator uses, in{" "}
            <code className="text-meta">src/data/schema.ts</code> of the{" "}
            <a
              href="https://github.com/niclaslindstedt/budget"
              className="text-link hover:underline"
            >
              source repository
            </a>
            . If the schema disagrees with the data you've been handed, open an
            issue with the offending file (or a redacted excerpt).
          </p>
        </Section>
      </article>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold tracking-wide text-fg-bright">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Plain ASCII tree so an agent fetching the page can grok the shape
// without parsing the JSON Schema's $refs. Kept in the page rather
// than the schema module because the schema must be a valid JSON
// Schema document.
const OVERVIEW_TEXT = `UserData
├─ version: 9                              schema version (this build)
├─ activeSheetId: string                   id of the sheet to open first
├─ accounts: Account[]                     real-world accounts (may be empty)
│  └─ Account { id, name,
│              description?, glyph?, color?, bank?,
│              clearing?, accountNumber?, iban?, bic?, currency? }
├─ categories: Category[]                  category records
│  └─ Category { id, name, color, icon }
├─ transactions: Transaction[]             transfers between accounts
│  └─ Transaction { id, date, description, amount (>= 0),
│                   fromAccountId, toAccountId,
│                   categoryId?, completed? }
├─ settings: Settings                      display + entry preferences
│  ├─ startOfMonth: 1..28                  fiscal-month rollover day
│  ├─ dateFormat / shortDateFormat
│  ├─ currency / currencyPosition / currencySpace
│  ├─ decimalSeparator / thousandsSeparator
│  ├─ formatNumbers / showCurrency / showDecimals
│  └─ sessionTimeoutMinutes: 1..1440
└─ sheets: Sheet[] (non-empty)
   └─ Sheet { id, name, type, glyph, color, description, items }
      └─ items: SheetItem[]                budget: AccountBudget; accounts: AccountsView
         ├─ AccountBudget { id, type: "accountBudget", accountId|null,
         │                  columns, rows }
         │  ├─ columns: Column[]           order = display order
         │  │  └─ Column { id, type, label }
         │  │     type ∈ { date | description | amount | balance
         │  │            | completed | category }
         │  └─ rows: Row[]                 month grouping is derived
         │     └─ Row { id, cells, seriesId? }
         │        cells: { [columnId]: string|number|boolean|null }
         └─ AccountsView { id, type: "accountsView" }
                                           singleton dashboard, no data of its own`;

function stableStringify(value: unknown, indent: number): string {
  return JSON.stringify(value, stableReplacer, indent);
}

function stableReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}
