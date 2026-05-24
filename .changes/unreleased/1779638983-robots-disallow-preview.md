---
type: Changed
---

`robots.txt` now explicitly disallows `/preview/`, so well-behaved
crawlers skip the staging slot entirely instead of fetching it and
discovering the `noindex,nofollow` meta tag. Belt-and-braces on top
of the existing per-alias robots meta — combined with the fact that
`sitemap.xml` and `llms.txt` are emitted by the production build
only, `https://budget.niclaslindstedt.se/preview/…` URLs should
never appear in search results or LLM discovery surfaces.
