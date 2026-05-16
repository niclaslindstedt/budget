// Global focusin handler that selects all text when a text-like input
// or a textarea gains focus, so tapping a field — especially on mobile,
// where selecting existing text is awkward — replaces rather than
// inserts when the user starts typing.
//
// Deferred via setTimeout so iOS Safari's post-focus caret placement
// (which runs on the touchend that produced the focus) doesn't undo
// our selection.

const SELECTABLE_INPUT_TYPES: ReadonlySet<string> = new Set([
  "text",
  "number",
  "email",
  "tel",
  "url",
  "password",
  "search",
]);

function selectAll(el: HTMLInputElement | HTMLTextAreaElement): void {
  setTimeout(() => {
    if (document.activeElement !== el) return;
    try {
      el.select();
    } catch {
      // some input types reject select(); the type filter should
      // prevent this, but swallow defensively just in case.
    }
  }, 0);
}

export function installSelectOnFocus(): void {
  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) {
      selectAll(target);
      return;
    }
    if (
      target instanceof HTMLInputElement &&
      SELECTABLE_INPUT_TYPES.has(target.type)
    ) {
      selectAll(target);
    }
  });
}
