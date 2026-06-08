import { useMemo, useState } from "react";
import { Drill, PaintRoller, Wrench } from "lucide-react";

import type { RepairCandidate } from "../../data/property-repairs/candidates";
import { PRESET_TYPE_RENOVATIONS_ID } from "../../data/presets/types";
import { newId } from "../../data/sheet";
import type {
  Category,
  Company,
  EntryType,
  PropertyRepair,
  RepairSource,
  Settings,
  Subtype,
  Tag,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatShortDate } from "../../utils/format";
import { Button, ClearableInput } from "../form";
import { Modal } from "../Modal";
import { RepairFields } from "./RepairFields";

// Resolved company / tags for the repair being edited (edit mode) — the
// seed the company + tags pickers open on. Add mode reads the same shape off
// the derived primary candidate instead. These are NOT stored on the repair:
// they live on the primary source transaction and are written back through
// `onSetEntryMetadata`.
export type RepairEntryMeta = {
  companyId: string | null;
  tagIds: readonly string[];
};

// The single-repair editor, shared by the "Add" and "Edit" flows. A repair
// groups one or more bank transactions that together paid one invoice, so the
// source picker is a multi-select checklist of charges.
//
// - **Add** (`repair` null): a multi-select over the unused Repairs /
//   Renovations candidates, then a free-text description and a subtype scoped
//   to the chosen charges' kind. The **primary** transaction (the receipt /
//   metadata anchor) is derived from the selection — the one that already
//   carries a receipt, else the most recent — and the rest become
//   `additionalSources`. Commits one repair via `onAdd`.
// - **Edit** (`repair` set): the primary transaction is pinned (it owns the
//   date / type / receipt and can't be unchecked); the description, subtype,
//   and the set of additional transactions are editable, and the company /
//   tags are edited on the PRIMARY source transaction.
//
// The subtype tier is the same `Subtype` used by Items, but pinned to the
// repair's Repairs / Renovations type: the picker is fed an already-filtered
// list and a `fixedParentTypeId`, so a new subtype files under the right
// parent without a type chooser.
//
// Company and tags are deliberately NOT stored on the repair — they belong to
// the underlying bank transaction so the same metadata enriches the budget
// view, search, and any future per-account roll-up. Editing them here patches
// the primary `HistoryEntry`'s `userCompanyId` / `userTagIds` (via
// `onSetEntryMetadata`); the repairs view resolves them back live. The pickers
// seed from the charge's effective (resolved) company / tags, and a write is
// only dispatched for a field the user actually changed.

type Props = {
  open: boolean;
  // Edit mode when set; add mode otherwise.
  repair: PropertyRepair | null;
  // The repair's primary-transaction company / tags (edit mode). Add mode
  // seeds from the derived primary candidate instead, so this is null there.
  repairMeta: RepairEntryMeta | null;
  // Unused source candidates (`findRepairCandidates`) — the charges a repair
  // can be built from or extended with.
  candidates: RepairCandidate[];
  // The edit repair's CURRENT sources resolved to candidate rows
  // (`resolveRepairSourceRows`), so they render pre-selected. Empty in add.
  existingSources: RepairCandidate[];
  settings: Settings;
  subtypes: readonly Subtype[];
  types: readonly EntryType[];
  categories: readonly Category[];
  companies: readonly Company[];
  tags: readonly Tag[];
  onCreateSubtype: (draft: Omit<Subtype, "id">) => Subtype;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  onCreateTag: (draft: Omit<Tag, "id">) => Tag;
  onClose: () => void;
  onAdd: (repair: PropertyRepair) => void;
  onUpdate: (
    repairId: string,
    patch: Partial<Omit<PropertyRepair, "id">>,
  ) => void;
  // Persist a company / tags change onto the primary bank transaction. Only
  // the fields the user changed are present in the patch.
  onSetEntryMetadata: (
    accountId: string,
    entryId: string,
    patch: { userCompanyId?: string | null; userTagIds?: string[] },
  ) => void;
  // After an edit, re-file the repair's receipt if its naming inputs changed
  // (the file name encodes company + description). Edit mode only — a new
  // repair has no receipt to move yet.
  onReconcileReceipt: (
    repairId: string,
    next: { companyId: string | null; description: string },
  ) => void;
};

function rowKey(c: RepairCandidate): string {
  return `${c.accountId}:${c.entryId}`;
}

// Pick the primary (the metadata anchor whose company / tags the row shows,
// and whose date / type the repair tracks) for a selected set of charges: the
// most recent by date. The receipt is owned by the repair, not a transaction,
// so there's no receipt-bearing charge to prefer. Returns null for an empty
// selection.
function derivePrimary(rows: RepairCandidate[]): RepairCandidate | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, r) => (r.date > best.date ? r : best), rows[0]);
}

export function RepairsEditModal({
  open,
  repair,
  repairMeta,
  candidates,
  existingSources,
  settings,
  subtypes,
  types,
  categories,
  companies,
  tags,
  onCreateSubtype,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
  onCreateTag,
  onClose,
  onAdd,
  onUpdate,
  onSetEntryMetadata,
  onReconcileReceipt,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isEdit = repair !== null;

  // The primary is pinned in edit mode (it owns the date / type / identity and
  // can't be unchecked); in add mode it's derived from the selection.
  const pinnedPrimaryKey = isEdit
    ? `${repair.accountId}:${repair.sourceHistoryId}`
    : null;

  // The selected source keys, the editable description, and the optional
  // subtype.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [description, setDescription] = useState("");
  const [subtypeId, setSubtypeId] = useState<string | null>(null);
  // Primary-transaction company / tags. Seeded from the anchor charge's
  // effective values; the seed is held alongside so submit only writes a field
  // the user actually changed (and never pins a rule / hint value as an
  // override just because the user touched the other field).
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [seedCompanyId, setSeedCompanyId] = useState<string | null>(null);
  const [seedTagIds, setSeedTagIds] = useState<readonly string[]>([]);
  // The primary key the company / tags pickers are currently seeded from, so a
  // selection change that moves the primary re-seeds them (add mode only).
  const [seededPrimaryKey, setSeededPrimaryKey] = useState<string | null>(null);

  // All rows the checklist offers: the repair's own current sources (edit
  // mode) merged with the unused candidates, deduped by key, newest-first.
  const allRows = useMemo(() => {
    const seen = new Set<string>();
    const rows: RepairCandidate[] = [];
    for (const row of [...existingSources, ...candidates]) {
      const key = rowKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return rows;
  }, [existingSources, candidates]);

  const rowByKey = useMemo(() => {
    const m = new Map<string, RepairCandidate>();
    for (const row of allRows) m.set(rowKey(row), row);
    return m;
  }, [allRows]);

  useResetOnOpen(open, repair?.id ?? "add", () => {
    if (repair) {
      const keys = existingSources.map(rowKey);
      // The pinned primary is always selected even if its entry is gone (it
      // can't be unchecked), so seed it in regardless of resolution.
      const initial = new Set(keys);
      if (pinnedPrimaryKey) initial.add(pinnedPrimaryKey);
      setSelected(initial);
      setDescription(repair.description);
      setSubtypeId(repair.subtypeId ?? null);
      const seedCompany = repairMeta?.companyId ?? null;
      const seedTags = repairMeta?.tagIds ?? [];
      setCompanyId(seedCompany);
      setTagIds([...seedTags]);
      setSeedCompanyId(seedCompany);
      setSeedTagIds(seedTags);
      setSeededPrimaryKey(pinnedPrimaryKey);
    } else {
      setSelected(new Set());
      setDescription("");
      setSubtypeId(null);
      setCompanyId(null);
      setTagIds([]);
      setSeedCompanyId(null);
      setSeedTagIds([]);
      setSeededPrimaryKey(null);
    }
  });

  const selectedRows = useMemo(
    () => allRows.filter((r) => selected.has(rowKey(r))),
    [allRows, selected],
  );

  const primary = useMemo(() => {
    if (pinnedPrimaryKey) return rowByKey.get(pinnedPrimaryKey) ?? null;
    return derivePrimary(selectedRows);
  }, [pinnedPrimaryKey, rowByKey, selectedRows]);

  // The Repairs / Renovations type that scopes the subtype list and the header
  // glyph: fixed in edit mode, derived from the primary charge in add.
  const typeId = isEdit ? repair.typeId : (primary?.typeId ?? null);

  const totalAmount = useMemo(
    () => selectedRows.reduce((sum, r) => sum + r.amount, 0),
    [selectedRows],
  );

  const scopedSubtypes = useMemo(
    () => (typeId ? subtypes.filter((s) => s.typeId === typeId) : []),
    [subtypes, typeId],
  );

  // Toggle a charge in / out of the selection. The pinned primary (edit mode)
  // can't be removed. In add mode a toggle that moves the derived primary
  // re-seeds the description / company / tags from the new anchor, mirroring
  // the old single-source picker's "change source → reseed" behaviour.
  function toggleSource(key: string) {
    if (key === pinnedPrimaryKey) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (!isEdit) reseedFromSelection(next);
      return next;
    });
  }

  function reseedFromSelection(nextSelected: ReadonlySet<string>) {
    const rows = allRows.filter((r) => nextSelected.has(rowKey(r)));
    const nextPrimary = derivePrimary(rows);
    const nextKey = nextPrimary ? rowKey(nextPrimary) : null;
    if (nextKey === seededPrimaryKey) return;
    setSeededPrimaryKey(nextKey);
    setDescription(nextPrimary ? nextPrimary.description : "");
    const seedCompany = nextPrimary?.companyId ?? null;
    const seedTags = nextPrimary?.tagIds ?? [];
    setCompanyId(seedCompany);
    setTagIds([...seedTags]);
    setSeedCompanyId(seedCompany);
    setSeedTagIds([...seedTags]);
  }

  // Persist the company / tags change onto the primary transaction — but only
  // the fields the user actually changed, so a rule- / hint-derived value
  // isn't silently pinned as a per-entry override.
  function persistEntryMetadata(accountId: string, entryId: string) {
    const patch: { userCompanyId?: string | null; userTagIds?: string[] } = {};
    if (companyId !== seedCompanyId) patch.userCompanyId = companyId;
    const seedTagSet = new Set(seedTagIds);
    const tagsChanged =
      tagIds.length !== seedTagIds.length ||
      tagIds.some((id) => !seedTagSet.has(id));
    if (tagsChanged) patch.userTagIds = tagIds;
    if (patch.userCompanyId !== undefined || patch.userTagIds !== undefined) {
      onSetEntryMetadata(accountId, entryId, patch);
    }
  }

  // The additional sources (everything but the primary) for the current
  // selection, in checklist order.
  function additionalSourcesFor(primaryRow: RepairCandidate): RepairSource[] {
    const primaryKey = rowKey(primaryRow);
    return selectedRows
      .filter((r) => rowKey(r) !== primaryKey)
      .map((r) => ({ accountId: r.accountId, entryId: r.entryId }));
  }

  function handleSubmit() {
    if (!primary) return;
    const desc = description.trim();
    const additional = additionalSourcesFor(primary);

    if (repair) {
      const patch: Partial<Omit<PropertyRepair, "id">> = {
        description: desc,
        subtypeId: subtypeId ?? undefined,
        amount: totalAmount,
        additionalSources: additional.length > 0 ? additional : undefined,
      };
      onUpdate(repair.id, patch);
      // This editor only handles transaction-backed repairs (manual ones route
      // to `ManualRepairModal`), so the primary source pair is always present.
      if (repair.accountId && repair.sourceHistoryId)
        persistEntryMetadata(repair.accountId, repair.sourceHistoryId);
      // Re-file the repair's receipt if its company / description changed —
      // the receipt name encodes both. A no-op when nothing relevant moved.
      onReconcileReceipt(repair.id, { companyId, description: desc });
      onClose();
      return;
    }

    const next: PropertyRepair = {
      id: newId(),
      date: primary.date,
      amount: totalAmount,
      description: desc,
      typeId: primary.typeId,
      accountId: primary.accountId,
      sourceHistoryId: primary.entryId,
    };
    if (subtypeId) next.subtypeId = subtypeId;
    if (additional.length > 0) next.additionalSources = additional;
    onAdd(next);
    persistEntryMetadata(primary.accountId, primary.entryId);
    onClose();
  }

  if (!open) return null;

  const hasSelection = selectedRows.length > 0;
  const canSubmit = hasSelection;
  const isRenovation = typeId === PRESET_TYPE_RENOVATIONS_ID;
  const HeaderGlyph = !hasSelection
    ? Wrench
    : isRenovation
      ? PaintRoller
      : Drill;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="repair-editor-title"
      size="max-w-lg"
    >
      <Modal.Header
        icon={<HeaderGlyph size={14} aria-hidden focusable={false} />}
        title={
          isEdit
            ? t("properties.repairEditorEditTitle")
            : t("properties.repairEditorAddTitle")
        }
        onClose={onClose}
      />
      <Modal.Body>
        {!isEdit && allRows.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-muted">
            {t("properties.repairSourceEmpty")}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted">
                  {t("properties.repairSourcesLabel")}
                </span>
                {hasSelection && (
                  <span className="text-xs text-muted tabular-nums">
                    {(selectedRows.length === 1
                      ? t("properties.repairSourcesCountOne", {
                          count: selectedRows.length,
                        })
                      : t("properties.repairSourcesCountOther", {
                          count: selectedRows.length,
                        })) +
                      " · " +
                      formatBalance(totalAmount, settings, {
                        neverAbbreviate: true,
                      })}
                  </span>
                )}
              </span>
              <ul className="m-0 flex max-h-64 list-none flex-col gap-1.5 overflow-y-auto p-0">
                {allRows.map((row) => {
                  const key = rowKey(row);
                  return (
                    <SourceRow
                      key={key}
                      row={row}
                      settings={settings}
                      lang={lang}
                      checked={selected.has(key)}
                      pinned={key === pinnedPrimaryKey}
                      onToggle={() => toggleSource(key)}
                    />
                  );
                })}
              </ul>
            </div>

            {hasSelection && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("properties.repairDescriptionLabel")}
                  </span>
                  <ClearableInput
                    value={description}
                    onValueChange={setDescription}
                    placeholder={t("properties.repairDescriptionPlaceholder")}
                    className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                  />
                </label>

                <RepairFields
                  subtypes={scopedSubtypes}
                  types={types}
                  categories={categories}
                  companies={companies}
                  tags={tags}
                  subtypeId={subtypeId}
                  onSubtypeChange={setSubtypeId}
                  fixedParentTypeId={typeId ?? undefined}
                  companyId={companyId}
                  onCompanyChange={setCompanyId}
                  tagIds={tagIds}
                  onTagsChange={setTagIds}
                  showEntryHints
                  onCreateSubtype={onCreateSubtype}
                  onCreateType={onCreateType}
                  onCreateCategory={onCreateCategory}
                  onCreateCompany={onCreateCompany}
                  onCreateTag={onCreateTag}
                />
              </>
            )}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {t("common.save")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function SourceRow({
  row,
  settings,
  lang,
  checked,
  pinned,
  onToggle,
}: {
  row: RepairCandidate;
  settings: Settings;
  lang: ReturnType<typeof useLang>;
  checked: boolean;
  // The pinned primary (edit mode) can't be unchecked.
  pinned: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const isRenovation = row.typeId === PRESET_TYPE_RENOVATIONS_ID;
  const Glyph = isRenovation ? PaintRoller : Drill;
  const typeLabel = isRenovation
    ? t("properties.repairTypeRenovations")
    : t("properties.repairTypeRepairs");

  return (
    <li>
      <label
        className={`flex cursor-pointer items-center gap-2.5 rounded border border-line bg-surface-2 px-3 py-2 text-sm hover:bg-surface${
          pinned ? " cursor-default opacity-90" : ""
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={pinned}
          onChange={onToggle}
          className="size-4 shrink-0 accent-accent"
        />
        <Glyph
          size={16}
          className="shrink-0 text-accent"
          aria-label={typeLabel}
          focusable={false}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-fg-bright">
            {row.description || typeLabel}
          </span>
          <span className="block truncate text-xs text-muted tabular-nums">
            {formatShortDate(row.date, settings.shortDateFormat, lang)}
          </span>
        </span>
        <span className="shrink-0 tabular-nums text-fg-bright">
          {formatBalance(row.amount, settings, { neverAbbreviate: true })}
        </span>
      </label>
    </li>
  );
}
