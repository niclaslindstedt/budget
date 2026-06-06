import { useMemo, useState } from "react";
import { Drill, PaintRoller, Wrench } from "lucide-react";

import type { RepairCandidate } from "../../data/property-repairs/candidates";
import { PRESET_TYPE_RENOVATIONS_ID } from "../../data/presets/types";
import { newId } from "../../data/sheet";
import type {
  Category,
  EntryType,
  PropertyRepair,
  Settings,
  Subtype,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatShortDate } from "../../utils/format";
import { Button, ClearableInput, SelectPicker } from "../form";
import type { SelectOption } from "../form";
import { Modal } from "../Modal";
import { SubtypePicker } from "../SubtypePicker";

// The single-repair editor, shared by the "Add" and "Edit" flows.
//
// - **Add** (`repair` null): a source-transaction picker over the unused
//   Repairs / Renovations candidates, then a free-text description and a
//   subtype scoped to the chosen charge's kind. Commits one repair via
//   `onAdd` — the full flow alongside the bulk multi-select quick add.
// - **Edit** (`repair` set): the source charge is read-only (it owns the
//   date / amount / receipt); only the description and subtype are editable,
//   committed as a patch via `onUpdate`.
//
// The subtype tier is the same `Subtype` used by Items, but pinned to the
// repair's Repairs / Renovations type: the picker is fed an already-filtered
// list and a `fixedParentTypeId`, so a new subtype files under the right
// parent without a type chooser.

type Props = {
  open: boolean;
  // Edit mode when set; add mode otherwise.
  repair: PropertyRepair | null;
  // Source candidates for add mode (`findRepairCandidates`). Ignored in edit.
  candidates: RepairCandidate[];
  settings: Settings;
  subtypes: readonly Subtype[];
  types: readonly EntryType[];
  categories: readonly Category[];
  onCreateSubtype: (draft: Omit<Subtype, "id">) => Subtype;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onClose: () => void;
  onAdd: (repair: PropertyRepair) => void;
  onUpdate: (
    repairId: string,
    patch: Partial<Omit<PropertyRepair, "id">>,
  ) => void;
};

function candidateKey(c: RepairCandidate): string {
  return `${c.accountId}:${c.entryId}`;
}

export function RepairsEditModal({
  open,
  repair,
  candidates,
  settings,
  subtypes,
  types,
  categories,
  onCreateSubtype,
  onCreateType,
  onCreateCategory,
  onClose,
  onAdd,
  onUpdate,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isEdit = repair !== null;

  // Selected source charge (add mode), the editable description, and the
  // optional subtype.
  const [sourceKey, setSourceKey] = useState("");
  const [description, setDescription] = useState("");
  const [subtypeId, setSubtypeId] = useState<string | null>(null);

  useResetOnOpen(open, repair?.id ?? "add", () => {
    if (repair) {
      setSourceKey(`${repair.accountId}:${repair.sourceHistoryId}`);
      setDescription(repair.description);
      setSubtypeId(repair.subtypeId ?? null);
    } else {
      setSourceKey("");
      setDescription("");
      setSubtypeId(null);
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
    // belong under the new parent type.
    setDescription(c ? c.description : "");
    setSubtypeId(null);
  }

  function handleSubmit() {
    const desc = description.trim();
    if (repair) {
      onUpdate(repair.id, {
        description: desc,
        subtypeId: subtypeId ?? undefined,
      });
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
