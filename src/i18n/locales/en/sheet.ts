import type { Widen } from "./_widen";

// Sheet-meta strings only: the chrome that surrounds every page
// (tab strip, sheet-meta modal, sheet title menu, sheet-level
// diagnostics). Page-specific strings — anything the budget table
// or accounts dashboard render inside the sheet — go in the
// matching page namespace (budget.*, account.*, etc.).

const sheet = {
  untitled: "Untitled sheet",
  edit: "Edit {name}",
  delete: "Delete {name}",
  rename: "Rename sheet",
  editSheet: "Edit sheet",
  viewBudget: "Viewing mode",
  viewTransfers: "Transfers",
  metadataMode: "Metadata mode",
  findConflicts: "Find conflicts",
  moreActions: "Sheet actions",
  moreActionsAria: "Sheet actions for {name}",
} as const;

export type SheetCatalog = Widen<typeof sheet>;

export default sheet;
