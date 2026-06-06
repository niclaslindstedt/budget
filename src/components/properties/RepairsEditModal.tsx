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
  Settings,
  Subtype,
  Tag,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatShortDate } from "../../utils/format";
import { CompanyPicker } from "../CompanyPicker";
import { Button, ClearableInput, SelectPicker } from "../form";
import type { SelectOption } from "../form";
import { Modal } from "../Modal";
import { SubtypePicker } from "../SubtypePicker";
import { TagsPicker } from "../TagsPicker";

// Resolved company / tags for the repair being edited (edit mode) — the
// seed the company + tags pickers open on. Add mode reads the same shape off
// the selected candidate instead. These are NOT stored on the repair: they
// live on the source transaction and are written back through
// `onSetEntryMetadata`.
export type RepairEntryMeta = {
  companyId: string | null;
  tagIds: readonly string[];
};

// The single-repair editor, shared by the "Add" and "Edit" flows.
//
// - **Add** (`repair` null): a source-transaction picker over the unused
//   Repairs / Renovations candidates, then a free-text description and a
//   subtype scoped to the chosen charge's kind. Commits one repair via
//   `onAdd` — the full flow alongside the bulk multi-select quick add.
// - **Edit** (`repair` set): the source charge is read-only (it owns the
//   date / amount / receipt); the description and subtype are editable on the
//   repair, while the company and tags are edited on the SOURCE TRANSACTION.
//
// The subtype tier is the same `Subtype` used by Items, but pinned to the
// repair's Repairs / Renovations type: the picker is fed an already-filtered
// list and a `fixedParentTypeId`, so a new subtype files under the right
// parent without a type chooser.
//
// Company and tags are deliberately NOT stored on the repair — they belong to
// the underlying bank transaction so the same metadata enriches the budget
// view, search, and any future per-account roll-up. Editing them here patches
// the source `HistoryEntry`'s `userCompanyId` / `userTagIds` (via
// `onSetEntryMetadata`); the repairs view resolves them back live. The pickers
// seed from the charge's effective (resolved) company / tags, and a write is
// only dispatched for a field the user actually changed.

type Props = {
  open: boolean;
  // Edit mode when set; add mode otherwise.
  repair: PropertyRepair | null;
  // The repair's source-transaction company / tags (edit mode). Add mode
  // seeds from the selected candidate instead, so this is null there.
  repairMeta: RepairEntryMeta | null;
  // Source candidates for add mode (`findRepairCandidates`). Ignored in edit.
  candidates: RepairCandidate[];
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
  // Persist a company / tags change onto the source bank transaction. Only
  // the fields the user changed are present in the patch.
  onSetEntryMetadata: (
    accountId: string,
    entryId: string,
    patch: { userCompanyId?: string | null; userTagIds?: string[] },
  ) => void;
};

function candidateKey(c: RepairCandidate): string {
  return `${c.accountId}:${c.entryId}`;
}

export function RepairsEditModal({
  open,
  repair,
  repairMeta,
  candidates,
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
}: Props) {
  const t = useT();
  const lang = useLang();
  const isEdit = repair !== null;

  // Selected source charge (add mode), the editable description, and the
  // optional subtype.
  const [sourceKey, setSourceKey] = useState("");
  const [description, setDescription] = useState("");
  const [subtypeId, setSubtypeId] = useState<string | null>(null);
  // Source-transaction company / tags. Seeded from the charge's effective
  // values; the seed is held alongside so submit only writes a field the
  // user actually changed (and never pins a rule / hint value as an override
  // just because the user touched the other field).
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [seedCompanyId, setSeedCompanyId] = useState<string | null>(null);
  const [seedTagIds, setSeedTagIds] = useState<readonly string[]>([]);

  useResetOnOpen(open, repair?.id ?? "add", () => {
    if (repair) {
      setSourceKey(`${repair.accountId}:${repair.sourceHistoryId}`);
      setDescription(repair.description);
      setSubtypeId(repair.subtypeId ?? null);
      const seedCompany = repairMeta?.companyId ?? null;
      const seedTags = repairMeta?.tagIds ?? [];
      setCompanyId(seedCompany);
      setTagIds([...seedTags]);
      setSeedCompanyId(seedCompany);
      setSeedTagIds(seedTags);
    } else {
      setSourceKey("");
      setDescription("");
      setSubtypeId(null);
      setCompanyId(null);
      setTagIds([]);
      setSeedCompanyId(null);
      setSeedTagIds([]);
    }
  });

  const selectedCandidate = useMemo(
    () =>
      isEdit
        ? null
        : (candidates.find((c) => candidateKey(c) === sourceKey) ?? null),
    [isEdit, candidates, sourceKey],
  );

  // The Repairs / Renovations type that scopes the subtype list and the
  // header glyph: fixed in edit mode, derived from the chosen charge in add.
  const typeId = isEdit ? repair.typeId : (selectedCandidate?.typeId ?? null);

  const scopedSubtypes = useMemo(
    () => (typeId ? subtypes.filter((s) => s.typeId === typeId) : []),
    [subtypes, typeId],
  );

  const typeLabel = (id: string | null) =>
    id === PRESET_TYPE_RENOVATIONS_ID
      ? t("properties.repairTypeRenovations")
      : t("properties.repairTypeRepairs");

  function handleSelectSource(key: string) {
    setSourceKey(key);
    const c = candidates.find((cd) => candidateKey(cd) === key);
    // Prefill the description from the charge and clear the subtype — a
    // different charge may be a different kind, so a stale subtype wouldn't
    // belong under the new parent type. Seed the company / tags pickers from
    // the new charge's effective values too.
    setDescription(c ? c.description : "");
    setSubtypeId(null);
    const seedCompany = c?.companyId ?? null;
    const seedTags = c?.tagIds ?? [];
    setCompanyId(seedCompany);
    setTagIds([...seedTags]);
    setSeedCompanyId(seedCompany);
    setSeedTagIds(seedTags);
  }

  // Persist the company / tags change onto the source transaction — but only
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

  function handleSubmit() {
    const desc = description.trim();
    if (repair) {
      onUpdate(repair.id, {
        description: desc,
        subtypeId: subtypeId ?? undefined,
      });
      persistEntryMetadata(repair.accountId, repair.sourceHistoryId);
      onClose();
      return;
    }
    const c = selectedCandidate;
    if (!c) return;
    const next: PropertyRepair = {
      id: newId(),
      date: c.date,
      amount: c.amount,
      description: desc,
      typeId: c.typeId,
      accountId: c.accountId,
      sourceHistoryId: c.entryId,
    };
    if (subtypeId) next.subtypeId = subtypeId;
    onAdd(next);
    persistEntryMetadata(c.accountId, c.entryId);
    onClose();
  }

  if (!open) return null;

  const hasSource = typeId !== null;
  const canSubmit = isEdit || selectedCandidate !== null;
  const isRenovation = typeId === PRESET_TYPE_RENOVATIONS_ID;
  const HeaderGlyph = !hasSource ? Wrench : isRenovation ? PaintRoller : Drill;

  const sourceOptions: SelectOption<string>[] = candidates.map((c) => ({
    value: candidateKey(c),
    label: c.description || typeLabel(c.typeId),
    hint: `${formatShortDate(c.date, settings.shortDateFormat, lang)} · ${formatBalance(
      c.amount,
      settings,
      { neverAbbreviate: true },
    )}`,
  }));

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
        {!isEdit && candidates.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-muted">
            {t("properties.repairSourceEmpty")}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("properties.repairSourceLabel")}
              </span>
              {isEdit ? (
                <span className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg">
                  <span className="min-w-0 flex-1 truncate">
                    {repair.description || typeLabel(repair.typeId)}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {formatShortDate(
                      repair.date,
                      settings.shortDateFormat,
                      lang,
                    )}
                  </span>
                  <span className="shrink-0 text-sm text-fg-bright tabular-nums">
                    {formatBalance(repair.amount, settings, {
                      neverAbbreviate: true,
                    })}
                  </span>
                </span>
              ) : (
                <SelectPicker
                  value={sourceKey}
                  options={sourceOptions}
                  onChange={handleSelectSource}
                  ariaLabel={t("properties.repairSourceLabel")}
                  panelClassName="max-h-64 overflow-y-auto"
                  renderValue={(option) =>
                    option ? (
                      option.label
                    ) : (
                      <span className="text-muted">
                        {t("properties.repairSourcePlaceholder")}
                      </span>
                    )
                  }
                />
              )}
            </label>

            {hasSource && (
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

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("properties.repairSubtypeLabel")}
                  </span>
                  <SubtypePicker
                    subtypes={scopedSubtypes}
                    types={types}
                    categories={categories}
                    selectedId={subtypeId}
                    onSelect={setSubtypeId}
                    onCreate={onCreateSubtype}
                    onCreateType={onCreateType}
                    onCreateCategory={onCreateCategory}
                    fixedParentTypeId={typeId ?? undefined}
                    placeholder={t("properties.repairSubtypePlaceholder")}
                  />
                </label>

                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("properties.repairCompanyLabel")}
                  </span>
                  <CompanyPicker
                    variant="field"
                    companies={companies}
                    selectedId={companyId}
                    onSelect={setCompanyId}
                    onCreate={onCreateCompany}
                  />
                  <span className="text-xs text-muted">
                    {t("properties.repairCompanyHint")}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("properties.repairTagsLabel")}
                  </span>
                  <TagsPicker
                    tags={tags}
                    selectedIds={tagIds}
                    onChange={setTagIds}
                    onCreate={onCreateTag}
                  />
                  <span className="text-xs text-muted">
                    {t("properties.repairTagsHint")}
                  </span>
                </div>
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
