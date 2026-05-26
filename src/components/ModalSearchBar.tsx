import { Search } from "lucide-react";

import { ClearableInput } from "./form";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
};

// Search input rendered at the top of a modal body. Sits in document
// flow so it scrolls away with the content — that gives the
// "disappears on scroll" effect for free using the Modal.Body's own
// `overflow-y-auto` scroll, with no scroll-direction tracking needed.
// Scrolling back to the top brings it into view again.
export function ModalSearchBar({ value, onChange, placeholder }: Props) {
  return (
    <div className="border-b border-line bg-surface-2 px-3 py-2 sm:px-4">
      <div className="relative">
        <Search
          size={14}
          aria-hidden
          focusable={false}
          className="absolute top-1/2 left-2 z-10 -translate-y-1/2 text-muted"
        />
        <ClearableInput
          value={value}
          onValueChange={onChange}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          wrapperClassName="w-full"
          className="field-input w-full min-w-0 rounded border border-line bg-surface py-1.5 pl-7 text-sm text-fg"
        />
      </div>
    </div>
  );
}
