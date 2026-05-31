import { useCallback, useRef, useState } from "react";
import { Pencil } from "lucide-react";

import { normaliseDescription } from "../../data/description-normaliser";
import {
  useAutoTypeForCompany,
  useDesktopAutoFocus,
  useResetOnOpen,
} from "../../hooks";
import { useLang, useT } from "../../i18n";
import type {
  Category,
  Company,
  EntryType,
  HistoryEntry,
  PrimaryIncomeMerchant,
  Settings,
  Tag,
} from "../../data/types";
import { formatBalance, formatShortDate } from "../../utils/format";
import { parseInt32 } from "../../utils/parse";
import { CompanyPicker } from "../CompanyPicker";
import { Button, Checkbox, ClearableInput } from "../form";
import { Modal } from "../Modal";
import { TagsPicker } from "../TagsPicker";
import { TypePicker } from "../TypePicker";

// Per-entry edit modal opened by the pen button on a synthesized
// history row. Edits the `userDescription` and `userTypeId` overrides
// on a single `HistoryEntry` — those wins out over `MatchRule` and
// `MerchantHint` in `synthesizeHistoryRow`. The original bank
// description is rendered read-only at the top of the body so the
// user can see what the statement actually said while typing the
// override. Date / amount / completed are bank-authoritative and not
// editable here; relabelling every entry that shares a description
// goes through the wildcard rule modal (the tags button) instead.

type Props = {
  open: boolean;
  entry: HistoryEntry | null;
  categories: readonly Category[];
  types: readonly EntryType[];
  companies: readonly Company[];
  tags: readonly Tag[];
  // companyId → suggested typeId for the auto-fill, and companyId →
  // ranked hint typeIds for the picker's "Suggested" band. See
  // `src/data/budget/company-type-hints.ts`.
  companyTypeSuggestions: ReadonlyMap<string, string>;
  companyTypeHints: ReadonlyMap<string, readonly string[]>;
  settings: Settings;
  primaryIncomeMerchants: readonly PrimaryIncomeMerchant[];
  onClose: () => void;
  onSubmit: (patch: {
    userDescription: string;
    userTypeId: string | null;
    userCompanyId: string | null;
    userTagIds: string[];
    noCompany: boolean;
  }) => void;
  // Toggle the primary-income flag for the merchant this entry
  // represents. The reducer captures the entry's normalised
  // description as the key and walks every other entry that matches
  // to stamp / clear the cascade. Fired straight from the toggle so
  // the change applies independently of the row's main save.
  onSetPrimaryIncome: (
    entryId: string,
    isPrimaryIncome: boolean,
    anchorDayOfMonth: number | null,
  ) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  onCreateTag: (draft: Omit<Tag, "id">) => Tag;
};

export function EditHistoryEntryModal({
  open,
  entry,
  categories,
  types,
  companies,
  tags,
  companyTypeSuggestions,
  companyTypeHints,
  settings,
  primaryIncomeMerchants,
  onClose,
  onSubmit,
  onSetPrimaryIncome,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
  onCreateTag,
}: Props) {
  const t = useT();
  const lang = useLang();

  const initialDescription = entry?.userDescription ?? "";
  const initialTypeId = entry?.userTypeId ?? null;
  const initialCompanyId = entry?.userCompanyId ?? null;
  const initialTagIds = entry?.userTagIds ?? [];
  const initialNoCompany = entry?.noCompany ?? false;

  // Resolve the persisted primary-income flag for this entry's
  // normalised description. Anchor day falls back to the user's
  // configured `startOfMonth` so a first-time toggle picks a sensible
  // default without prompting.
  const entryKey = entry ? normaliseDescription(entry.description) : "";
  const matchedMerchant = primaryIncomeMerchants.find(
    (m) => m.key === entryKey,
  );
  const initialIsPrimary = matchedMerchant !== undefined;
  const initialAnchorDay =
    matchedMerchant?.anchorDayOfMonth ?? settings.startOfMonth;

  const [description, setDescription] = useState(initialDescription);
  const [typeId, setTypeId] = useState<string | null>(initialTypeId);
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId);
  const autoTypeForPickedCompany = useAutoTypeForCompany(
    typeId,
    companyTypeSuggestions,
  );
  const handlePickCompany = useCallback(
    (next: string | null) => {
      setCompanyId(next);
      const auto = autoTypeForPickedCompany(next);
      if (auto !== undefined) setTypeId(auto);
    },
    [autoTypeForPickedCompany],
  );
  const [noCompany, setNoCompany] = useState(initialNoCompany);
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
  const [isPrimaryIncome, setIsPrimaryIncome] = useState(initialIsPrimary);
  const [anchorDayText, setAnchorDayText] = useState(String(initialAnchorDay));

  const descriptionRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(descriptionRef, open && !!entry, entry?.id);

  useResetOnOpen(open, entry?.id, () => {
    setDescription(initialDescription);
    setTypeId(initialTypeId);
    setCompanyId(initialCompanyId);
    setNoCompany(initialNoCompany);
    setTagIds(initialTagIds);
    setIsPrimaryIncome(initialIsPrimary);
    setAnchorDayText(String(initialAnchorDay));
  });

  const handleSubmit = useCallback(() => {
    if (!entry) return;
    // Empty (after trim) clears the override — the reducer normalises
    // to absent so the synthesized row falls back to the rule / hint /
    // raw bank text the next render.
    onSubmit({
      userDescription: description.trim(),
      userTypeId: typeId,
      userCompanyId: companyId,
      userTagIds: tagIds,
      noCompany,
    });
  }, [entry, description, typeId, companyId, tagIds, noCompany, onSubmit]);

  if (!open || !entry) return null;

  return (
    <Modal
      open={open && !!entry}
      onClose={onClose}
      labelledBy="edit-history-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<Pencil size={14} aria-hidden focusable={false} />}
        title={t("editHistory.title")}
        onClose={onClose}
      />
      <Modal.Body>
        <p className="mb-3 text-sm text-muted">{t("editHistory.hint")}</p>
        <fieldset className="mb-4 flex flex-col gap-1.5 rounded border border-line bg-surface-3 p-3">
          <legend className="px-1 text-xs text-muted">
            {t("editHistory.originalDescription")}
          </legend>
          <div className="flex flex-wrap items-baseline gap-2 text-xs">
            <span className="font-mono text-muted">
              {formatShortDate(entry.date, settings.shortDateFormat, lang)}
            </span>
            <span
              className={`font-mono tabular-nums ${
                entry.amount < 0 ? "text-negative" : "text-positive"
              }`}
            >
              {formatBalance(entry.amount, settings)}
            </span>
          </div>
          <p className="font-mono text-sm break-words whitespace-pre-wrap text-fg">
            {entry.description || "—"}
          </p>
        </fieldset>
        <div className="grid gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("editHistory.company")}
            </span>
            <CompanyPicker
              variant="field"
              companies={companies}
              selectedId={companyId}
              noCompany={noCompany}
              onSelect={handlePickCompany}
              onOmitChange={setNoCompany}
              onCreate={onCreateCompany}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("editHistory.type")}</span>
            <TypePicker
              variant="field"
              types={types}
              categories={categories}
              selectedId={typeId}
              onSelect={setTypeId}
              onCreate={onCreateType}
              onCreateCategory={onCreateCategory}
              hintTypeIds={
                companyId ? (companyTypeHints.get(companyId) ?? []) : []
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("editHistory.tags")}</span>
            <TagsPicker
              tags={tags}
              selectedIds={tagIds}
              onChange={setTagIds}
              onCreate={onCreateTag}
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("editHistory.description")}
            </span>
            <ClearableInput
              ref={descriptionRef}
              value={description}
              onValueChange={setDescription}
              placeholder={t("editHistory.descriptionPlaceholder")}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>
        </div>
        {entry && entry.amount > 0 && entryKey !== "" && (
          <fieldset className="mt-5 rounded border border-line bg-surface-3 p-3">
            <legend className="px-1 text-xs text-muted">
              {t("editHistory.primaryIncomeTitle")}
            </legend>
            <Checkbox
              checked={isPrimaryIncome}
              onChange={(next) => {
                setIsPrimaryIncome(next);
                const day = parseInt32(anchorDayText);
                const dayClamped =
                  day !== null && day >= 1 && day <= 31
                    ? day
                    : settings.startOfMonth;
                onSetPrimaryIncome(entry.id, next, next ? dayClamped : null);
              }}
              label={t("editHistory.primaryIncomeToggle")}
              className="items-center"
            />
            <p className="mt-2 text-xs text-muted">
              {t("editHistory.primaryIncomeHelp")}
            </p>
            {isPrimaryIncome && (
              <label className="mt-3 flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("editHistory.primaryIncomeAnchorDay")}
                </span>
                <ClearableInput
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={1}
                  max={31}
                  value={anchorDayText}
                  onValueChange={(next) => {
                    setAnchorDayText(next);
                    const day = parseInt32(next);
                    if (day !== null && day >= 1 && day <= 31) {
                      onSetPrimaryIncome(entry.id, true, day);
                    }
                  }}
                  aria-label={t("editHistory.primaryIncomeAnchorDay")}
                  wrapperClassName="min-w-0"
                  className="field-input w-24 min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                />
              </label>
            )}
          </fieldset>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit}>
          {t("common.save")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
