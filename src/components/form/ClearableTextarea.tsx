import { forwardRef, useCallback, useRef } from "react";
import type { Ref, TextareaHTMLAttributes } from "react";
import { X } from "lucide-react";

import { useT } from "../../i18n";

type Props = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
  // Outer wrapper className. Mirror the layout-related classes (e.g.
  // `w-full min-w-0`) the original `<textarea>` carried so the
  // wrapper occupies the same row.
  wrapperClassName?: string;
};

// Textarea with an inline X button that clears the value in one tap.
// Sibling of `ClearableInput` — the X is anchored at the top-right of
// the wrapper instead of vertically centred so it stays accessible
// when the textarea grows tall.
export const ClearableTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function ClearableTextarea(
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
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const setRefs = useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node;
        assignRef(ref, node);
      },
      [ref],
    );
    const hasValue = value.length > 0;
    const canClear = hasValue && !disabled && !readOnly;

    return (
      <div className={`relative ${wrapperClassName ?? ""}`.trim()}>
        <textarea
          ref={setRefs}
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
            // Keep focus on the textarea so the soft keyboard stays up
            // and the user can keep typing after clearing.
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            onClick={() => {
              onValueChange("");
              textareaRef.current?.focus();
            }}
            className="absolute top-1.5 right-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-fg"
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
