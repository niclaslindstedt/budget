---
type: Fixed
---

Google Drive sign-in now uses Google Identity Services' popup token client instead of the PKCE redirect flow, which Google's OAuth endpoint kept rejecting with `client_secret is missing`. Connecting to Drive no longer leaves the app or requires an authorized redirect URI to be registered in the Google Cloud Console.
