---
type: Fixed
---

"Back to budget" on the Privacy and Changelog pages now respects the
deploy slot. Previously the link was hardcoded to `/`, which jumped
from `/preview/changelog/` straight to the production root. Same fix
on the burger menu's Privacy and What's new links so the preview
slot's navigation stays inside `/preview/`.
