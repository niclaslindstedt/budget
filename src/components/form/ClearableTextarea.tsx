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
  // Grow the wrapper to fit the value or the placeholder text. Renders
  // a hidden sizing ghost (a duplicate textarea with
  // `field-sizing: content`) in the same grid cell as the real textarea
  // so the wrapper tracks `max(value, placeholder)`. Without this, a
  // multi-line placeholder clips when the textarea is empty — the
  // browser sizes a textarea to its value, ignoring the placeholder.
  sizeToContent?: boolean;
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
      placeholder,
      sizeToContent,
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
    const textareaClass = `${className ?? ""} ${canClear ? "pr-8" : ""}`.trim();

    return (
      <div
        className={`relative ${sizeToContent ? "grid grid-cols-1" : ""} ${wrapperClassName ?? ""}`.trim()}
      >
        {sizeToContent && (
          // Sizing ghost: a duplicate textarea with `field-sizing: content`
          // shares the grid cell with the real textarea so the wrapper
          // tracks `max(value, placeholder)`. Using a textarea — not a
          // `div` — means line metrics and word-wrap behavior match
          // the real control exactly, so the panel sizes to the same
          // pixel height the text actually needs. With a div ghost,
          // iOS Safari wrapped the div's text at a different point than
          // the textarea's placeholder, leaving a 2-line placeholder
          // pinned to the `rows={1}` intrinsic height.
          <textarea
            aria-hidden
            tabIndex={-1}
            readOnly
            value={value || placeholder || ""}
            rows={1}
            style={{ gridArea: "1 / 1" }}
            className={`pointer-events-none invisible [field-sizing:content] ${textareaClass}`}
          />
        )}
        <textarea
          ref={setRefs}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={placeholder}
          style={sizeToContent ? { gridArea: "1 / 1" } : undefined}
          className={textareaClass}
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
