import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown } from "lucide-react";

import { type FloatingPlacement } from "../../hooks";
import { FloatingPanel } from "../FloatingPanel";

export type SelectOption<T extends string | number> = {
  value: T;
  label: React.ReactNode;
  // Optional secondary line shown under the label in the option list.
  hint?: React.ReactNode;
  disabled?: boolean;
};

type Props<T extends string | number> = {
  value: T;
  options: SelectOption<T>[];
  onChange: (next: T) => void;
  // Override placement defaults. The defaults — minimum-width grows to
  // trigger, left anchor, `document` coordinate space — are the iOS-
  // keyboard-safe combination already used by the project's other
  // pickers.
  placement?: Partial<FloatingPlacement>;
  // Tailwind classes for the trigger button — most call sites want
  // the standard `field-input` look.
  triggerClassName?: string;
  // Tailwind classes for the floating panel (e.g. `max-h-64
  // overflow-y-auto` for long option lists).
  panelClassName?: string;
  // Custom rendering for the trigger's current-value label. Defaults
  // to the selected option's `label`.
  renderValue?: (option: SelectOption<T> | null) => React.ReactNode;
  // Required when no visible label wraps the picker (most form
  // contexts already supply one via the surrounding row).
  ariaLabel?: string;
  // Forwarded to the FloatingPanel so a picker rendered inside a
  // sheet row participates in the active-row coordinator.
  rowId?: string;
  disabled?: boolean;
};

const DEFAULT_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 160 },
  anchor: "left",
  coordinateSpace: "document",
};

// Custom <select> replacement built on FloatingPanel. The trigger is
// styled like the project's `field-input`; the panel is a `role=
// "listbox"` of `role="option"` buttons. Full keyboard nav: ArrowUp /
// Down to move highlight, Home / End to jump, Enter / Space to commit,
// Escape to dismiss without committing. Mobile reuses the same
// popover because `coordinateSpace: "document"` already survives the
// iOS visual-viewport shift when the soft keyboard opens.
export function SelectPicker<T extends string | number>({
  value,
  options,
  onChange,
  placement,
  triggerClassName,
  panelClassName,
  renderValue,
  ariaLabel,
  rowId,
  disabled,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  // Seed the highlight to the currently selected option each time the
  // panel opens so ArrowDown moves to "the next thing", not back to
  // the top.
  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setHighlight(idx === -1 ? 0 : idx);
  }, [open, options, value]);

  const close = useCallback(() => {
    setOpen(false);
    setHighlight(-1);
  }, []);

  const commit = useCallback(
    (option: SelectOption<T>) => {
      if (option.disabled) return;
      onChange(option.value);
      close();
      triggerRef.current?.focus();
    },
    [onChange, close],
  );

  const moveHighlight = useCallback(
    (delta: number) => {
      if (options.length === 0) return;
      setHighlight((prev) => {
        const start = prev === -1 ? 0 : prev;
        let next = start;
        for (let i = 0; i < options.length; i++) {
          next = (next + delta + options.length) % options.length;
          if (!options[next].disabled) return next;
        }
        return prev;
      });
    },
    [options],
  );

  function handleTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "Enter" ||
      e.key === " "
    ) {
      e.preventDefault();
      setOpen(true);
    }
  }

  function handleListKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      const i = options.findIndex((o) => !o.disabled);
      if (i !== -1) setHighlight(i);
    } else if (e.key === "End") {
      e.preventDefault();
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i].disabled) {
          setHighlight(i);
          break;
        }
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (highlight >= 0 && highlight < options.length) {
        commit(options[highlight]);
      }
    }
  }

  const triggerClasses =
    triggerClassName ??
    "field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none";

  const finalPlacement: FloatingPlacement = {
    ...DEFAULT_PLACEMENT,
    ...placement,
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKey}
        className={`${triggerClasses} ${disabled ? "cursor-not-allowed opacity-60" : ""}`.trim()}
      >
        <span className="flex-1 truncate">
          {renderValue ? renderValue(selected) : (selected?.label ?? "")}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>

      <FloatingPanel
        open={open && !disabled}
        onClose={close}
        triggerRef={triggerRef}
        placement={finalPlacement}
        rowId={rowId}
        className={`py-1 ${panelClassName ?? ""}`.trim()}
      >
        <div
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          onKeyDown={handleListKey}
          // Auto-focus the listbox when it opens so keyboard nav
          // works without an extra click.
          ref={(el) => {
            if (el && open) el.focus();
          }}
          className="outline-none"
        >
          {options.map((option, i) => {
            const isSelected = option.value === value;
            const isHighlighted = i === highlight;
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                onMouseEnter={() => !option.disabled && setHighlight(i)}
                onClick={() => commit(option)}
                className={`flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg ${
                  option.disabled
                    ? "cursor-not-allowed opacity-50"
                    : isHighlighted
                      ? "bg-surface text-fg-bright"
                      : "hover:bg-surface"
                }`}
              >
                <span className="flex flex-1 flex-col gap-0.5 truncate">
                  <span className="truncate">{option.label}</span>
                  {option.hint && (
                    <span className="truncate text-xs text-muted">
                      {option.hint}
                    </span>
                  )}
                </span>
                {isSelected && (
                  <Check
                    size={14}
                    className="shrink-0 text-accent"
                    aria-hidden
                    focusable={false}
                  />
                )}
              </button>
            );
          })}
        </div>
      </FloatingPanel>
    </>
  );
}
