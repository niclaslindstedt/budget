---
type: Added
---

The production site now loads **GoatCounter**, a privacy-friendly,
open-source page-view counter, via an `async` script in the page head.
It records aggregated hits only (URL visited, referrer, language,
screen size, country, and a hashed/salted IP for short-term
deduplication), sets no cookies, collects no personally identifying
information, and does not track users across sites. The
`/preview/` staging slot and local dev builds never load the counter.
The privacy page documents what is and isn't recorded.
