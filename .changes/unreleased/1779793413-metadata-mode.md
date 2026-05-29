---
type: Added
---

Metadata mode: the budget title `…` menu now offers a focused walk
through the imported entries that still need annotation. One entry at
a time, biggest absolute amount first, newest month first. Shows the
raw bank line read-only and lets you pick a type, tag a company, add
optional tags, optionally write a custom description, and move on.
Tags never bring an entry back to the list — they're an extra label,
not something the walk waits on. The form
pre-populates with whatever is already resolved for the entry (from
rules, hints, or per-entry overrides) so you see existing metadata
and can edit it instead of typing it again — Save only commits what
you actually changed, and surfaces a hint plus a one-shot pulse on
the next blocker if you tap it before there's anything to save. An
"Omit company" item at the top of the company dropdown marks entries
where tagging a merchant doesn't apply (salary, internal transfers,
…) so they stop surfacing here over a missing company. A "Mark as
transfer" checkbox lets you flag an entry as money moving between
accounts and continue to the next item without picking a type or a
company. As soon as you set any field, if the entry has lookalikes —
older imports whose bank text matches once dates and reference numbers
are stripped — an "Also apply to N similar entries" checkbox appears
and lets you fan that entry's type, company (or its "omit company"
decision), description, and tags out to all of them in one save. It
fills only the fields each match is still missing, so nothing you
tagged earlier gets overwritten and already-labelled lookalikes keep
what they have. Built for the spare-minute case on mobile — entries
covered by a match rule or a merchant hint are skipped so only the
genuinely unknown ones surface.
