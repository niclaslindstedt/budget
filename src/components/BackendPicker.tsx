import { useCallback, useRef, useState } from "react";
import { Check, ChevronDown, HardDrive } from "lucide-react";

import type { FloatingPlacement } from "../hooks";
import type { BackendId } from "../storage/backend-preference";
import { DropboxGlyph } from "./DropboxGlyph";
import { FloatingPanel } from "./FloatingPanel";
import { GoogleDriveGlyph } from "./GoogleDriveGlyph";

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 224 },
  anchor: "left",
  coordinateSpace: "viewport",
};

type Option = {
  id: BackendId;
  label: string;
  Glyph: (props: { size?: number }) => React.ReactElement;
};

const OPTIONS: Option[] = [
  {
    id: "local",
    label: "This device",
    Glyph: ({ size = 16 }) => (
      <HardDrive size={size} aria-hidden focusable={false} />
    ),
  },
  {
    id: "dropbox",
    label: "Dropbox",
    Glyph: ({ size = 16 }) => <DropboxGlyph size={size} />,
  },
  {
    id: "gdrive",
    label: "Google Drive",
    Glyph: ({ size = 16 }) => <GoogleDriveGlyph size={size} />,
  },
];

type Props = {
  value: BackendId;
  onSelect: (next: BackendId) => void;
};

export function BackendPicker({ value, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const selected = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0];

  function handlePick(id: BackendId) {
    setOpen(false);
    if (id !== value) onSelect(id);
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex w-56 cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      >
        <span
          aria-hidden
          className={value === "local" ? "text-muted" : "text-accent"}
        >
          <selected.Glyph size={16} />
        </span>
        <span className="flex-1 truncate">{selected.label}</span>
        <ChevronDown
          size={14}
          className="shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>

      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={rootRef}
        placement={PLACEMENT}
        className="overflow-hidden"
      >
        <ul role="listbox" className="py-1">
          {OPTIONS.map((opt) => {
            const isSelected = opt.id === value;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handlePick(opt.id)}
                  className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-mono text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span
                    aria-hidden
                    className={
                      opt.id === "local" ? "text-muted" : "text-accent"
                    }
                  >
                    <opt.Glyph size={16} />
                  </span>
                  <span className="flex-1 truncate">{opt.label}</span>
                  {isSelected && (
                    <Check
                      size={14}
                      className="text-accent"
                      aria-hidden
                      focusable={false}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </FloatingPanel>
    </div>
  );
}
