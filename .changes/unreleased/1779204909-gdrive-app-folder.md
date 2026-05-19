---
type: Changed
---

Google Drive backend now stores its file in a dedicated
`budget/` folder at the root of your My Drive, with backups nested
inside it, instead of writing `budget.json` straight to the root.
Existing files are migrated into the new layout automatically on
first load.
