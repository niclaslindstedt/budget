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

// Search field shell rendered at the top of a modal. Placement decides
// its scroll behaviour: dropped inside `Modal.Body` it sits in document
// flow and scrolls away with the content; rendered as a sibling band
// between `Modal.Header` and `Modal.Body` (the `shrink-0` keeps it from
// compressing in the shell's flex column) it stays pinned so search is
// reachable no matter how far the body has scrolled. `BudgetViewerModal`
// and `HistoryModal` use the pinned-band placement; `AccountTransfersModal`
// keeps it in flow.
export function ModalSearchBar({
  value,
  onChange,
  placeholder,
  actions,
}: Props) {
  return (
    <div className="shrink-0 border-b border-line bg-surface-2 px-3 py-2 sm:px-4">
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
