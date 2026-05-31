import { useEffect, useMemo, useState } from "react";
import { Calendar, Coins, Pencil, Plus, Tag, Wrench } from "lucide-react";

import { computeItemCurrentValue, isItemOwned } from "../../data/items/value";
import type { Settings, Sheet, UserData } from "../../data/types";
import { useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance } from "../../utils/format";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { ConfirmDialog } from "../ConfirmDialog";
import { useModalDispatch } from "../modal-dispatch";
import { SheetTitleMenu, type SheetTitleMenuItem } from "../SheetTitleMenu";
import { ItemRow } from "./ItemRow";

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  // Routed to the `deleteItem` action by AppShell. The page owns the
  // confirmation step; the callback only fires once the user confirms.
  onDeleteItem: (itemId: string) => void;
};

export function ItemsPage({ sheet, data, settings, onDeleteItem }: Props) {
  const t = useT();
  const dispatchModal = useModalDispatch();
  // Pending delete confirmation: the item id + name the trash button
  // armed, or null when no confirmation is open.
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const today = todayIso();
  // Only currently-owned items are shown; disposed items stay in the
  // catalog (still referenced by past line items) but don't clutter the
  // "things we own" view. Sorted by name for a stable, scannable list.
  const ownedItems = useMemo(
    () =>
      data.items
        .filter(isItemOwned)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data.items],
  );

  // Footer totals across the visible items — an at-a-glance "net worth
  // in stuff" figure, mirroring the accounts page's balance roll-up.
  const totals = useMemo(() => {
    let purchase = 0;
    let current = 0;
    for (const item of ownedItems) {
      if (item.purchasePrice !== undefined) purchase += item.purchasePrice;
      current += computeItemCurrentValue(item, today);
    }
    return { purchase, current };
  }, [ownedItems, today]);

  // Switching to the Items overview from another sheet lands the user at
  // the top of the page. Keyed on `sheet.id` so it only fires on the
  // actual switch, never on a row edit that re-renders the component.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [sheet.id]);

  const titleMenuItems: SheetTitleMenuItem[] = [
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("sheet.editSheet"),
      onClick: () =>
        dispatchModal({ kind: "open-edit-sheet", sheetId: sheet.id }),
    },
  ];

  return (
    <ActiveRowProvider>
      <section>
        <header className="mb-2 flex items-center justify-center md:mb-6">
          <h2 className="m-0">
            <SheetTitleMenu sheetName={sheet.name} items={titleMenuItems} />
          </h2>
        </header>

        <section className="mb-6" data-sheet-content>
          <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
            {t("itemsSheet.title")}
          </h3>
          <div className="overflow-clip rounded border border-line bg-surface">
            <table className="items-table w-full border-collapse text-sm md:text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface-3 text-xs font-bold tracking-wider uppercase text-muted">
                  <th
                    scope="col"
                    className="w-10 px-2.5 py-2 text-center"
                    aria-label={t("itemsSheet.name")}
                  >
                    <Tag
                      size={16}
                      className="inline-block shrink-0 text-accent"
                      aria-hidden
                      focusable={false}
                    />
                  </th>
                  <th
                    scope="col"
                    className="px-2.5 py-2 text-left"
                    aria-label={t("itemsSheet.name")}
                  >
                    <span className="hidden md:inline">
                      {t("itemsSheet.name")}
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="items-purchased-cell hidden px-2.5 py-2 text-right md:table-cell"
                    aria-label={t("itemsSheet.purchased")}
                  >
                    <span className="inline-flex items-center justify-end gap-1.5 md:gap-2">
                      <Calendar
                        size={16}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("itemsSheet.purchased")}
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="px-2.5 py-2 text-right"
                    aria-label={t("itemsSheet.purchaseValue")}
                  >
                    <span className="hidden md:inline">
                      {t("itemsSheet.purchaseValue")}
                    </span>
                    <Coins
                      size={16}
                      className="inline-block shrink-0 text-accent md:hidden"
                      aria-hidden
                      focusable={false}
                    />
                  </th>
                  <th
                    scope="col"
                    className="px-2.5 py-2 text-right"
                    aria-label={t("itemsSheet.currentValue")}
                  >
                    <span className="inline-flex items-center justify-end gap-1.5 md:gap-2">
                      <Coins
                        size={16}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("itemsSheet.currentValue")}
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="items-action-cell w-24 px-2.5 py-2"
                    aria-label={t("itemsSheet.actions")}
                  >
                    <span className="flex items-center justify-center gap-1.5 md:gap-2">
                      <Wrench
                        size={16}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("itemsSheet.actions")}
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ownedItems.length === 0 && (
                  <tr className="items-fullspan">
                    <td
                      colSpan={6}
                      className="px-3 py-6 text-center text-xs text-muted"
                    >
                      {t("itemsSheet.noItems")}
                    </td>
                  </tr>
                )}
                {ownedItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    settings={settings}
                    todayIso={today}
                    onEditItem={(itemId) =>
                      dispatchModal({ kind: "open-edit-item", itemId })
                    }
                    onDeleteItem={(itemId, name) =>
                      setPendingDelete({ id: itemId, name })
                    }
                  />
                ))}
                {ownedItems.length > 0 && (
                  <tr className="border-t border-line bg-surface-3 font-mono text-xs font-bold text-fg-bright">
                    <td className="px-2.5 py-2" />
                    <td className="px-2.5 py-2 text-left tracking-wider uppercase text-muted">
                      {t("itemsSheet.total")}
                    </td>
                    <td className="items-purchased-cell hidden md:table-cell" />
                    <td className="px-2.5 py-2 text-right tabular-nums">
                      <span>{formatBalance(totals.purchase, settings)}</span>
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums">
                      <span>{formatBalance(totals.current, settings)}</span>
                    </td>
                    <td className="items-action-cell px-2.5 py-2" />
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} className="bg-surface-3 p-0">
                    <button
                      type="button"
                      onClick={() =>
                        dispatchModal({ kind: "open-create-item" })
                      }
                      className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-3 py-2 text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    >
                      <Plus size={16} aria-hidden focusable={false} />
                      {t("itemsSheet.addItem")}
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("itemsSheet.deleteItemTitle")}
        description={
          pendingDelete
            ? t("itemsSheet.deleteItemAria", { name: pendingDelete.name })
            : null
        }
        actions={[
          {
            label: t("items.deleteItem"),
            tone: "danger",
            onSelect: () => {
              if (pendingDelete) onDeleteItem(pendingDelete.id);
              setPendingDelete(null);
            },
          },
        ]}
        onCancel={() => setPendingDelete(null)}
      />
    </ActiveRowProvider>
  );
}
