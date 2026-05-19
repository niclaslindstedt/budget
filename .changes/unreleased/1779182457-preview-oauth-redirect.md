---
type: Fixed
---

The preview build's "Connect Dropbox" and "Connect Google Drive"
buttons now round-trip back to `/preview/` instead of bouncing onto
the production root, where the preview's PKCE verifier wasn't visible
and auth completion silently aborted.
