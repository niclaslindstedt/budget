// Shared Tailwind class strings for the custom-dropdown listbox shell the
// project's domain pickers build on FloatingPanel (EmployerPicker,
// MunicipalityPicker, FileCategoryPicker, TaxProfilePicker, …). The four
// pickers each re-declared these byte-identical strings; hoisting them keeps
// the roving-focus option row and the "create new" footer button looking the
// same everywhere from one place. (SelectPicker keeps its own row class — it
// uses a highlight model, not roving focus, so its option row differs.)

// A focusable option row inside a `role="listbox"`: full-width, roving-focus
// outline, hover tint. Inherits its text color from the surrounding panel.
export const LISTBOX_OPTION_CLASS =
  "flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

// The accent-coloured "New …" footer button below a listbox that opens a
// focused creator. Slightly taller (`py-2`) than a plain option row.
export const LISTBOX_CREATE_OPTION_CLASS =
  "flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";
