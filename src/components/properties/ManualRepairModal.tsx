import { useMemo, useState, type ReactNode } from "react";
import { Drill, PaintRoller } from "lucide-react";

import {
  PRESET_TYPE_RENOVATIONS_ID,
  PRESET_TYPE_REPAIRS_ID,
} from "../../data/presets/types";
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
import { useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatAmountForInput, parseAmount } from "../../utils/format";
import { Button, ClearableInput } from "../form";
import { Modal } from "../Modal";
import { RepairFields } from "./RepairFields";

// The manual-repair editor — a repair / renovation with NO backing bank
// transaction, for work older than the imported bank history reaches (or paid
// in a way the ledger never saw). Unlike `RepairsEditModal`, which sources a
// repair from one or more charges and resolves its company / tags off the
// primary transaction, every field here is entered directly and stored on the
// repair itself: date, amount, type (Repairs / Renovations), description,
// subtype, company, and tags. Shared by the add (`repair` null) and edit
// (`repair` set) flows.
//
// Not `centered`: the amount / description fields open the soft keyboard, so
// the modal keeps the default fullscreen-on-mobile layout whose visual-viewport
// math keeps the footer above the keyboard.

type Props = {
  open: boolean;
  // Edit mode when set; add mode otherwise.
  repair: PropertyRepair | null;
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
  // After an edit, re-file the repair's receipt if its naming inputs changed
  // (the file name encodes company + description). A no-op when nothing
  // relevant moved or there's no receipt yet.
  onReconcileReceipt: (
    repairId: string,
    next: { companyId: string | null; description: string },
  ) => void;
};

const FIELD_CLASS =
  "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";
// Native `<input type="date">` keeps the intrinsic width of its editing
// controls on iOS WebKit and won't shrink to a `w-full` container, so it omits
// `w-full` and sizes to its content (matches every other date field).
const DATE_CLASS =
  "field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

export function ManualRepairModal({
  open,
  repair,
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
  onReconcileReceipt,
}: Props) {
  const t = useT();
  const isEdit = repair !== null;

  const [typeId, setTypeId] = useState(PRESET_TYPE_REPAIRS_ID);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [subtypeId, setSubtypeId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);

  useResetOnOpen(open, repair?.id ?? "add", () => {
    setTypeId(repair?.typeId ?? PRESET_TYPE_REPAIRS_ID);
    setDate(repair?.date ?? todayIso());
    setAmount(
      repair ? formatAmountForInput(Math.abs(repair.amount), settings) : "",
    );
    setDescription(repair?.description ?? "");
    setSubtypeId(repair?.subtypeId ?? null);
    setCompanyId(repair?.companyId ?? null);
    setTagIds(repair?.tagIds ? [...repair.tagIds] : []);
  });

  // Subtypes scoped to the chosen Repairs / Renovations type (the picker files
  // a freshly-created subtype under it via `fixedParentTypeId`).
  const scopedSubtypes = useMemo(
    () => subtypes.filter((s) => s.typeId === typeId),
    [subtypes, typeId],
  );

  if (!open) return null;

  // Switching type clears a subtype that belonged to the old type — a subtype
  // files under exactly one parent.
  function pickType(nextTypeId: string) {
    if (nextTypeId === typeId) return;
    setTypeId(nextTypeId);
    setSubtypeId(null);
  }

  const parsedAmount = parseAmount(amount);
  const amountValue = parsedAmount !== null ? Math.abs(parsedAmount) : null;
  const canSubmit = amountValue !== null && amountValue > 0 && date !== "";

  function handleSubmit() {
    if (!canSubmit || amountValue === null) return;
    const desc = description.trim();
    if (repair) {
      const patch: Partial<Omit<PropertyRepair, "id">> = {
        date,
        amount: amountValue,
        description: desc,
        typeId,
        subtypeId: subtypeId ?? undefined,
        companyId: companyId ?? undefined,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
      };
      onUpdate(repair.id, patch);
      onReconcileReceipt(repair.id, { companyId, description: desc });
      onClose();
      return;
    }
    const next: PropertyRepair = {
      id: newId(),
      date,
      amount: amountValue,
      description: desc,
      typeId,
    };
    if (subtypeId) next.subtypeId = subtypeId;
    if (companyId) next.companyId = companyId;
    if (tagIds.length > 0) next.tagIds = tagIds;
    onAdd(next);
    onClose();
  }

  const isRenovation = typeId === PRESET_TYPE_RENOVATIONS_ID;
  const HeaderGlyph = isRenovation ? PaintRoller : Drill;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="manual-repair-title"
      size="max-w-md"
    >
      <Modal.Header
        icon={<HeaderGlyph size={14} aria-hidden focusable={false} />}
        title={
          isEdit
            ? t("properties.manualRepairEditTitle")
            : t("properties.manualRepairAddTitle")
        }
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.repairTypeLabel")}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <TypeButton
                active={!isRenovation}
                glyph={<Drill size={16} aria-hidden focusable={false} />}
                label={t("properties.repairTypeRepairs")}
                onClick={() => pickType(PRESET_TYPE_REPAIRS_ID)}
              />
              <TypeButton
                active={isRenovation}
                glyph={<PaintRoller size={16} aria-hidden focusable={false} />}
                label={t("properties.repairTypeRenovations")}
                onClick={() => pickType(PRESET_TYPE_RENOVATIONS_ID)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("properties.repairDateLabel")}
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={DATE_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("properties.repairAmountLabel")}
              </span>
              <ClearableInput
                value={amount}
                onValueChange={setAmount}
                inputMode="decimal"
                placeholder={t("properties.repairAmountPlaceholder")}
                className={`${FIELD_CLASS} text-right font-mono tabular-nums`}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.repairDescriptionLabel")}
            </span>
            <ClearableInput
              value={description}
              onValueChange={setDescription}
              placeholder={t("properties.repairDescriptionPlaceholder")}
              className={FIELD_CLASS}
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
            fixedParentTypeId={typeId}
            companyId={companyId}
            onCompanyChange={setCompanyId}
            tagIds={tagIds}
            onTagsChange={setTagIds}
            onCreateSubtype={onCreateSubtype}
            onCreateType={onCreateType}
            onCreateCategory={onCreateCategory}
            onCreateCompany={onCreateCompany}
            onCreateTag={onCreateTag}
          />
        </div>
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

function TypeButton({
  active,
  glyph,
  label,
  onClick,
}: {
  active: boolean;
  glyph: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex cursor-pointer items-center justify-center gap-1.5 rounded border px-3 py-2 text-sm ${
        active
          ? "border-accent bg-surface-2 text-accent"
          : "border-line bg-surface-2 text-fg hover:bg-surface"
      }`}
    >
      {glyph}
      {label}
    </button>
  );
}
