import { useEffect, useMemo, useState } from "react";
import { Home, Pencil, Plus, Search } from "lucide-react";

import { allTypes } from "../../data/presets/merge";
import type { Action } from "../../data/reducer";
import { newId } from "../../data/sheet";
import type {
  Account,
  Company,
  Mortgage,
  MortgagePayment,
  Property,
  PropertyValuePoint,
  Settings,
  Sheet,
  UserData,
} from "../../data/types";
import { useT } from "../../i18n";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { ConfirmDialog } from "../ConfirmDialog";
import { useModalDispatch } from "../modal-dispatch";
import { SheetTitleMenu, type SheetTitleMenuItem } from "../SheetTitleMenu";
import { MortgageDiscoveryModal } from "./MortgageDiscoveryModal";
import { MortgageEditorModal } from "./MortgageEditorModal";
import { PropertyCard } from "./PropertyCard";
import { PropertyEditorModal } from "./PropertyEditorModal";
import { UpdatePropertyValueModal } from "./UpdatePropertyValueModal";

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  dispatch: (action: Action) => void;
};

// A mortgage paired with the property it belongs to — the unit the
// mortgage editor / discovery modals and the per-mortgage actions need.
type MortgageRef = { property: Property; mortgage: Mortgage };

export function PropertiesPage({ sheet, data, settings, dispatch }: Props) {
  const t = useT();
  const dispatchModal = useModalDispatch();

  // Property-level modal state.
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [creatingProperty, setCreatingProperty] = useState(false);
  const [valueProperty, setValueProperty] = useState<Property | null>(null);
  const [pendingDeleteProperty, setPendingDeleteProperty] =
    useState<Property | null>(null);

  // Mortgage-level modal state, held with the parent property.
  const [editingMortgage, setEditingMortgage] = useState<MortgageRef | null>(
    null,
  );
  const [creatingMortgageFor, setCreatingMortgageFor] =
    useState<Property | null>(null);
  // The "Find mortgage payments" walk runs per property (one combined
  // transaction covers every loan), so it's a single sheet-level modal
  // opened from the "…" menu rather than per-mortgage.
  const [findOpen, setFindOpen] = useState(false);
  const [pendingDeleteMortgage, setPendingDeleteMortgage] =
    useState<MortgageRef | null>(null);

  // Land at the top of the page when switching to this sheet.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [sheet.id]);

  const accountsById = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of data.accounts) m.set(a.id, a);
    return m;
  }, [data.accounts]);

  const companiesById = useMemo(() => {
    const m = new Map<string, Company>();
    for (const c of data.companies) m.set(c.id, c);
    return m;
  }, [data.companies]);

  // The full type list (presets + user) the discovery walk resolves
  // history entries against to spot the "Mortgage" tag.
  const types = useMemo(() => allTypes(data), [data]);

  const properties = useMemo(
    () => [...data.properties].sort((a, b) => a.name.localeCompare(b.name)),
    [data.properties],
  );

  // The modals read the live record after each dispatch so an edit / add
  // is reflected immediately (held by id, resolved against `data`).
  const liveValueProperty = valueProperty
    ? (data.properties.find((p) => p.id === valueProperty.id) ?? null)
    : null;

  const hasAnyMortgage = data.properties.some((p) => p.mortgages.length > 0);

  const titleMenuItems: SheetTitleMenuItem[] = [
    ...(hasAnyMortgage
      ? [
          {
            key: "find-payments",
            icon: <Search size={16} aria-hidden focusable={false} />,
            label: t("properties.findTitle"),
            onClick: () => setFindOpen(true),
          },
        ]
      : []),
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("properties.editSheet"),
      onClick: () =>
        dispatchModal({ kind: "open-edit-sheet", sheetId: sheet.id }),
    },
  ];

  function handleCreateProperty(property: Property) {
    dispatch({ type: "addProperty", property });
    setCreatingProperty(false);
  }

  function handleEditProperty(
    propertyId: string,
    patch: Partial<Omit<Property, "id">>,
  ) {
    dispatch({ type: "updateProperty", propertyId, patch });
    setEditingProperty(null);
  }

  function handleCreateMortgage(mortgage: Mortgage) {
    if (!creatingMortgageFor) return;
    dispatch({
      type: "addMortgage",
      propertyId: creatingMortgageFor.id,
      mortgage,
    });
    setCreatingMortgageFor(null);
  }

  function handleEditMortgage(
    mortgageId: string,
    patch: Partial<Omit<Mortgage, "id">>,
  ) {
    if (!editingMortgage) return;
    dispatch({
      type: "updateMortgage",
      propertyId: editingMortgage.property.id,
      mortgageId,
      patch,
    });
    setEditingMortgage(null);
  }

  function handleAddValue(propertyId: string, point: PropertyValuePoint) {
    dispatch({ type: "addPropertyValue", propertyId, point });
  }

  function handleDeleteValue(propertyId: string, pointId: string) {
    dispatch({ type: "deletePropertyValue", propertyId, pointId });
  }

  // Mint a company and dispatch its creation, returning it synchronously
  // so the mortgage editor's picker can select it immediately. Mirrors
  // `useTaxonomyCrud`'s `onCreateCompany`.
  function handleCreateCompany(draft: Omit<Company, "id">): Company {
    const company: Company = { id: newId(), ...draft };
    dispatch({ type: "addCompany", company });
    return company;
  }

  function handleAddPayments(
    propertyId: string,
    paymentsByMortgageId: Record<string, MortgagePayment[]>,
  ) {
    dispatch({
      type: "addMortgagePaymentsForProperty",
      propertyId,
      paymentsByMortgageId,
    });
  }

  const hasProperties = properties.length > 0;

  return (
    <ActiveRowProvider>
      <section>
        <header className="mb-2 flex items-center justify-center md:mb-6">
          <h2 className="m-0">
            <SheetTitleMenu sheetName={sheet.name} items={titleMenuItems} />
          </h2>
        </header>

        <section className="mb-4 flex flex-col gap-4" data-sheet-content>
          {!hasProperties ? (
            <div className="flex flex-col items-center gap-4 rounded border border-line bg-surface px-4 py-8 text-center">
              <p className="m-0 text-sm text-muted">
                {t("properties.noProperties")}
              </p>
              <button
                type="button"
                onClick={() => setCreatingProperty(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-3 px-3 py-2 text-sm text-accent hover:bg-surface"
              >
                <Home size={16} aria-hidden focusable={false} />
                {t("properties.addProperty")}
              </button>
            </div>
          ) : (
            <>
              {properties.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  accountsById={accountsById}
                  companiesById={companiesById}
                  settings={settings}
                  onEditProperty={setEditingProperty}
                  onDeleteProperty={setPendingDeleteProperty}
                  onUpdateValue={setValueProperty}
                  onAddMortgage={setCreatingMortgageFor}
                  onEditMortgage={(property, mortgage) =>
                    setEditingMortgage({ property, mortgage })
                  }
                  onDeleteMortgage={(property, mortgage) =>
                    setPendingDeleteMortgage({ property, mortgage })
                  }
                />
              ))}
              <button
                type="button"
                onClick={() => setCreatingProperty(true)}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-line bg-surface-3 px-3 py-2 text-sm text-accent hover:bg-surface"
              >
                <Plus size={16} aria-hidden focusable={false} />
                {t("properties.addProperty")}
              </button>
            </>
          )}
        </section>

        <PropertyEditorModal
          open={editingProperty !== null || creatingProperty}
          property={editingProperty}
          companies={data.companies}
          settings={settings}
          onClose={() => {
            setEditingProperty(null);
            setCreatingProperty(false);
          }}
          onSubmit={handleEditProperty}
          onCreate={handleCreateProperty}
          onCreateCompany={handleCreateCompany}
        />

        <UpdatePropertyValueModal
          open={liveValueProperty !== null}
          property={liveValueProperty}
          settings={settings}
          onClose={() => setValueProperty(null)}
          onAddValue={handleAddValue}
          onDeleteValue={handleDeleteValue}
        />

        <MortgageEditorModal
          open={editingMortgage !== null || creatingMortgageFor !== null}
          mortgage={editingMortgage?.mortgage ?? null}
          accounts={data.accounts}
          settings={settings}
          onClose={() => {
            setEditingMortgage(null);
            setCreatingMortgageFor(null);
          }}
          onSubmit={handleEditMortgage}
          onCreate={handleCreateMortgage}
        />

        <MortgageDiscoveryModal
          open={findOpen}
          properties={data.properties}
          history={data.history}
          merchantHints={data.merchantHints}
          matchRules={data.matchRules}
          companies={data.companies}
          types={types}
          settings={settings}
          onClose={() => setFindOpen(false)}
          onAdd={handleAddPayments}
        />

        <ConfirmDialog
          open={pendingDeleteProperty !== null}
          title={t("properties.deletePropertyTitle")}
          description={
            pendingDeleteProperty
              ? t("properties.deletePropertyConfirm", {
                  name: pendingDeleteProperty.name,
                })
              : null
          }
          actions={[
            {
              label: t("properties.delete"),
              tone: "danger",
              onSelect: () => {
                if (pendingDeleteProperty)
                  dispatch({
                    type: "deleteProperty",
                    propertyId: pendingDeleteProperty.id,
                  });
                setPendingDeleteProperty(null);
              },
            },
          ]}
          onCancel={() => setPendingDeleteProperty(null)}
        />

        <ConfirmDialog
          open={pendingDeleteMortgage !== null}
          title={t("properties.deleteMortgageTitle")}
          description={
            pendingDeleteMortgage
              ? t("properties.deleteMortgageConfirm", {
                  name: pendingDeleteMortgage.mortgage.name,
                })
              : null
          }
          actions={[
            {
              label: t("properties.delete"),
              tone: "danger",
              onSelect: () => {
                if (pendingDeleteMortgage)
                  dispatch({
                    type: "deleteMortgage",
                    propertyId: pendingDeleteMortgage.property.id,
                    mortgageId: pendingDeleteMortgage.mortgage.id,
                  });
                setPendingDeleteMortgage(null);
              },
            },
          ]}
          onCancel={() => setPendingDeleteMortgage(null)}
        />
      </section>
    </ActiveRowProvider>
  );
}
