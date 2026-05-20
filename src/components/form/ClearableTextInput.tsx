import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
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
    const hasValue = value.length > 0;
    const canClear = hasValue && !disabled && !readOnly;

    return (
      <div className={`relative ${wrapperClassName ?? ""}`.trim()}>
        <input
          ref={ref}
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
            // Don't steal focus from the input on mobile (would close
            // the keyboard if it's open) or trigger blur logic on
            // desktop while the user is mid-edit.
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            onClick={() => onValueChange("")}
            className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-fg"
          >
            <X size={14} aria-hidden focusable={false} />
          </button>
        )}
      </div>
    );
  },
);
