import { forwardRef, useCallback, useRef } from "react";
import type { InputHTMLAttributes, Ref } from "react";
import { X } from "lucide-react";

import { useT } from "../../i18n";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
  // Outer wrapper className. Mirror the layout-related classes (e.g.
  // `w-full min-w-0`, `flex-1`) the original `<input>` carried so the
  // wrapper occupies the same row.
  wrapperClassName?: string;
  // Override the default "Clear" aria-label on the inline X. Use a
  // more specific verb when the parent input has an obvious noun (e.g.
  // "Clear search") so screen reader users hear what's being cleared.
  clearLabel?: string;
};

// Text / numeric input with an inline X button that clears the value
// in one tap. Tapping the X drops a long pre-filled value without
// dismissing the soft keyboard — the single replacement for the older
// "select all on focus" pattern across the modal surface. Pass
// `type` / `inputMode` through to render text, number, decimal, etc.
//
// The X is suppressed on `disabled` / `readOnly` and when the value
// is empty, so the input only carries the affordance when there's
// something to clear.
export const ClearableInput = forwardRef<HTMLInputElement, Props>(
  function ClearableInput(
    {
      value,
      onValueChange,
      className,
      wrapperClassName,
      clearLabel,
      disabled,
      readOnly,
      type = "text",
      ...rest
    },
    ref,
  ) {
    const t = useT();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const setRefs = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        assignRef(ref, node);
      },
      [ref],
    );
    const hasValue = value.length > 0;
    const canClear = hasValue && !disabled && !readOnly;

    return (
      <div className={`relative ${wrapperClassName ?? ""}`.trim()}>
        <input
          ref={setRefs}
          type={type}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={disabled}
          readOnly={readOnly}
          className={`${className ?? ""} ${canClear ? "pr-8" : ""}`.trim()}
          {...rest}
        />
        {canClear && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={clearLabel ?? t("common.clear")}
            // Keep the press from shifting focus to the button itself —
            // we want focus to land on the input so the soft keyboard
            // stays up (mobile) and the user can keep typing (desktop).
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            onClick={() => {
              onValueChange("");
              inputRef.current?.focus();
            }}
            className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-fg"
          >
            <X size={14} aria-hidden focusable={false} />
          </button>
        )}
      </div>
    );
  },
);

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}
