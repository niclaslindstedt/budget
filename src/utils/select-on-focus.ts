// Global focusin handler that selects all text when a numeric input or
// a textarea gains focus, so tapping a field replaces rather than
// inserts when the user starts typing.
//
// Plain text inputs (descriptions, names, search boxes, …) are
// intentionally excluded: on mobile, tapping a long pre-filled
// description to clear it would pop the keyboard and obscure the
// surrounding modal. Those inputs use `ClearableTextInput` which
// renders an inline X clear button instead.
//
// Gated on the first user interaction (`pointerdown` / `keydown`) so
// iOS Safari's focus restoration on page reload — which targets the
// previously focused amount cell and would otherwise pop the keyboard
// with its text pre-selected before the user has touched the page —
// does not trigger the select.
//
// Deferred via setTimeout so iOS Safari's post-focus caret placement
// (which runs on the touchend that produced the focus) doesn't undo
// our selection.

const NUMERIC_INPUT_TYPES: ReadonlySet<string> = new Set(["number"]);
const NUMERIC_INPUT_MODES: ReadonlySet<string> = new Set([
  "decimal",
  "numeric",
]);

function isNumericInput(el: HTMLInputElement): boolean {
  if (NUMERIC_INPUT_TYPES.has(el.type)) return true;
  if (NUMERIC_INPUT_MODES.has(el.inputMode)) return true;
  return false;
}

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
  let userInteracted = false;
  const markInteracted = () => {
    userInteracted = true;
    document.removeEventListener("pointerdown", markInteracted, true);
    document.removeEventListener("keydown", markInteracted, true);
  };
  document.addEventListener("pointerdown", markInteracted, true);
  document.addEventListener("keydown", markInteracted, true);

  document.addEventListener("focusin", (event) => {
    if (!userInteracted) return;
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) {
      selectAll(target);
      return;
    }
    if (target instanceof HTMLInputElement && isNumericInput(target)) {
      selectAll(target);
    }
  });
}
