---
type: Changed
---

Folded the inline edit / view / download icons next to each sheet's title into a single dropdown menu, so the header reads as just the sheet name with a trailing overflow glyph. Tapping anywhere on the title — the name or the glyph — opens the menu, so it's an easy target on mobile. Each sheet view owns its own item list, so the menu now reads **Edit sheet** / **View budget** / **Download budget** on a budget sheet and **Edit sheet** / **Download account data** on the accounts sheet — and new sheet types can push whatever items make sense without growing the menu's props.
