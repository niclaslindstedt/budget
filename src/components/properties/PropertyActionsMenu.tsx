import { useCallback, useRef, useState } from "react";
import {
  Calculator,
  MoreHorizontal,
  Paperclip,
  Pencil,
  ReceiptText,
  Share2,
  TrendingUp,
  Trash2,
  Wrench,
} from "lucide-react";

import type { Property } from "../../data/types";
import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { FloatingPanel } from "../FloatingPanel";

type Props = {
  property: Property;
  // Whether any mortgage on the property has recorded payments — gates the
  // "View payments" entry, mirroring the old inline button's condition.
  hasPayments: boolean;
  // Repairs whose source charge lacks a receipt — surfaces a small dot on
  // the trigger and a count suffix on the "View repairs" entry.
  missingReceiptCount: number;
  onUpdateValue: (property: Property) => void;
  onUploadFile: (property: Property) => void;
  onNetSaleProfit: (property: Property) => void;
  onViewPayments: (property: Property) => void;
  onViewRepairs: (property: Property) => void;
  onExportProperty: (property: Property) => void;
  onEditProperty: (property: Property) => void;
  onDeleteProperty: (property: Property) => void;
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
  danger?: boolean;
  onClick: () => void;
};

// The "…" overflow menu in a property card's header. Collapses the
// per-property actions (update value, net sale profit, view payments /
// repairs, edit, delete) into one trigger so the header stays uncluttered
// as the action set grows. The danger dot on the trigger flags repairs
// missing a receipt the way the old inline wrench button did.
export function PropertyActionsMenu({
  property,
  hasPayments,
  missingReceiptCount,
  onUpdateValue,
  onUploadFile,
  onNetSaleProfit,
  onViewPayments,
  onViewRepairs,
  onExportProperty,
  onEditProperty,
  onDeleteProperty,
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
      key: "updateValue",
      icon: <TrendingUp size={16} aria-hidden focusable={false} />,
      label: t("properties.updateValue"),
      onClick: () => pick(() => onUpdateValue(property)),
    },
    {
      key: "uploadFile",
      icon: <Paperclip size={16} aria-hidden focusable={false} />,
      label: t("properties.uploadFile"),
      onClick: () => pick(() => onUploadFile(property)),
    },
    {
      key: "netSaleProfit",
      icon: <Calculator size={16} aria-hidden focusable={false} />,
      label: t("properties.netSaleProfit"),
      onClick: () => pick(() => onNetSaleProfit(property)),
    },
  ];

  if (hasPayments) {
    items.push({
      key: "viewPayments",
      icon: <ReceiptText size={16} aria-hidden focusable={false} />,
      label: t("properties.viewPayments"),
      onClick: () => pick(() => onViewPayments(property)),
    });
  }

  items.push({
    key: "viewRepairs",
    icon: <Wrench size={16} aria-hidden focusable={false} />,
    label:
      missingReceiptCount > 0
        ? t("properties.viewRepairsMissing", { count: missingReceiptCount })
        : t("properties.viewRepairs"),
    onClick: () => pick(() => onViewRepairs(property)),
  });

  items.push(
    {
      key: "exportProperty",
      icon: <Share2 size={16} aria-hidden focusable={false} />,
      label: t("properties.exportProperty"),
      onClick: () => pick(() => onExportProperty(property)),
    },
    {
      key: "editProperty",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("properties.editProperty"),
      onClick: () => pick(() => onEditProperty(property)),
    },
    {
      key: "deleteProperty",
      icon: <Trash2 size={16} aria-hidden focusable={false} />,
      label: t("properties.deleteProperty"),
      danger: true,
      onClick: () => pick(() => onDeleteProperty(property)),
    },
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="relative cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
        aria-label={t("cell.moreActions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={16} aria-hidden focusable={false} />
        {missingReceiptCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-danger"
            aria-hidden
          />
        )}
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
                className={`flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-mono text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                  it.danger ? "text-danger" : "text-fg"
                }`}
              >
                <span
                  aria-hidden
                  className={it.danger ? "text-danger" : "text-accent"}
                >
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
