import type { Widen } from "./_widen";

const saveState = {
  saving: "Saving…",
  saved: "Saved",
  failed: "Save failed",
  allSaved: "All changes saved",
  saveUnsaved: "Save unsaved changes",
} as const;

export type SaveStateCatalog = Widen<typeof saveState>;

export default saveState;
