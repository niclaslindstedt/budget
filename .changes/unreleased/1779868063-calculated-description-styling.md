---
type: Changed
---

On mobile, bank-imported rows whose description is a calculated
fallback (the type's name, because no real description has been
typed for the entry) now stay in italic + the type's glyph colour
even when the inline editor is closed — previously the cell reverted
to plain grey text as soon as the popover dismissed. Tapping the
cell opens the editor with an empty textarea and the raw bank
statement text as the placeholder, instead of pre-filling with the
type name the user never authored, so it's clear what the new text
overrides.
