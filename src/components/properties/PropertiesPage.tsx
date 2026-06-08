import { useEffect, useMemo, useState } from "react";
import { FileDown, Home, Pencil, Plus, Search } from "lucide-react";

import { unlock } from "../../data/achievements";
import {
  newRuleMatchCache,
  resolveEntryLabels,
} from "../../data/budget/synthesis";
import { allCategories, allTypes } from "../../data/presets/merge";
import {
  findRepairCandidates,
  resolveRepairSourceRows,
} from "../../data/property-repairs/candidates";
import { hasReceipt } from "../../data/property-repairs/receipts";
import { repairMetaKey } from "../../data/property-repairs/sources";
import type { PropertyExportLookups } from "../../data/property-transfer/export";
import type { ManifestTag } from "../../data/property-transfer/manifest";
import type { PropertyAttachments } from "./usePropertyAttachments";
import type { Action } from "../../data/reducer";
import { newId } from "../../data/sheet";
import type {
  Account,
  Category,
  Company,
  EntryType,
  FileCategory,
  HistoryEntry,
  Mortgage,
  MortgagePayment,
  Property,
  PropertyRepair,
  PropertySaleEstimate,
  PropertyValuePoint,
  Settings,
  Sheet,
  Subtype,
  Tag,
  UserData,
} from "../../data/types";
import { useT } from "../../i18n";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { ConfirmDialog } from "../ConfirmDialog";
import { useModalDispatch } from "../modal-dispatch";
import {
  SheetTitleMenu,
  favoriteMenuItem,
  type SheetTitleMenuItem,
} from "../SheetTitleMenu";
import { MortgageDiscoveryModal } from "./MortgageDiscoveryModal";
import { MortgageEditorModal } from "./MortgageEditorModal";
import type { ChargeSplitUpdate } from "./MortgagePaymentEditModal";
import { MortgagePaymentsModal } from "./MortgagePaymentsModal";
import { NetSaleProfitModal } from "./NetSaleProfitModal";
import { PropertyCard } from "./PropertyCard";
import { PropertyEditorModal } from "./PropertyEditorModal";
import { PropertyExportModal } from "./PropertyExportModal";
import { PropertyFilesModal } from "./PropertyFilesModal";
import { PropertyImportModal } from "./PropertyImportModal";
import { ManualRepairModal } from "./ManualRepairModal";
import { RepairsAddModal } from "./RepairsAddModal";
import { RepairsEditModal } from "./RepairsEditModal";
import { RepairsModal } from "./RepairsModal";
import { UpdatePropertyValueModal } from "./UpdatePropertyValueModal";

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  dispatch: (action: Action) => void;
  // Property-attachment handling, threaded from AppShell — repair receipts and
  // uploaded files, both living in the per-property `properties/` store.
  attachments: PropertyAttachments;
};

// A mortgage paired with the property it belongs to — the unit the
// mortgage editor / discovery modals and the per-mortgage actions need.
type MortgageRef = { property: Property; mortgage: Mortgage };

// The page's mutually-exclusive modal set, modelled as one discriminated
// state so only one can be open at a time by construction. Each of these
// opens from a property card (or the sheet "…" menu) with the card behind it,
// so none of them stack. The repair sub-editors are deliberately NOT in here:
// they layer on top of the `repairs` modal and keep their own state.
type PropertyModalState =
  | { kind: "edit"; property: Property }
  | { kind: "create" }
  | { kind: "value"; property: Property }
  | { kind: "payments"; property: Property }
  | { kind: "repairs"; property: Property }
  | { kind: "files"; property: Property }
  | { kind: "sale"; property: Property }
  | { kind: "export"; property: Property }
  | { kind: "import" }
  | { kind: "editMortgage"; ref: MortgageRef }
  | { kind: "createMortgage"; property: Property }
  | { kind: "find" }
  | { kind: "deleteProperty"; property: Property }
  | { kind: "deleteMortgage"; ref: MortgageRef };

export function PropertiesPage({
  sheet,
  data,
  settings,
  dispatch,
  attachments,
}: Props) {
  const t = useT();
  const dispatchModal = useModalDispatch();

  // The page's single-open modal router — every property-/mortgage-action
  // modal is mutually exclusive (opened from a card or the "…" menu, with the
  // card behind it), so one discriminated state models the whole set and only
  // one modal can be open at a time. The repair sub-editors below are the
  // exception: they stack ON TOP of the `repairs` list modal.
  const [modal, setModal] = useState<PropertyModalState | null>(null);

  // Repair sub-editors — these open ON TOP of the `repairs` list modal
  // (`modal.kind === "repairs"`), so they keep their own state instead of
  // joining the mutually-exclusive router above.
  // The bulk multi-select quick-add picker.
  const [addingRepairsFor, setAddingRepairsFor] = useState<Property | null>(
    null,
  );
  // The single-repair editor — `repair: null` is add mode (with a source
  // picker), a set repair is edit mode (description + subtype only). Used for
  // transaction-backed repairs only; manual repairs route to the editor below.
  const [repairEditor, setRepairEditor] = useState<{
    property: Property;
    repair: PropertyRepair | null;
  } | null>(null);
  // The manual-repair editor — for work with no backing bank transaction
  // (older than the imported history reaches). `repair: null` is add mode;
  // a set repair is edit mode. Fields are entered directly (date, amount,
  // type, description, company, tags), not sourced from a charge.
  const [manualRepairEditor, setManualRepairEditor] = useState<{
    property: Property;
    repair: PropertyRepair | null;
  } | null>(null);

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

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const tag of data.tags) m.set(tag.id, tag);
    return m;
  }, [data.tags]);

  const categoriesById = useMemo(() => {
    const m = new Map<string, FileCategory>();
    for (const c of data.fileCategories) m.set(c.id, c);
    return m;
  }, [data.fileCategories]);

  const subtypesById = useMemo(() => {
    const m = new Map<string, Subtype>();
    for (const s of data.subtypes) m.set(s.id, s);
    return m;
  }, [data.subtypes]);

  // The full type list (presets + user) the discovery walk resolves
  // history entries against to spot the "Mortgage" tag.
  const types = useMemo(() => allTypes(data), [data]);

  const properties = useMemo(
    () => [...data.properties].sort((a, b) => a.name.localeCompare(b.name)),
    [data.properties],
  );

  // The modals read the live record after each dispatch so an edit / add
  // is reflected immediately (held by id, resolved against `data`).
  const liveProperty = (property: Property): Property | null =>
    data.properties.find((p) => p.id === property.id) ?? null;
  const liveValueProperty =
    modal?.kind === "value" ? liveProperty(modal.property) : null;
  const livePaymentsProperty =
    modal?.kind === "payments" ? liveProperty(modal.property) : null;
  const liveRepairsProperty =
    modal?.kind === "repairs" ? liveProperty(modal.property) : null;
  const liveFilesProperty =
    modal?.kind === "files" ? liveProperty(modal.property) : null;
  const liveSaleProperty =
    modal?.kind === "sale" ? liveProperty(modal.property) : null;
  const liveExportProperty =
    modal?.kind === "export" ? liveProperty(modal.property) : null;

  // The primary source bank entries behind every property's repairs, keyed by
  // `${accountId}:${entryId}`, so each repair resolves its company / tags
  // (which stay on the transaction). Scoped to the referenced ids (not all of
  // history) to keep the scan small.
  const repairSourceEntries = useMemo(() => {
    const referenced = new Set<string>();
    for (const property of data.properties) {
      for (const repair of property.repairs) {
        // Manual repairs (no backing transaction) carry their own metadata —
        // skip them here; only transaction-backed repairs reference an entry.
        if (repair.accountId && repair.sourceHistoryId)
          referenced.add(`${repair.accountId}:${repair.sourceHistoryId}`);
      }
    }
    const m = new Map<string, HistoryEntry>();
    if (referenced.size === 0) return m;
    for (const [accountId, entries] of Object.entries(data.history)) {
      for (const entry of entries) {
        const key = `${accountId}:${entry.id}`;
        if (referenced.has(key)) m.set(key, entry);
      }
    }
    return m;
  }, [data.properties, data.history]);

  // Company + tags behind each repair, keyed by `repairMetaKey` so the repairs
  // view can surface them as read-only metadata. Two sources feed it:
  // transaction-backed repairs resolve live off their primary transaction
  // (override → rule → hint) and are NOT denormalised onto the repair (editing
  // them patches the source `HistoryEntry`); manual repairs (no transaction)
  // carry their own `companyId` / `tagIds` on the repair, resolved here.
  const repairMetadata = useMemo(() => {
    const m = new Map<string, { company: Company | null; tags: Tag[] }>();
    const ruleCache = newRuleMatchCache();
    for (const [key, entry] of repairSourceEntries) {
      const { companyId, tagIds } = resolveEntryLabels(
        entry,
        data.merchantHints,
        data.matchRules,
        companiesById,
        types,
        ruleCache,
      );
      const company = companyId ? (companiesById.get(companyId) ?? null) : null;
      const tags: Tag[] = [];
      for (const id of tagIds) {
        const tag = tagsById.get(id);
        if (tag) tags.push(tag);
      }
      m.set(key, { company, tags });
    }
    for (const property of data.properties) {
      for (const repair of property.repairs) {
        if (repair.accountId && repair.sourceHistoryId) continue;
        const company = repair.companyId
          ? (companiesById.get(repair.companyId) ?? null)
          : null;
        const tags: Tag[] = [];
        for (const id of repair.tagIds ?? []) {
          const tag = tagsById.get(id);
          if (tag) tags.push(tag);
        }
        m.set(repairMetaKey(repair), { company, tags });
      }
    }
    return m;
  }, [
    repairSourceEntries,
    data.properties,
    data.merchantHints,
    data.matchRules,
    companiesById,
    tagsById,
    types,
  ]);

  // Per-property repairs summary for the card — repair count plus how many
  // lack a receipt of their own (the deductibility flag).
  function repairSummaryFor(property: Property) {
    let missingReceiptCount = 0;
    for (const repair of property.repairs) {
      if (!hasReceipt(repair)) missingReceiptCount++;
    }
    return { count: property.repairs.length, missingReceiptCount };
  }

  // Candidate charges for the add / edit flows — computed while the bulk
  // picker is open or the single-repair editor is open in either mode (add
  // builds from candidates; edit extends a repair with more transactions).
  const repairCandidatesOpen =
    addingRepairsFor !== null || repairEditor !== null;
  const repairCandidates = useMemo(
    () => (repairCandidatesOpen ? findRepairCandidates(data) : []),
    [repairCandidatesOpen, data],
  );

  // The editing repair's current sources resolved to candidate rows, so the
  // editor can render them pre-selected (a multi-transaction repair). Empty in
  // add mode.
  const editRepairSources = useMemo(
    () =>
      repairEditor?.repair
        ? resolveRepairSourceRows(data, repairEditor.repair)
        : [],
    [repairEditor, data],
  );

  // The full type / category lists (presets + user) the subtype picker in the
  // repairs editor resolves parent-type names and creation against.
  const categories = useMemo(() => allCategories(data), [data]);

  // The account the payments-view property is paid from, plus its bank
  // history keyed by id, so each charge group can resolve the original
  // transaction it was split from (its `sourceHistoryId`) for the popover.
  const paymentsAccount = livePaymentsProperty?.accountId
    ? (accountsById.get(livePaymentsProperty.accountId) ?? null)
    : null;
  const paymentsSourceTransactions = useMemo(() => {
    const m = new Map<string, HistoryEntry>();
    const accountId = livePaymentsProperty?.accountId;
    if (accountId) {
      for (const entry of data.history[accountId] ?? []) m.set(entry.id, entry);
    }
    return m;
  }, [livePaymentsProperty?.accountId, data.history]);

  const hasAnyMortgage = data.properties.some((p) => p.mortgages.length > 0);

  const titleMenuItems: SheetTitleMenuItem[] = [
    favoriteMenuItem(sheet, t, dispatchModal),
    ...(hasAnyMortgage
      ? [
          {
            key: "find-payments",
            icon: <Search size={16} aria-hidden focusable={false} />,
            label: t("properties.findTitle"),
            onClick: () => setModal({ kind: "find" }),
          },
        ]
      : []),
    {
      key: "import",
      icon: <FileDown size={16} aria-hidden focusable={false} />,
      label: t("properties.importProperty"),
      onClick: () => setModal({ kind: "import" }),
    },
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
    setModal(null);
  }

  // Mint a new file category from the inline "create" affordance on the file
  // upload form's category picker, returning it so the picker can select it.
  function handleCreateFileCategory(name: string): FileCategory {
    const category: FileCategory = { id: newId(), name };
    dispatch({ type: "addFileCategory", category });
    return category;
  }

  function handleEditProperty(
    propertyId: string,
    patch: Partial<Omit<Property, "id">>,
  ) {
    const before = data.properties.find((p) => p.id === propertyId);
    dispatch({ type: "updateProperty", propertyId, patch });
    setModal(null);
    // A renamed property changes the subfolder every repair receipt files
    // under, so move each one into the new folder.
    const nextName = patch.name;
    if (
      before &&
      typeof nextName === "string" &&
      nextName !== before.name &&
      before.repairs.some(hasReceipt)
    ) {
      void reconcilePropertyReceipts(before, nextName);
    }
  }

  // Re-file every repair receipt of a property into a (possibly new) folder,
  // sequentially so the reserved-paths set keeps two receipts off the same
  // name. Reads the resolved company off `repairMetadata` (it stays on the
  // source transaction), the description off each repair; every receipt keeps
  // its own date.
  async function reconcilePropertyReceipts(
    property: Property,
    propertyName: string,
  ) {
    const reserved = new Set<string>();
    for (const repair of property.repairs) {
      if (!repair.receipts || repair.receipts.length === 0) continue;
      const companyName =
        repairMetadata.get(repairMetaKey(repair))?.company?.name ?? "";
      const claimed = await attachments.renameRepairReceipts({
        propertyId: property.id,
        repairId: repair.id,
        receipts: repair.receipts,
        propertyName,
        companyName,
        description: repair.description,
        reservedPaths: reserved,
      });
      for (const p of claimed) reserved.add(p);
    }
  }

  function handleCreateMortgage(mortgage: Mortgage) {
    if (modal?.kind !== "createMortgage") return;
    dispatch({
      type: "addMortgage",
      propertyId: modal.property.id,
      mortgage,
    });
    setModal(null);
  }

  function handleEditMortgage(
    mortgageId: string,
    patch: Partial<Omit<Mortgage, "id">>,
  ) {
    if (modal?.kind !== "editMortgage") return;
    dispatch({
      type: "updateMortgage",
      propertyId: modal.ref.property.id,
      mortgageId,
      patch,
    });
    setModal(null);
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

  // Taxonomy minters for the repairs editor's subtype picker — mirror
  // `handleCreateCompany` / `useTaxonomyCrud` so the picker can spawn a
  // subtype (and, in the unscoped case, its parent type / category) inline.
  function handleCreateSubtype(draft: Omit<Subtype, "id">): Subtype {
    const subtype: Subtype = { id: newId(), ...draft };
    dispatch({ type: "addSubtype", subtype });
    return subtype;
  }

  function handleCreateType(draft: Omit<EntryType, "id">): EntryType {
    const entryType: EntryType = { id: newId(), ...draft };
    dispatch({ type: "addType", entryType });
    return entryType;
  }

  function handleCreateCategory(draft: Omit<Category, "id">): Category {
    const category: Category = { id: newId(), ...draft };
    dispatch({ type: "addCategory", category });
    return category;
  }

  function handleCreateTag(draft: Omit<Tag, "id">): Tag {
    const tag: Tag = { id: newId(), ...draft };
    dispatch({ type: "addTag", tag });
    return tag;
  }

  // Persist a company / tags change from the repair editor onto the SOURCE
  // bank transaction — company and tags live on the transaction, not the
  // repair, so the same metadata enriches the budget view and search.
  function handleSetEntryMetadata(
    accountId: string,
    entryId: string,
    patch: { userCompanyId?: string | null; userTagIds?: string[] },
  ) {
    dispatch({ type: "updateHistoryEntry", accountId, entryId, patch });
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

  function handleSetChargeSplit(
    propertyId: string,
    updates: ChargeSplitUpdate[],
  ) {
    dispatch({ type: "setMortgageChargeSplit", propertyId, updates });
    unlock("paymentLedger");
  }

  function handleDeletePayment(
    propertyId: string,
    mortgageId: string,
    paymentId: string,
  ) {
    dispatch({
      type: "deleteMortgagePayment",
      propertyId,
      mortgageId,
      paymentId,
    });
    unlock("paymentLedger");
  }

  function handleDeleteAllPayments(propertyId: string) {
    dispatch({ type: "deleteAllMortgagePayments", propertyId });
  }

  function handleAddRepairs(propertyId: string, repairs: PropertyRepair[]) {
    dispatch({ type: "addRepairs", propertyId, repairs });
  }

  function handleUpdateRepair(
    propertyId: string,
    repairId: string,
    patch: Partial<Omit<PropertyRepair, "id">>,
  ) {
    dispatch({ type: "updateRepair", propertyId, repairId, patch });
  }

  function handleDeleteRepair(propertyId: string, repairId: string) {
    dispatch({ type: "deleteRepair", propertyId, repairId });
  }

  // Open the net-sale-profit estimator, recording the achievement the
  // first time the user models a sale.
  function handleNetSaleProfit(property: Property) {
    setModal({ kind: "sale", property });
    unlock("netSaleProfit");
  }

  function handleSetSaleEstimate(
    propertyId: string,
    estimate: PropertySaleEstimate | undefined,
  ) {
    dispatch({ type: "setPropertySaleEstimate", propertyId, estimate });
  }

  // Denormalize the id references a property's export needs into names: the
  // lender, plus each repair's resolved company / tags (transaction-backed
  // repairs read these off their source transaction via `repairMetadata`;
  // manual repairs carry their own, also folded into `repairMetadata`).
  function buildExportLookups(property: Property): PropertyExportLookups {
    const lenderName = property.companyId
      ? companiesById.get(property.companyId)?.name
      : undefined;
    const repairMeta = new Map<
      string,
      { companyName?: string; tags: ManifestTag[] }
    >();
    for (const repair of property.repairs) {
      const key =
        repair.accountId && repair.sourceHistoryId
          ? `${repair.accountId}:${repair.sourceHistoryId}`
          : repairMetaKey(repair);
      const meta = repairMetadata.get(key);
      repairMeta.set(repair.id, {
        companyName: meta?.company?.name,
        tags: (meta?.tags ?? []).map((tag) => ({
          name: tag.name,
          color: tag.color,
        })),
      });
    }
    return { lenderName, repairMeta, categoriesById, tagsById, subtypesById };
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
                onClick={() => setModal({ kind: "create" })}
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
                  repairSummary={repairSummaryFor(property)}
                  onEditProperty={(property) =>
                    setModal({ kind: "edit", property })
                  }
                  onDeleteProperty={(property) =>
                    setModal({ kind: "deleteProperty", property })
                  }
                  onUpdateValue={(property) =>
                    setModal({ kind: "value", property })
                  }
                  onUploadFile={(property) =>
                    setModal({ kind: "files", property })
                  }
                  onNetSaleProfit={handleNetSaleProfit}
                  onViewPayments={(property) =>
                    setModal({ kind: "payments", property })
                  }
                  onViewRepairs={(property) =>
                    setModal({ kind: "repairs", property })
                  }
                  onExportProperty={(property) =>
                    setModal({ kind: "export", property })
                  }
                  onAddMortgage={(property) =>
                    setModal({ kind: "createMortgage", property })
                  }
                  onEditMortgage={(property, mortgage) =>
                    setModal({
                      kind: "editMortgage",
                      ref: { property, mortgage },
                    })
                  }
                  onDeleteMortgage={(property, mortgage) =>
                    setModal({
                      kind: "deleteMortgage",
                      ref: { property, mortgage },
                    })
                  }
                />
              ))}
              <button
                type="button"
                onClick={() => setModal({ kind: "create" })}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-line bg-surface-3 px-3 py-2 text-sm text-accent hover:bg-surface"
              >
                <Plus size={16} aria-hidden focusable={false} />
                {t("properties.addProperty")}
              </button>
            </>
          )}
        </section>

        <PropertyEditorModal
          open={modal?.kind === "edit" || modal?.kind === "create"}
          property={modal?.kind === "edit" ? modal.property : null}
          companies={data.companies}
          accounts={data.accounts}
          settings={settings}
          onClose={() => setModal(null)}
          onSubmit={handleEditProperty}
          onCreate={handleCreateProperty}
          onCreateCompany={handleCreateCompany}
        />

        <UpdatePropertyValueModal
          open={liveValueProperty !== null}
          property={liveValueProperty}
          settings={settings}
          onClose={() => setModal(null)}
          onAddValue={handleAddValue}
          onDeleteValue={handleDeleteValue}
        />

        <NetSaleProfitModal
          open={liveSaleProperty !== null}
          property={liveSaleProperty}
          settings={settings}
          onClose={() => setModal(null)}
          onSaveEstimate={handleSetSaleEstimate}
        />

        <MortgageEditorModal
          open={
            modal?.kind === "editMortgage" || modal?.kind === "createMortgage"
          }
          mortgage={modal?.kind === "editMortgage" ? modal.ref.mortgage : null}
          settings={settings}
          onClose={() => setModal(null)}
          onSubmit={handleEditMortgage}
          onCreate={handleCreateMortgage}
        />

        <MortgagePaymentsModal
          open={livePaymentsProperty !== null}
          property={livePaymentsProperty}
          settings={settings}
          account={paymentsAccount}
          sourceTransactions={paymentsSourceTransactions}
          onClose={() => setModal(null)}
          onSetChargeSplit={(updates) => {
            if (livePaymentsProperty)
              handleSetChargeSplit(livePaymentsProperty.id, updates);
          }}
          onDeletePayment={(mortgageId, paymentId) => {
            if (livePaymentsProperty)
              handleDeletePayment(
                livePaymentsProperty.id,
                mortgageId,
                paymentId,
              );
          }}
          onDeleteAll={() => {
            if (livePaymentsProperty)
              handleDeleteAllPayments(livePaymentsProperty.id);
          }}
        />

        <RepairsModal
          open={liveRepairsProperty !== null}
          property={liveRepairsProperty}
          settings={settings}
          repairMetadata={repairMetadata}
          canManageReceipt={attachments.canManage}
          onUploadReceipt={attachments.uploadRepairReceipt}
          onReplaceReceipt={attachments.replaceRepairReceipt}
          onSetReceiptDate={attachments.setRepairReceiptDate}
          onDownloadReceipt={attachments.download}
          onRemoveReceipt={attachments.removeRepairReceipt}
          onEditRepair={(repair) => {
            if (!liveRepairsProperty) return;
            // A manual repair (no backing transaction) edits its own fields;
            // a transaction-backed repair edits its source set + metadata.
            if (repair.accountId && repair.sourceHistoryId)
              setRepairEditor({ property: liveRepairsProperty, repair });
            else
              setManualRepairEditor({ property: liveRepairsProperty, repair });
          }}
          onDeleteRepair={(repairId) => {
            if (liveRepairsProperty)
              handleDeleteRepair(liveRepairsProperty.id, repairId);
          }}
          onAddSingle={() => {
            if (liveRepairsProperty)
              setRepairEditor({ property: liveRepairsProperty, repair: null });
          }}
          onQuickAdd={() => setAddingRepairsFor(liveRepairsProperty)}
          onAddManual={() => {
            if (liveRepairsProperty)
              setManualRepairEditor({
                property: liveRepairsProperty,
                repair: null,
              });
          }}
          onClose={() => setModal(null)}
        />

        <PropertyFilesModal
          open={liveFilesProperty !== null}
          property={liveFilesProperty}
          fileCategories={data.fileCategories}
          tags={data.tags}
          canManage={attachments.canManage}
          onUploadFile={(file, meta) =>
            attachments.uploadPropertyFile(liveFilesProperty!, file, meta)
          }
          onReplaceFile={(record, file) =>
            attachments.replacePropertyFile(liveFilesProperty!, record, file)
          }
          onDownloadFile={attachments.download}
          onRemoveFile={(fileId, path) =>
            attachments.removePropertyFile(liveFilesProperty!.id, fileId, path)
          }
          onUpdateFileMeta={(fileId, patch) =>
            dispatch({
              type: "updatePropertyFile",
              propertyId: liveFilesProperty!.id,
              fileId,
              patch,
            })
          }
          onCreateFileCategory={handleCreateFileCategory}
          onCreateTag={handleCreateTag}
          onClose={() => setModal(null)}
        />

        <PropertyExportModal
          open={liveExportProperty !== null}
          property={liveExportProperty}
          canManage={attachments.canManage}
          canSaveToBackend={attachments.canExportToBackend}
          onExport={(options) =>
            attachments.exportProperty(
              liveExportProperty!,
              buildExportLookups(liveExportProperty!),
              options,
            )
          }
          onSaveToBackend={attachments.saveExportToBackend}
          onClose={() => setModal(null)}
        />

        <PropertyImportModal
          open={modal?.kind === "import"}
          canManage={attachments.canManage}
          onImport={attachments.importProperty}
          onClose={() => setModal(null)}
        />

        <RepairsEditModal
          open={repairEditor !== null}
          repair={repairEditor?.repair ?? null}
          repairMeta={
            repairEditor?.repair
              ? (() => {
                  const meta = repairMetadata.get(
                    `${repairEditor.repair.accountId}:${repairEditor.repair.sourceHistoryId}`,
                  );
                  return {
                    companyId: meta?.company?.id ?? null,
                    tagIds: meta?.tags.map((tag) => tag.id) ?? [],
                  };
                })()
              : null
          }
          candidates={repairCandidates}
          existingSources={editRepairSources}
          settings={settings}
          subtypes={data.subtypes}
          types={types}
          categories={categories}
          companies={data.companies}
          tags={data.tags}
          onCreateSubtype={handleCreateSubtype}
          onCreateType={handleCreateType}
          onCreateCategory={handleCreateCategory}
          onCreateCompany={handleCreateCompany}
          onCreateTag={handleCreateTag}
          onClose={() => setRepairEditor(null)}
          onAdd={(repair) => {
            if (repairEditor)
              handleAddRepairs(repairEditor.property.id, [repair]);
          }}
          onUpdate={(repairId, patch) => {
            if (repairEditor)
              handleUpdateRepair(repairEditor.property.id, repairId, patch);
          }}
          onSetEntryMetadata={handleSetEntryMetadata}
          onReconcileReceipt={(repairId, next) => {
            if (!repairEditor) return;
            const property = data.properties.find(
              (p) => p.id === repairEditor.property.id,
            );
            const repair = property?.repairs.find((r) => r.id === repairId);
            if (!property || !repair?.receipts?.length) return;
            const companyName = next.companyId
              ? (companiesById.get(next.companyId)?.name ?? "")
              : "";
            void attachments.renameRepairReceipts({
              propertyId: property.id,
              repairId,
              receipts: repair.receipts,
              propertyName: property.name,
              companyName,
              description: next.description,
            });
          }}
        />

        <RepairsAddModal
          open={addingRepairsFor !== null}
          candidates={repairCandidates}
          settings={settings}
          onClose={() => setAddingRepairsFor(null)}
          onAdd={(repairs) => {
            if (addingRepairsFor)
              handleAddRepairs(addingRepairsFor.id, repairs);
          }}
        />

        <ManualRepairModal
          open={manualRepairEditor !== null}
          repair={manualRepairEditor?.repair ?? null}
          settings={settings}
          subtypes={data.subtypes}
          types={types}
          categories={categories}
          companies={data.companies}
          tags={data.tags}
          onCreateSubtype={handleCreateSubtype}
          onCreateType={handleCreateType}
          onCreateCategory={handleCreateCategory}
          onCreateCompany={handleCreateCompany}
          onCreateTag={handleCreateTag}
          onClose={() => setManualRepairEditor(null)}
          onAdd={(repair) => {
            if (manualRepairEditor)
              handleAddRepairs(manualRepairEditor.property.id, [repair]);
          }}
          onUpdate={(repairId, patch) => {
            if (manualRepairEditor)
              handleUpdateRepair(
                manualRepairEditor.property.id,
                repairId,
                patch,
              );
          }}
          onReconcileReceipt={(repairId, next) => {
            if (!manualRepairEditor) return;
            const property = data.properties.find(
              (p) => p.id === manualRepairEditor.property.id,
            );
            const repair = property?.repairs.find((r) => r.id === repairId);
            if (!property || !repair?.receipts?.length) return;
            const companyName = next.companyId
              ? (companiesById.get(next.companyId)?.name ?? "")
              : "";
            void attachments.renameRepairReceipts({
              propertyId: property.id,
              repairId,
              receipts: repair.receipts,
              propertyName: property.name,
              companyName,
              description: next.description,
            });
          }}
        />

        <MortgageDiscoveryModal
          open={modal?.kind === "find"}
          properties={data.properties}
          history={data.history}
          merchantHints={data.merchantHints}
          matchRules={data.matchRules}
          companies={data.companies}
          types={types}
          settings={settings}
          onClose={() => setModal(null)}
          onAdd={handleAddPayments}
        />

        <ConfirmDialog
          open={modal?.kind === "deleteProperty"}
          title={t("properties.deletePropertyTitle")}
          description={
            modal?.kind === "deleteProperty"
              ? t("properties.deletePropertyConfirm", {
                  name: modal.property.name,
                })
              : null
          }
          actions={[
            {
              label: t("properties.delete"),
              tone: "danger",
              onSelect: () => {
                if (modal?.kind === "deleteProperty")
                  dispatch({
                    type: "deleteProperty",
                    propertyId: modal.property.id,
                  });
                setModal(null);
              },
            },
          ]}
          onCancel={() => setModal(null)}
        />

        <ConfirmDialog
          open={modal?.kind === "deleteMortgage"}
          title={t("properties.deleteMortgageTitle")}
          description={
            modal?.kind === "deleteMortgage"
              ? t("properties.deleteMortgageConfirm", {
                  name: modal.ref.mortgage.name,
                })
              : null
          }
          actions={[
            {
              label: t("properties.delete"),
              tone: "danger",
              onSelect: () => {
                if (modal?.kind === "deleteMortgage")
                  dispatch({
                    type: "deleteMortgage",
                    propertyId: modal.ref.property.id,
                    mortgageId: modal.ref.mortgage.id,
                  });
                setModal(null);
              },
            },
          ]}
          onCancel={() => setModal(null)}
        />
      </section>
    </ActiveRowProvider>
  );
}
