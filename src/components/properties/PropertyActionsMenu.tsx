import {
  Calculator,
  Paperclip,
  Pencil,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";

import type { Property } from "../../data/types";
import { useT } from "../../i18n";
import { ActionsMenu } from "../form/ActionsMenu";
import { type MenuItem } from "../form/menu";

type Props = {
  property: Property;
  onUploadFile: (property: Property) => void;
  onNetSaleProfit: (property: Property) => void;
  onAddMortgage: (property: Property) => void;
  onExportProperty: (property: Property) => void;
  onEditProperty: (property: Property) => void;
  onDeleteProperty: (property: Property) => void;
};

// The "…" overflow menu in a property card's header. Collapses the
// per-property actions (upload file, net sale profit, add mortgage, export,
// edit, delete) into one trigger so the header stays uncluttered as the action
// set grows. Updating the recorded value is reached by pressing the
// current-value figure in the card's stat grid; visualizing value and viewing
// repairs are their own glyph buttons to the left of this menu. View payments
// and find payments are glyph buttons in the mortgage section.
export function PropertyActionsMenu({
  property,
  onUploadFile,
  onNetSaleProfit,
  onAddMortgage,
  onExportProperty,
  onEditProperty,
  onDeleteProperty,
}: Props) {
  const t = useT();

  const items: MenuItem[] = [
    {
      key: "addMortgage",
      icon: <Plus size={16} aria-hidden focusable={false} />,
      label: t("properties.addMortgage"),
      onClick: () => onAddMortgage(property),
    },
    {
      key: "uploadFile",
      icon: <Paperclip size={16} aria-hidden focusable={false} />,
      label: t("properties.uploadFile"),
      onClick: () => onUploadFile(property),
    },
    {
      key: "netSaleProfit",
      icon: <Calculator size={16} aria-hidden focusable={false} />,
      label: t("properties.netSaleProfit"),
      onClick: () => onNetSaleProfit(property),
    },
    {
      key: "exportProperty",
      icon: <Share2 size={16} aria-hidden focusable={false} />,
      label: t("properties.exportProperty"),
      onClick: () => onExportProperty(property),
    },
    {
      key: "editProperty",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("properties.editProperty"),
      onClick: () => onEditProperty(property),
    },
    {
      key: "deleteProperty",
      icon: <Trash2 size={16} aria-hidden focusable={false} />,
      label: t("properties.deleteProperty"),
      danger: true,
      onClick: () => onDeleteProperty(property),
    },
  ];

  return (
    <ActionsMenu
      items={items}
      ariaLabel={t("cell.moreActions")}
      // Card-header trigger, not the swipe-strip "…" — a quiet icon
      // button matching the header's other glyph buttons.
      triggerClassName="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
    />
  );
}
