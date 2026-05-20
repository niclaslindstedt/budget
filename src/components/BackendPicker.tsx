import { useCallback, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, FolderOpen, HardDrive } from "lucide-react";

import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import type { BackendId } from "../storage/backend-preference";
import { isDropboxConfigured } from "../storage/dropbox-adapter";
import { isFolderBackendAvailable } from "../storage/folder-handle-store";
import { isGdriveConfigured } from "../storage/gdrive-adapter";
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
  disabledReason?: string;
};

type Props = {
  value: BackendId;
  onSelect: (next: BackendId) => void;
};

function isLocalBackend(id: BackendId): boolean {
  return id === "browser" || id === "folder";
}

export function BackendPicker({ value, onSelect }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const options = useMemo<Option[]>(() => {
    const folderAvailable = isFolderBackendAvailable();
    const dropboxConfigured = isDropboxConfigured();
    const gdriveConfigured = isGdriveConfigured();
    return [
      {
        id: "browser",
        label: t("backend.thisBrowser"),
        Glyph: ({ size = 16 }) => (
          <HardDrive size={size} aria-hidden focusable={false} />
        ),
      },
      {
        id: "folder",
        label: t("backend.localFolder"),
        Glyph: ({ size = 16 }) => (
          <FolderOpen size={size} aria-hidden focusable={false} />
        ),
        disabledReason: folderAvailable
          ? undefined
          : t("backend.folderUnsupported"),
      },
      {
        id: "dropbox",
        label: t("backend.dropbox"),
        Glyph: ({ size = 16 }) => <DropboxGlyph size={size} />,
        disabledReason: dropboxConfigured
          ? undefined
          : t("backend.dropboxNotConfigured"),
      },
      {
        id: "gdrive",
        label: t("backend.googleDrive"),
        Glyph: ({ size = 16 }) => <GoogleDriveGlyph size={size} />,
        disabledReason: gdriveConfigured
          ? undefined
          : t("backend.gdriveNotConfigured"),
      },
    ];
  }, [t]);

  const selected = options.find((o) => o.id === value) ?? options[0];

  function handlePick(opt: Option) {
    if (opt.disabledReason) return;
    setOpen(false);
    if (opt.id !== value) onSelect(opt.id);
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
          className={isLocalBackend(value) ? "text-muted" : "text-accent"}
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
          {options.map((opt) => {
            const isSelected = opt.id === value;
            const disabled = Boolean(opt.disabledReason);
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={disabled || undefined}
                  title={opt.disabledReason}
                  onClick={() => handlePick(opt)}
                  className={`flex w-full items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-mono text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                    disabled
                      ? "cursor-not-allowed text-muted opacity-50"
                      : "cursor-pointer text-fg hover:bg-surface"
                  }`}
                >
                  <span
                    aria-hidden
                    className={
                      disabled
                        ? "text-muted"
                        : isLocalBackend(opt.id)
                          ? "text-muted"
                          : "text-accent"
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
