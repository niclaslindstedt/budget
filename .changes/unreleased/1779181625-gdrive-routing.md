---
type: Fixed
---

Connecting Google Drive no longer occasionally lands on the Dropbox path
when the provider's redirect strips the OAuth `state` param — the PKCE
verifier in the browser is now the source of truth for which flow
issued the inbound code.
