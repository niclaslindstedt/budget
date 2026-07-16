import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { LOANS_GLYPH_NAMES, SHEET_COLORS } from "../../data/constants/taxonomy";
import { LOAN_KINDS } from "../../data/loans/presets";
import { normalizeName } from "../../data/normalize";
import type {
  CategoryIcon,
  Company,
  Loan,
  LoanKind,
  Mortgage,
  Property,
  Settings,
} from "../../data/types";
import { useDesktopAutoFocus, useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { formatAmountForInput } from "../../utils/format";
import { tintBorder, tintFill } from "../../utils/tint";
import { ColorPalette } from "../ColorPalette";
import { CompanyPicker } from "../CompanyPicker";
import {
  Button,
  Checkbox,
  ClearableInput,
  ClearableTextarea,
  DateField,
  FormSection,
  SelectPicker,
  type SelectOption,
} from "../form";
import { GlyphPicker } from "../GlyphPicker";
import { Modal } from "../Modal";
import { CategoryIconGlyph } from "../icons";
import { LOAN_KIND_GLYPH, LOAN_KIND_LABEL_KEY } from "./loan-kind";

export type LoanDraft = {
  name: string;
  kind: LoanKind;
  description: string;
  glyph: CategoryIcon | null;
  color: string | null;
  // Term fields as raw input text; the dialog hook parses them. Empty =
  // unset. All ignored when `link` is set (terms resolve from the
  // mortgage); `startSum` is also empty for a student loan — CSN debt has
  // no single starting principal, so that kind anchors on Update balance.
  startDate: string;
  startSum: string;
  rate: string;
  startFee: string;
  // kind === "personal": the person's name. Empty = unset.
  lenderName: string;
  // kind === "private" | "car": the lending company. Null = unset.
  companyId: string | null;
  // kind === "mortgage": the linked property mortgages (one property,
  // any subset of its mortgages — the bank draws them as one combined
  // charge), or null for a simple (unlinked) mortgage loan.
  link: { propertyId: string; mortgageIds: string[] } | null;
};

type Props = {
  open: boolean;
  // When set, the modal opens in edit mode and pre-fills its fields from
  // the loan. When null it's the create form. Edit mode surfaces a Delete
  // button.
  loan: Loan | null;
  settings: Settings;
  properties: readonly Property[];
  companies: readonly Company[];
  // Mortgages already linked by OTHER loans — excluded from the link
  // picker so two loans can't shadow one mortgage.
  linkedMortgageIds: ReadonlySet<string>;
  onClose: () => void;
  onSave: (draft: LoanDraft) => void;
  onDelete?: () => void;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
};

const DEFAULT_COLOR = SHEET_COLORS[0];
// SelectPicker value for the "not linked" option of the property picker.
const LINK_NONE = "";

// Not `centered`: the name / amount fields open the soft keyboard.
export function LoanModal({
  open,
  loan,
  settings,
  properties,
  companies,
  linkedMortgageIds,
  onClose,
  onSave,
  onDelete,
  onCreateCompany,
}: Props) {
  const t = useT();
  const isEdit = loan !== null;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LoanKind>("mortgage");
  const [description, setDescription] = useState("");
  const [glyph, setGlyph] = useState<CategoryIcon | null>(null);
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [startDate, setStartDate] = useState("");
  const [startSum, setStartSum] = useState("");
  const [rate, setRate] = useState("");
  const [startFee, setStartFee] = useState("");
  const [lenderName, setLenderName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  // The mortgage link: a property (LINK_NONE = unlinked) plus the subset
  // of its mortgages this loan covers. One property only — its combined
  // monthly charge is a single bank transaction.
  const [linkPropertyId, setLinkPropertyId] = useState<string>(LINK_NONE);
  const [linkMortgageIds, setLinkMortgageIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const nameRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(nameRef, open);

  useResetOnOpen(open, loan?.id ?? null, () => {
    setName(loan?.name ?? "");
    setKind(loan?.kind ?? "mortgage");
    setDescription(loan?.description ?? "");
    setGlyph(loan?.glyph ?? null);
    setColor(loan?.color ?? DEFAULT_COLOR);
    setStartDate(loan?.startDate ?? "");
    setStartSum(
      loan?.startSum !== undefined
        ? formatAmountForInput(loan.startSum, settings)
        : "",
    );
    setRate(loan?.rate !== undefined ? String(loan.rate) : "");
    setStartFee(
      loan?.startFee !== undefined
        ? formatAmountForInput(loan.startFee, settings)
        : "",
    );
    setLenderName(loan?.lenderName ?? "");
    setCompanyId(loan?.companyId ?? null);
    const hasLink =
      loan?.propertyId !== undefined &&
      loan.mortgageIds !== undefined &&
      loan.mortgageIds.length > 0;
    setLinkPropertyId(hasLink ? loan.propertyId! : LINK_NONE);
    setLinkMortgageIds(new Set(hasLink ? loan.mortgageIds : []));
  });

  const kindOptions: SelectOption<string>[] = LOAN_KINDS.map((k) => ({
    value: k,
    label: t(LOAN_KIND_LABEL_KEY[k]),
  }));

  // A mortgage is linkable when no OTHER loan already links it (the ones
  // this loan links stay offered so edit round-trips).
  const ownIds = new Set(loan?.mortgageIds ?? []);
  const linkableByProperty = new Map<string, Mortgage[]>();
  for (const property of properties) {
    const linkable = property.mortgages.filter(
      (m) => !linkedMortgageIds.has(m.id) || ownIds.has(m.id),
    );
    if (linkable.length > 0) linkableByProperty.set(property.id, linkable);
  }
  const propertyOptions: SelectOption<string>[] = [
    { value: LINK_NONE, label: t("loansSheet.linkNone") },
    ...properties
      .filter((p) => linkableByProperty.has(p.id))
      .map((p) => ({ value: p.id, label: p.name })),
  ];
  const hasLinkableMortgages = propertyOptions.length > 1;
  const linkableMortgages =
    linkPropertyId === LINK_NONE
      ? []
      : (linkableByProperty.get(linkPropertyId) ?? []);
  const checkedMortgageIds = linkableMortgages
    .map((m) => m.id)
    .filter((id) => linkMortgageIds.has(id));
  const isLinked =
    kind === "mortgage" &&
    linkPropertyId !== LINK_NONE &&
    checkedMortgageIds.length > 0;

  // Picking a property starts with every linkable mortgage ticked — a
  // property's charge usually covers all of them; untick to narrow.
  function handlePickProperty(propertyId: string) {
    setLinkPropertyId(propertyId);
    setLinkMortgageIds(
      new Set(
        propertyId === LINK_NONE
          ? []
          : (linkableByProperty.get(propertyId) ?? []).map((m) => m.id),
      ),
    );
  }

  function toggleLinkMortgage(mortgageId: string) {
    setLinkMortgageIds((prev) => {
      const next = new Set(prev);
      if (next.has(mortgageId)) next.delete(mortgageId);
      else next.add(mortgageId);
      return next;
    });
  }

  const trimmedName = normalizeName(name);
  const canSave = trimmedName !== null;

  function handleSave() {
    if (trimmedName === null) return;
    const link: LoanDraft["link"] = isLinked
      ? { propertyId: linkPropertyId, mortgageIds: checkedMortgageIds }
      : null;
    onSave({
      name: trimmedName,
      kind,
      description: description.trim(),
      glyph,
      color,
      startDate: isLinked ? "" : startDate,
      startSum: isLinked || kind === "student" ? "" : startSum.trim(),
      rate: isLinked ? "" : rate.trim(),
      startFee: isLinked ? "" : startFee.trim(),
      lenderName: kind === "personal" ? lenderName.trim() : "",
      companyId: kind === "private" || kind === "car" ? companyId : null,
      link,
    });
    onClose();
  }

  const inputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";
  const monoInputClass = `${inputClass} font-mono`;
  const amountPlaceholder = formatAmountForInput(0, settings);

  return (
    <Modal open={open} onClose={onClose} labelledBy="loan-modal-title">
      <Modal.Header
        icon={<CategoryIconGlyph name="hand-coins" size={14} />}
        title={isEdit ? t("loansSheet.editTitle") : t("loansSheet.newTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border"
              style={{
                color,
                backgroundColor: tintFill(color),
                borderColor: tintBorder(color),
              }}
            >
              <CategoryIconGlyph
                name={glyph ?? LOAN_KIND_GLYPH[kind]}
                size={22}
              />
            </div>
            <FormSection
              as="label"
              className="min-w-0 flex-1"
              label={t("loansSheet.name")}
            >
              <ClearableInput
                value={name}
                onValueChange={setName}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSave) {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                wrapperClassName="w-full min-w-0"
                className={inputClass}
                placeholder={t("loansSheet.namePlaceholder")}
                ref={nameRef}
              />
            </FormSection>
          </div>

          <FormSection label={t("loansSheet.kind")}>
            <SelectPicker
              value={kind}
              options={kindOptions}
              onChange={(next) => setKind(next as LoanKind)}
              ariaLabel={t("loansSheet.kind")}
            />
          </FormSection>

          {kind === "mortgage" && (
            <FormSection label={t("loansSheet.linkMortgage")}>
              {hasLinkableMortgages ? (
                <SelectPicker
                  value={linkPropertyId}
                  options={propertyOptions}
                  onChange={handlePickProperty}
                  ariaLabel={t("loansSheet.linkMortgage")}
                />
              ) : (
                <p className="m-0 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
                  {t("loansSheet.noMortgagesToLink")}
                </p>
              )}
              {linkPropertyId !== LINK_NONE && linkableMortgages.length > 0 && (
                <div className="flex flex-col gap-1 rounded border border-line bg-surface-2 px-3 py-2">
                  {linkableMortgages.map((mortgage) => (
                    <Checkbox
                      key={mortgage.id}
                      checked={linkMortgageIds.has(mortgage.id)}
                      onChange={() => toggleLinkMortgage(mortgage.id)}
                      label={mortgage.name}
                    />
                  ))}
                </div>
              )}
              {isLinked && (
                <p className="m-0 text-xs text-muted">
                  {t("loansSheet.linkedHint")}
                </p>
              )}
            </FormSection>
          )}

          {kind === "personal" && (
            <FormSection as="label" label={t("loansSheet.lenderName")}>
              <ClearableInput
                value={lenderName}
                onValueChange={setLenderName}
                placeholder={t("loansSheet.lenderNamePlaceholder")}
                wrapperClassName="w-full min-w-0"
                className={inputClass}
              />
            </FormSection>
          )}

          {(kind === "private" || kind === "car") && (
            <FormSection label={t("loansSheet.company")}>
              <CompanyPicker
                companies={companies}
                selectedId={companyId}
                onSelect={setCompanyId}
                onCreate={onCreateCompany}
                variant="field"
              />
            </FormSection>
          )}

          {!isLinked && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <FormSection
                  as="label"
                  className="min-w-0"
                  label={t("loansSheet.startDate")}
                >
                  <DateField value={startDate} onChange={setStartDate} />
                </FormSection>
                {kind !== "student" && (
                  <FormSection
                    as="label"
                    className="min-w-0"
                    label={t("loansSheet.startSum")}
                  >
                    <ClearableInput
                      value={startSum}
                      onValueChange={setStartSum}
                      inputMode="decimal"
                      placeholder={amountPlaceholder}
                      wrapperClassName="w-full min-w-0"
                      className={monoInputClass}
                    />
                  </FormSection>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <FormSection
                  as="label"
                  className="min-w-0"
                  label={t("loansSheet.rateLabel")}
                >
                  <ClearableInput
                    value={rate}
                    onValueChange={setRate}
                    inputMode="decimal"
                    placeholder="0"
                    wrapperClassName="w-full min-w-0"
                    className={monoInputClass}
                  />
                </FormSection>
                <FormSection
                  as="label"
                  className="min-w-0"
                  label={t("loansSheet.startFee")}
                >
                  <ClearableInput
                    value={startFee}
                    onValueChange={setStartFee}
                    inputMode="decimal"
                    placeholder={amountPlaceholder}
                    wrapperClassName="w-full min-w-0"
                    className={monoInputClass}
                  />
                </FormSection>
              </div>

              <p className="m-0 text-xs text-muted">
                {kind === "student"
                  ? t("loansSheet.balanceHintStudent")
                  : t("loansSheet.balanceHint")}
              </p>
            </>
          )}

          <FormSection as="label" label={t("loansSheet.description")}>
            <ClearableTextarea
              value={description}
              onValueChange={setDescription}
              rows={2}
              wrapperClassName="w-full min-w-0"
              className={`${inputClass} resize-none`}
            />
          </FormSection>

          <FormSection label={t("account.glyph")}>
            <GlyphPicker
              value={glyph}
              onChange={setGlyph}
              defaultIcon={LOAN_KIND_GLYPH[kind]}
              icons={LOANS_GLYPH_NAMES}
              tintColor={color}
            />
          </FormSection>

          <FormSection label={t("account.color")}>
            <ColorPalette
              colors={SHEET_COLORS}
              value={color}
              onChange={setColor}
            />
          </FormSection>
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <div>
          {isEdit && onDelete && (
            <Button variant="danger" withIcon onClick={onDelete}>
              <Trash2 size={14} aria-hidden focusable={false} />
              {t("common.delete")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            {isEdit ? t("common.save") : t("loansSheet.create")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
