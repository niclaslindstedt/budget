---
type: Fixed
---

When a cloud sync session expires (most often Google Drive, whose
access tokens last about an hour), a dedicated Reconnect dialog now
pops up so you can resume in one tap instead of being stuck on a
generic "Sync failed" message that just retried the same expired
token. The Reconnect button shows a spinner while the OAuth round
trip runs, surfaces any failure (popup blocked, network error,
dismissed) inline instead of swallowing it silently, and flips into
a Retry button so it's clear another tap will try again. A new
Storage setting lets you turn the auto-pop-up off and reconnect from
the sync status icon yourself.
