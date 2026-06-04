import { useCallback, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

import type { Sheet } from "../data/types";
import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { tintFill } from "../utils/tint";
import { FloatingPanel } from "./FloatingPanel";
import { CategoryIconGlyph } from "./icons";
import { useModalDispatch } from "./modal-dispatch";

type Props = {
  sheets: Sheet[];
  activeSheetId: string;
  onSelectSheet: (id: string) => void;
};

// Sheet dropdown in the page header — the complete, always-reachable
// sheet list. It complements the BottomBar tab strip rather than
// replacing it: the strip shows the sheets that fit and is deliberately
// non-scrolling (a horizontal scroller inside the sticky bar breaks iOS
// composited scrolling — see the comment in BottomBar), so a sheet that
// overflows the strip has no other handle. This dropdown is that handle.
//
// The panel itself scrolls vertically when the list is long, but it is a
// portalled FloatingPanel, not a descendant of the sticky chrome, so the
// iOS compositing trap does not apply.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 224 },
  anchor: "left",
  coordinateSpace: "viewport",
};

export function SheetSwitcher({ sheets, activeSheetId, onSelectSheet }: Props) {
  const t = useT();
  const dispatchModal = useModalDispatch();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const active = sheets.find((s) => s.id === activeSheetId) ?? sheets[0];

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("sheetTabs.switchSheet")}
        title={t("sheetTabs.switchSheet")}
        className={`inline-flex h-9 max-w-[12rem] cursor-pointer items-center gap-1.5 rounded border px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
          open
            ? "border-accent bg-accent/15"
            : "border-line hover:border-fg hover:bg-surface-2"
        }`}
        style={active ? { color: active.color } : undefined}
      >
        {active && <CategoryIconGlyph name={active.glyph} size={16} />}
        <span className="hidden max-w-[8rem] truncate text-sm font-bold tracking-wide sm:inline">
          {active?.name}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          focusable={false}
          className="shrink-0 text-muted"
        />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        placement={PLACEMENT}
      >
        <div
          role="menu"
          aria-label={t("sheetTabs.tablistLabel")}
          className="flex max-h-[60vh] flex-col overflow-y-auto py-1"
        >
          {sheets.map((sheet) => {
            const isActive = sheet.id === activeSheetId;
            return (
              <button
                key={sheet.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setOpen(false);
                  onSelectSheet(sheet.id);
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
                style={{
                  backgroundColor: isActive ? tintFill(sheet.color) : undefined,
                }}
              >
                <span className="shrink-0" style={{ color: sheet.color }}>
                  <CategoryIconGlyph name={sheet.glyph} size={16} />
                </span>
                <span
                  className="min-w-0 flex-1 truncate font-bold"
                  style={{ color: sheet.color }}
                >
                  {sheet.name}
                </span>
                {isActive && (
                  <Check
                    size={14}
                    aria-hidden
                    focusable={false}
                    className="shrink-0 text-accent"
                  />
                )}
              </button>
            );
          })}
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              dispatchModal({ kind: "open-new-sheet" });
            }}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-accent hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
          >
            <Plus size={16} aria-hidden focusable={false} />
            <span className="font-bold">{t("sheetTabs.newSheet")}</span>
          </button>
        </div>
      </FloatingPanel>
    </div>
  );
}
