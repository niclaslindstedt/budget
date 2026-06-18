import type { HistoryStaleness } from "../data/history";

// Maps the staleness bucket of an account's most recent imported
// transaction (see `historyStaleness` in `src/data/history.ts`) to the
// theme colour token the "Last activity" cell renders in. Shared by the
// Accounts and Savings rows so the colour key stays identical across both
// pages. The data layer owns the day-age thresholds; this is the UI side
// of the split — the only place the buckets become Tailwind classes.
//
//   fresh  → green   (today / yesterday)
//   recent → yellow  (2–3 days)
//   aging  → orange  (4–6 days)
//   stale  → red     (a week or more)
export const STALENESS_TEXT_CLASS: Record<HistoryStaleness, string> = {
  fresh: "text-success",
  recent: "text-meta",
  aging: "text-flag",
  stale: "text-danger",
};
