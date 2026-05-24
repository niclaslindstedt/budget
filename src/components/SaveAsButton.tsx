import { useRef, useState } from "react";
import { ChevronDown, Save } from "lucide-react";

import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { FloatingPanel } from "./FloatingPanel";

export type SaveAsFormat = "pdf" | "xlsx" | "csv";

type Props = {
  onPick: (format: SaveAsFormat) => void;
  disabled?: boolean;
};

// Routed through `FloatingPanel` so the menu lifts out of any modal
// stacking context — matches the FormatPicker pattern in DownloadModal.
const MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 160 },
  anchor: "right",
  coordinateSpace: "viewport",
};

// Shared "Save as" action menu used by the two read-only viewer
// modals (SheetViewerModal, HistoryModal). Renders a single button
// with a chevron; the dropdown picks PDF / XLSX / CSV and forwards
// the choice to the parent. No persistent selection — clicking an
// item closes the menu and invokes `onPick`.
export function SaveAsButton({ onPick, disabled }: Props) {
  const t = useT();
  const triggerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const options: { id: SaveAsFormat; label: string }[] = [
    { id: "pdf", label: t("download.format.pdf") },
    { id: "xlsx", label: t("download.format.xlsx") },
    { id: "csv", label: t("download.format.csv") },
  ];

  const pick = (id: SaveAsFormat) => {
    setOpen(false);
    onPick(id);
  };

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("download.saveAs")}
        title={t("download.saveAsTitle")}
        className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded px-2 text-xs text-muted hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 sm:h-8"
      >
        <Save size={16} aria-hidden focusable={false} />
        <span className="hidden sm:inline">{t("download.saveAs")}</span>
        <ChevronDown
          size={12}
          className="shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>
      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={MENU_PLACEMENT}
      >
        <ul role="menu" className="overflow-hidden py-1">
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                role="menuitem"
                onClick={() => pick(opt.id)}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span className="flex-1 truncate">{opt.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </FloatingPanel>
    </div>
  );
}
