import { useRef } from "react";
import { Search, X } from "lucide-react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  clearLabel: string;
};

// Search input rendered at the top of a modal body. Sits in document
// flow so it scrolls away with the content — that gives the
// "disappears on scroll" effect for free using the Modal.Body's own
// `overflow-y-auto` scroll, with no scroll-direction tracking needed.
// Scrolling back to the top brings it into view again.
export function ModalSearchBar({
  value,
  onChange,
  placeholder,
  clearLabel,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="border-b border-line bg-surface-2 px-3 py-2 sm:px-4">
      <div className="relative">
        <Search
          size={14}
          aria-hidden
          focusable={false}
          className="absolute top-1/2 left-2 -translate-y-1/2 text-muted"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="field-input w-full min-w-0 rounded border border-line bg-surface py-1.5 pr-8 pl-7 text-sm text-fg"
        />
        {value !== "" && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            aria-label={clearLabel}
            title={clearLabel}
            className="absolute top-1/2 right-1 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          >
            <X size={14} aria-hidden focusable={false} />
          </button>
        )}
      </div>
    </div>
  );
}
