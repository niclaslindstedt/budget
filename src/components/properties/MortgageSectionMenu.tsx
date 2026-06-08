import { useCallback, useRef, useState } from "react";
import {
  LayoutList,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Rows3,
} from "lucide-react";

import type { Property } from "../../data/types";
import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { FloatingPanel } from "../FloatingPanel";

type MortgageView = "unified" | "split";

type Props = {
  property: Property;
  // Whether any mortgage on the property has recorded payments — gates the
  // "View payments" entry (moved here from the property actions menu).
  hasPayments: boolean;
  // The view the card currently renders, and whether the toggle is offered at
  // all (only meaningful with two or more mortgages to collapse).
  view: MortgageView;
  canToggle: boolean;
  onToggleView: () => void;
  onAddMortgage: (property: Property) => void;
  onViewPayments: (property: Property) => void;
};

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 224 },
  anchor: "right",
  coordinateSpace: "document",
};

type MenuItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

// The "…" overflow menu in a property card's mortgage section header, sitting
// where the "Add mortgage" button used to. It collects the mortgage-level
// actions — toggle the unified ⇄ split view, add a mortgage, view recorded
// payments — so the section header stays a single trigger.
export function MortgageSectionMenu({
  property,
  hasPayments,
  view,
  canToggle,
  onToggleView,
  onAddMortgage,
  onViewPayments,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  function pick(handler: () => void) {
    setOpen(false);
    handler();
  }

  const items: MenuItem[] = [];

  if (canToggle) {
    items.push({
      key: "toggleView",
      // The label names the view the toggle switches TO, so it reads as an
      // action ("Split view" when currently unified, and vice versa).
      icon:
        view === "unified" ? (
          <Rows3 size={16} aria-hidden focusable={false} />
        ) : (
          <LayoutList size={16} aria-hidden focusable={false} />
        ),
      label:
        view === "unified"
          ? t("properties.viewSplit")
          : t("properties.viewUnified"),
      onClick: () => pick(onToggleView),
    });
  }

  items.push({
    key: "addMortgage",
    icon: <Plus size={16} aria-hidden focusable={false} />,
    label: t("properties.addMortgage"),
    onClick: () => pick(() => onAddMortgage(property)),
  });

  if (hasPayments) {
    items.push({
      key: "viewPayments",
      icon: <ReceiptText size={16} aria-hidden focusable={false} />,
      label: t("properties.viewPayments"),
      onClick: () => pick(() => onViewPayments(property)),
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
        aria-label={t("cell.moreActions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={16} aria-hidden focusable={false} />
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
