import type { Widen } from "./_widen";

// Shared chrome for the in-modal search controls (`ModalSearchControls`)
// reused across every search modal. Per-modal labels (search-field
// placeholder, empty-result copy, individual filter names) stay in the
// owning namespace; only the universal control vocabulary lives here so
// a restyle of the sort / filter cluster propagates everywhere at once.
const search = {
  sortAria: "Toggle sort order",
  sortNewest: "Newest first",
  sortOldest: "Oldest first",
  filterAria: "Filter results",
  filterTitle: "Filter",
} as const;

export type SearchCatalog = Widen<typeof search>;

export default search;
