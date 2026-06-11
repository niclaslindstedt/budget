// Native `<input type="date">` keeps the intrinsic width of its editing
// controls on iOS WebKit and won't shrink to a `w-full` container, so it
// overflows the modal. Omit `w-full` and let the control size to its
// content. Shared by every modal that renders a date input so the
// workaround lives in one place.
export const DATE_INPUT_CLASS =
  "field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";
