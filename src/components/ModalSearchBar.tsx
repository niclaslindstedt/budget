import { Search } from "lucide-react";

import { ClearableInput } from "./form";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  // Optional trailing controls (e.g. sort / filter buttons) rendered
  // inside the input shell, divided from the text field. Mirrors the
  // entry search modal's inline button cluster so callers reuse this one
  // search-bar shell instead of hand-rolling the bordered flex container.
  // Omitted by callers that only need a plain search field (e.g.
  // HistoryModal), which keep the icon-only input look.
  actions?: React.ReactNode;
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
  actions,
}: Props) {
  return (
    <div className="border-b border-line bg-surface-2 px-3 py-2 sm:px-4">
      <div className="flex items-stretch rounded border border-line bg-surface focus-within:border-accent">
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search
            size={14}
            aria-hidden
            focusable={false}
            className="pointer-events-none absolute top-1/2 left-2 z-10 -translate-y-1/2 text-muted"
          />
          <ClearableInput
            value={value}
            onValueChange={onChange}
            placeholder={placeholder}
            aria-label={placeholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            wrapperClassName="min-w-0 flex-1"
            className="field-input w-full min-w-0 border-0 bg-transparent py-1.5 pl-7 text-sm text-fg focus:outline-none"
          />
        </div>
        {actions && (
          <div className="flex items-center gap-1 border-l border-line px-1">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
