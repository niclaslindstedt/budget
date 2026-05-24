import { useCallback, useRef, useState } from "react";
import { Download, Eye, MoreHorizontal, Pencil } from "lucide-react";

import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { FloatingPanel } from "./FloatingPanel";

type Props = {
  sheetName: string;
  onEdit: () => void;
  // Optional — only the budget sheet exposes a read-only viewer.
  // The accounts sheet has no equivalent surface, so it omits this.
  onView?: () => void;
  onDownload: () => void;
};

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 180 },
  anchor: "left",
  coordinateSpace: "document",
};

type MenuItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

// Overflow menu beside each sheet's title. Replaces the row of inline
// edit / view / download glyphs so the header stays uncluttered. Reuses
// the FloatingPanel shell — same dismissal / portal / focus-restore
// behaviour as the other dropdowns in the app.
export function SheetTitleMenu({
  sheetName,
  onEdit,
  onView,
  onDownload,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  function pick(handler: () => void) {
    setOpen(false);
    handler();
  }

  const items: MenuItem[] = [
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("sheet.editSheet"),
      onClick: () => pick(onEdit),
    },
  ];
  if (onView) {
    items.push({
      key: "view",
      icon: <Eye size={16} aria-hidden focusable={false} />,
      label: t("sheet.viewModeTitle"),
      onClick: () => pick(onView),
    });
  }
  items.push({
    key: "download",
    icon: <Download size={16} aria-hidden focusable={false} />,
    label: t("download.downloadSheet"),
    onClick: () => pick(onDownload),
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("sheet.moreActionsAria", { name: sheetName })}
        title={t("sheet.moreActions")}
        className="inline-flex cursor-pointer items-center justify-center rounded p-1 text-muted opacity-70 hover:bg-surface-2 hover:text-fg-bright hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
      >
        <MoreHorizontal size={14} aria-hidden focusable={false} />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        placement={PLACEMENT}
        className="overflow-hidden"
      >
        <ul role="menu" className="py-1">
          {items.map((it) => (
            <li key={it.key} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={it.onClick}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-mono text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span aria-hidden className="text-accent">
                  {it.icon}
                </span>
                <span className="flex-1 truncate">{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </FloatingPanel>
    </>
  );
}
