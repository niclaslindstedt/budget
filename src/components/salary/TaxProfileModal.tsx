import { useEffect, useRef, useState } from "react";
import { Receipt, Trash2 } from "lucide-react";

import { newId } from "../../data/sheet";
import { normalizeName } from "../../data/normalize";
import { DEFAULT_MUNICIPALITY_ID } from "../../data/tax/se/municipalities";
import type { SwedishTaxParams, TaxProfile } from "../../data/types";
import { useDesktopAutoFocus } from "../../hooks";
import { useT } from "../../i18n";
import { Button, ClearableInput, FormSection } from "../form";
import { Checkbox, RadioGroup, Radio } from "../form";
import { Modal } from "../Modal";
import { MunicipalityPicker } from "./MunicipalityPicker";

type Props = {
  open: boolean;
  // Edit mode when set; new-profile form when null.
  profile: TaxProfile | null;
  // Names already taken (excluding the profile being edited) for the
  // duplicate-name guard.
  existingNames: readonly string[];
  onClose: () => void;
  onSave: (profile: TaxProfile) => void;
  onDelete?: (profileId: string) => void;
};

// Inline Swedish flag (no emoji — emoji flags render as letter pairs on
// Windows, breaking the One Dark / One Light aesthetic). Mirrors the
// flag in `LanguagePicker`.
function SwedishFlag() {
  return (
    <svg
      viewBox="0 0 16 10"
      width={18}
      height={12}
      role="img"
      aria-hidden="true"
      className="block shrink-0 rounded-sm"
    >
      <rect width="16" height="10" fill="#006AA7" />
      <rect x="5" width="2" height="10" fill="#FECC00" />
      <rect y="4" width="16" height="2" fill="#FECC00" />
    </svg>
  );
}

function seedParams(profile: TaxProfile | null): SwedishTaxParams {
  if (profile && profile.params.country === "SE") return profile.params;
  return {
    country: "SE",
    municipalityId: DEFAULT_MUNICIPALITY_ID,
    churchMember: false,
    incomeKind: "employment",
  };
}

// Create / edit a reusable tax profile. Sweden-only today; the country
// row is a fixed display until a second `TaxCountry` lands. When it does,
// a new profile's default country should be seeded from the global
// `Settings.location` (the same jurisdiction the property-sale calc
// reads) rather than hard-coding "SE" in `seedParams` above — the two
// unions (`TaxLocation` / `TaxCountry`) are identical today, so there's
// nothing to vary yet. Contains text inputs (name, birth year) so it
// renders fullscreen on mobile (no `centered`) to keep the footer above
// the soft keyboard.
export function TaxProfileModal({
  open,
  profile,
  existingNames,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const t = useT();
  const isEdit = profile !== null;

  const [name, setName] = useState("");
  const [municipalityId, setMunicipalityId] = useState(DEFAULT_MUNICIPALITY_ID);
  const [churchMember, setChurchMember] = useState(false);
  const [birthYear, setBirthYear] = useState("");
  const [incomeKind, setIncomeKind] =
    useState<SwedishTaxParams["incomeKind"]>("employment");

  const nameRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(nameRef, open);

  useEffect(() => {
    if (!open) return;
    const params = seedParams(profile);
    setName(profile?.name ?? "");
    setMunicipalityId(params.municipalityId);
    setChurchMember(params.churchMember);
    setBirthYear(
      params.birthYear !== undefined ? String(params.birthYear) : "",
    );
    setIncomeKind(params.incomeKind);
  }, [open, profile]);

  const trimmedName = normalizeName(name);
  const duplicate =
    trimmedName !== null &&
    existingNames.some(
      (n) => n.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
  const canSave = trimmedName !== null && !duplicate;

  function handleSave() {
    if (trimmedName === null || duplicate) return;
    const parsedYear = Math.trunc(Number(birthYear.trim()));
    const params: SwedishTaxParams = {
      country: "SE",
      municipalityId,
      churchMember,
      incomeKind,
    };
    if (birthYear.trim() !== "" && Number.isFinite(parsedYear))
      params.birthYear = parsedYear;
    onSave({ id: profile?.id ?? newId(), name: trimmedName, params });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="tax-profile-title"
      size="max-w-md"
    >
      <Modal.Header
        icon={<Receipt size={14} aria-hidden focusable={false} />}
        title={isEdit ? t("tax.editProfileTitle") : t("tax.newProfileTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <FormSection as="label" label={t("tax.name")}>
            <ClearableInput
              ref={nameRef}
              value={name}
              onValueChange={setName}
              placeholder={t("tax.namePlaceholder")}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
            {duplicate && (
              <span className="text-xs text-danger">
                {t("tax.duplicateName")}
              </span>
            )}
          </FormSection>

          <FormSection label={t("tax.country")}>
            <div className="field-input flex w-full items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg">
              <SwedishFlag />
              <span>Sverige</span>
            </div>
          </FormSection>

          <FormSection label={t("tax.municipality")}>
            <MunicipalityPicker
              value={municipalityId}
              onChange={setMunicipalityId}
            />
          </FormSection>

          <FormSection label={t("tax.incomeKind")}>
            <RadioGroup
              name="tax-income-kind"
              value={incomeKind}
              onChange={(v) =>
                setIncomeKind(v as SwedishTaxParams["incomeKind"])
              }
              direction="row"
              ariaLabel={t("tax.incomeKind")}
            >
              <Radio value="employment" label={t("tax.incomeEmployment")} />
              <Radio value="pension" label={t("tax.incomePension")} />
            </RadioGroup>
            <span className="text-xs text-muted">
              {t("tax.incomeKindHint")}
            </span>
          </FormSection>

          <FormSection as="label" label={t("tax.birthYear")}>
            <ClearableInput
              inputMode="numeric"
              value={birthYear}
              onValueChange={setBirthYear}
              placeholder={t("tax.birthYearPlaceholder")}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
            <span className="text-xs text-muted">{t("tax.birthYearHint")}</span>
          </FormSection>

          <Checkbox
            checked={churchMember}
            onChange={setChurchMember}
            label={t("tax.churchMember")}
            description={t("tax.churchMemberHint")}
          />
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <div>
          {isEdit && onDelete && profile && (
            <Button
              variant="danger"
              withIcon
              onClick={() => onDelete(profile.id)}
            >
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
            {isEdit ? t("common.save") : t("tax.saveProfile")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
