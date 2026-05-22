---
type: Removed
---

Removed the public JSON Schema page at `/schema` and the "Data schema"
link in Settings. The persisted shape is documented in the TypeScript
source (`src/data/types.ts`, `src/data/validate.ts`); agents can read
it there.
