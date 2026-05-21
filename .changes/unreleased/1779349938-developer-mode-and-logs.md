---
type: Added
---

Developer mode in Settings → General reveals a Developer tab with a
"Capture logs" toggle; enabling it exposes a Logs tab that shows
captured entries with level filtering, copy-all, and clear. Useful
for debugging on mobile where the devtools console is out of reach.
Stored on this device — never travels with an export. Logging
otherwise no longer reaches the browser console. The toggle is only
available in the `/preview/` build; production builds keep the
developer surface hidden.
