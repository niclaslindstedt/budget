---
type: Fixed
---

Stop a stale validator allowlist from silently destroying the budget
on cloud backends: the parser now accepts every glyph the UI can
pick, falls back to the default glyph for unknown names instead of
rejecting the whole file, refuses to autosave the fresh-budget
fallback over the real stored bytes when a load parses cleanly but
fails validation, and pauses any save that would shrink the budget
by more than 5% so a regression can no longer overwrite the cloud
copy without an explicit confirmation in the sync details panel.
