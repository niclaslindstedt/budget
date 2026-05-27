---
type: Changed
---

On mobile, bank-imported rows whose description is a calculated
fallback (the type's name, because no real description has been
typed for the entry) now render the type name left-aligned in the
type's glyph colour, same size as a normal description — even when
the inline editor is closed and after the popover dismisses, where
the cell previously reverted to plain grey text. Tapping the cell
opens the editor with an empty textarea and the raw bank statement
text as the placeholder, instead of pre-filling with the type name
the user never authored, so it's clear what the new text overrides.
