import { forwardRef, useCallback, useRef } from "react";
import type { InputHTMLAttributes, Ref } from "react";
import { X } from "lucide-react";

import { useT } from "../../i18n";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
  // Outer wrapper className. Mirror the layout-related classes (e.g.
  // `w-full min-w-0`, `flex-1`) the original `<input>` carried so the
  // wrapper occupies the same row.
  wrapperClassName?: string;
};

// Text input with an inline X button that clears the value in one tap.
// Pairs with `installSelectOnFocus` skipping plain text inputs: instead
// of relying on select-all-on-focus to replace a long pre-filled value
// (which forces the soft keyboard up on mobile), the user taps the X.
// Numeric inputs keep the select-all behaviour and don't use this
// component.
export const ClearableTextInput = forwardRef<HTMLInputElement, Props>(
  function ClearableTextInput(
    {
      value,
      onValueChange,
      className,
      wrapperClassName,
      disabled,
      readOnly,
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
          type="text"
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
            aria-label={t("common.clear")}
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
