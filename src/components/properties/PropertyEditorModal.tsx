import { useRef, useState } from "react";
import { Check, ChevronDown, Home, Plus, Wallet, X } from "lucide-react";

import { newId } from "../../data/sheet";
import type {
  Account,
  AssociationLoan,
  AssociationLoanChange,
  Company,
  Property,
  Settings,
} from "../../data/types";
import { useResetOnOpen, type FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { formatAmountForInput, parseAmount } from "../../utils/format";
import { tintBorder, tintFill } from "../../utils/tint";
import { CompanyPicker } from "../CompanyPicker";
import { Button, ClearableInput, DateField } from "../form";
import { FloatingPanel } from "../FloatingPanel";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";

// Create / edit one `Property` — name, lender, the bank account "Find
// mortgage payments" scans, what it was bought for, the purchase date, and
// (for a property owned in the past) the sale date and amount.
// The account is shared across the property's mortgages (a property is paid
// to the bank as one charge covering every loan), so it's bound here, not
// per mortgage. The value history and mortgages are managed from the card,
// not here. Mirrors `ItemEditorModal`.
//
// Not `centered`: the name / amount fields open the soft keyboard, so the
// modal keeps the default fullscreen-on-mobile layout.

type Props = {
  open: boolean;
  // The property to edit, or null in create mode (blank fields, "New
  // property" title, Save mints a fresh property).
  property: Property | null;
  companies: readonly Company[];
  accounts: readonly Account[];
  settings: Settings;
  onClose: () => void;
  // Fires on Save in edit mode with the changed fields. A field set to
  // `undefined` clears it.
  onSubmit: (propertyId: string, patch: Partial<Omit<Property, "id">>) => void;
  // Fires on Save in create mode with the assembled property (fresh id).
  onCreate: (property: Property) => void;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
};

function seedAmount(value: number | undefined, settings: Settings): string {
  if (value === undefined) return "";
  return formatAmountForInput(Math.abs(value), settings);
}

// One editable association-loan period: a (possibly blank) effective date and
// the loan-per-area + rate as typed text. Each årsredovisning adds one.
type AssocRow = { id: string; date: string; loanPerSize: string; rate: string };

// Seed the association-loan editor: the stored history when present, else a
// single row carrying the headline figures (or an empty starter row when the
// property records no association loan yet).
function seedAssocRows(
  property: Property | null,
  settings: Settings,
): AssocRow[] {
  const loan = property?.associationLoan;
  if (loan?.history && loan.history.length > 0)
    return loan.history.map((c) => ({
      id: c.id,
      date: c.date,
      loanPerSize: seedAmount(c.loanPerSize, settings),
      rate: seedAmount(c.rate, settings),
    }));
  if (loan)
    return [
      {
        id: newId(),
        date: "",
        loanPerSize: seedAmount(loan.loanPerSize, settings),
        rate: seedAmount(loan.rate, settings),
      },
    ];
  return [{ id: newId(), date: "", loanPerSize: "", rate: "" }];
}

export function PropertyEditorModal({
  open,
  property,
  companies,
  accounts,
  settings,
  onClose,
  onSubmit,
  onCreate,
  onCreateCompany,
}: Props) {
  const t = useT();
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [soldAmount, setSoldAmount] = useState("");
  const [soldDate, setSoldDate] = useState("");
  const [size, setSize] = useState("");
  const [rooms, setRooms] = useState("");
  const [fee, setFee] = useState("");
  // Effective-dated association-loan figures, newest editing at the bottom.
  // The most recent by date is the current loan; a blank date marks the
  // original. Mirrors the mortgage editor's rate rows.
  const [assocRows, setAssocRows] = useState<AssocRow[]>([]);
  const [associationLoanSize, setAssociationLoanSize] = useState("");

  useResetOnOpen(open, property?.id ?? "__create__", () => {
    setName(property?.name ?? "");
    setCompanyId(property?.companyId ?? null);
    setAccountId(property?.accountId ?? null);
    setAccountOpen(false);
    setPurchaseAmount(seedAmount(property?.purchaseAmount, settings));
    setPurchaseDate(property?.purchaseDate ?? "");
    setSoldAmount(seedAmount(property?.soldAmount, settings));
    setSoldDate(property?.soldDate ?? "");
    setSize(seedAmount(property?.size, settings));
    setRooms(seedAmount(property?.rooms, settings));
    setFee(seedAmount(property?.fee, settings));
    setAssocRows(seedAssocRows(property, settings));
    setAssociationLoanSize(
      seedAmount(property?.associationLoan?.size, settings),
    );
  });

  if (!open) return null;

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  function num(text: string): number | undefined {
    const parsed = parseAmount(text);
    return parsed === null ? undefined : Math.abs(parsed);
  }

  // Collapse the association-loan rows into the current figures + an optional
  // history, mirroring the mortgage editor's `buildRateTerms`. A row counts
  // only when both the loan-per-area and rate parse (each årsredovisning
  // restates both together); the most recent by date is the current loan. A
  // single original-figures row (blank date) stores only the headline — no
  // history clutter. The whole loan drops to undefined when nothing parses or
  // the current figures are both zero (indistinguishable from "not recorded").
  // The optional registered `size` (the lägenhetsförteckning area) rides along
  // only when set and positive — otherwise the share falls back to the
  // property's measured size.
  function buildAssociationLoan(): AssociationLoan | undefined {
    const parsed = assocRows
      .map((r) => ({
        id: r.id,
        date: r.date.trim(),
        loanPerSize: num(r.loanPerSize),
        rate: num(r.rate),
      }))
      .filter(
        (r): r is AssociationLoanChange =>
          r.loanPerSize !== undefined && r.rate !== undefined,
      )
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (parsed.length === 0) return undefined;
    const current = parsed[parsed.length - 1];
    if (current.loanPerSize === 0 && current.rate === 0) return undefined;
    const loan: AssociationLoan = {
      loanPerSize: current.loanPerSize,
      rate: current.rate,
    };
    const size = num(associationLoanSize);
    if (size !== undefined && size > 0) loan.size = size;
    // A single original-figures row is just the headline — skip the history.
    if (!(parsed.length === 1 && parsed[0].date === "")) loan.history = parsed;
    return loan;
  }

  function updateAssocRow(id: string, patch: Partial<Omit<AssocRow, "id">>) {
    setAssocRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }
  function addAssocRow() {
    setAssocRows((rows) => [
      ...rows,
      { id: newId(), date: "", loanPerSize: "", rate: "" },
    ]);
  }
  function removeAssocRow(id: string) {
    setAssocRows((rows) => rows.filter((r) => r.id !== id));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const associationLoan = buildAssociationLoan();
    const patch: Partial<Omit<Property, "id">> = {
      name: trimmedName,
      // `null` from the picker clears the field via the `undefined` patch.
      companyId: companyId ?? undefined,
      accountId: accountId ?? undefined,
      purchaseAmount: num(purchaseAmount),
      purchaseDate: purchaseDate !== "" ? purchaseDate : undefined,
      // The sale amount rides only with a sale date (a price with no date
      // can't place the sale on the timeline) — mirrors the validator, so
      // the live record stays byte-identical to a reload.
      soldDate: soldDate !== "" ? soldDate : undefined,
      soldAmount: soldDate !== "" ? num(soldAmount) : undefined,
      size: num(size),
      rooms: num(rooms),
      fee: num(fee),
      associationLoan,
    };
    if (property) {
      onSubmit(property.id, patch);
      return;
    }
    // Create mode: drop every `undefined` so the new property is
    // byte-clean (absent optional fields aren't stored).
    const fresh: Property = {
      id: newId(),
      name: trimmedName,
      valueHistory: [],
      mortgages: [],
      repairs: [],
      files: [],
    };
    if (companyId) fresh.companyId = companyId;
    if (accountId) fresh.accountId = accountId;
    if (patch.purchaseAmount !== undefined)
      fresh.purchaseAmount = patch.purchaseAmount;
    if (patch.purchaseDate !== undefined)
      fresh.purchaseDate = patch.purchaseDate;
    if (patch.soldDate !== undefined) fresh.soldDate = patch.soldDate;
    if (patch.soldAmount !== undefined) fresh.soldAmount = patch.soldAmount;
    if (patch.size !== undefined) fresh.size = patch.size;
    if (patch.rooms !== undefined) fresh.rooms = patch.rooms;
    if (patch.fee !== undefined) fresh.fee = patch.fee;
    if (associationLoan) fresh.associationLoan = associationLoan;
    onCreate(fresh);
  }

  const amountInputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="property-editor-modal-title"
      size="max-w-sm"
    >
      <Modal.Header
        icon={<Home size={14} aria-hidden focusable={false} />}
        title={
          property
            ? t("properties.editPropertyTitle")
            : t("properties.newPropertyTitle")
        }
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.nameLabel")}
            </span>
            <ClearableInput
              value={name}
              onValueChange={setName}
              placeholder={t("properties.namePlaceholder")}
              className={amountInputClass}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.lenderLabel")}
            </span>
            <CompanyPicker
              companies={companies}
              selectedId={companyId}
              onSelect={setCompanyId}
              onCreate={onCreateCompany}
              placeholder={t("properties.lenderPlaceholder")}
            />
            <p className="m-0 text-xs text-muted">
              {t("properties.lenderHint")}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.accountLabel")}
            </span>
            <PropertyAccountPicker
              value={accountId}
              accounts={accounts}
              open={accountOpen}
              onToggle={() => setAccountOpen((v) => !v)}
              onClose={() => setAccountOpen(false)}
              onPick={(id) => {
                setAccountId(id);
                setAccountOpen(false);
              }}
            />
            <p className="m-0 text-xs text-muted">
              {t("properties.accountHint")}
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.purchaseAmountLabel")}
            </span>
            <ClearableInput
              value={purchaseAmount}
              onValueChange={setPurchaseAmount}
              inputMode="decimal"
              placeholder={t("properties.purchaseAmountPlaceholder")}
              className={amountInputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.purchaseDateLabel")}
            </span>
            <DateField value={purchaseDate} onChange={setPurchaseDate} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.soldDateLabel")}
            </span>
            <DateField value={soldDate} onChange={setSoldDate} />
            <p className="m-0 text-xs text-muted">
              {t("properties.soldDateHint")}
            </p>
          </label>

          {soldDate !== "" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("properties.soldAmountLabel")}
              </span>
              <ClearableInput
                value={soldAmount}
                onValueChange={setSoldAmount}
                inputMode="decimal"
                placeholder={t("properties.soldAmountPlaceholder")}
                className={amountInputClass}
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.sizeLabel")}
            </span>
            <div className="flex items-center gap-2">
              <ClearableInput
                value={size}
                onValueChange={setSize}
                inputMode="decimal"
                placeholder={t("properties.sizePlaceholder")}
                className={amountInputClass}
              />
              <span className="shrink-0 text-sm text-muted">
                {settings.propertySizeUnit}
              </span>
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.roomsLabel")}
            </span>
            <ClearableInput
              value={rooms}
              onValueChange={setRooms}
              inputMode="decimal"
              placeholder={t("properties.roomsPlaceholder")}
              className={amountInputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.feeLabel")}
            </span>
            <ClearableInput
              value={fee}
              onValueChange={setFee}
              inputMode="decimal"
              placeholder={t("properties.feePlaceholder")}
              className={amountInputClass}
            />
            <p className="m-0 text-xs text-muted">{t("properties.feeHint")}</p>
          </label>

          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <p className="m-0 text-xs font-bold text-fg-bright">
              {t("properties.associationLoanLabel")}
            </p>
            <div className="flex flex-col gap-1.5">
              {assocRows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-1.5 rounded border border-line bg-surface-2 p-2"
                >
                  <div className="flex items-center gap-1.5">
                    <DateField
                      value={row.date}
                      onChange={(value) =>
                        updateAssocRow(row.id, { date: value })
                      }
                      ariaLabel={t("properties.associationLoanChangeDateLabel")}
                      className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg flex-1"
                    />
                    {assocRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAssocRow(row.id)}
                        aria-label={t("properties.associationLoanRemoveChange")}
                        className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-danger"
                      >
                        <X size={14} aria-hidden focusable={false} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ClearableInput
                      value={row.loanPerSize}
                      onValueChange={(v) =>
                        updateAssocRow(row.id, { loanPerSize: v })
                      }
                      inputMode="decimal"
                      placeholder={t(
                        "properties.associationLoanPerSizePlaceholder",
                      )}
                      aria-label={t("properties.associationLoanPerSizeLabel")}
                      className={`${amountInputClass} flex-1`}
                    />
                    <span className="shrink-0 text-xs text-muted">
                      / {settings.propertySizeUnit}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ClearableInput
                      value={row.rate}
                      onValueChange={(v) => updateAssocRow(row.id, { rate: v })}
                      inputMode="decimal"
                      placeholder={t(
                        "properties.associationLoanRatePlaceholder",
                      )}
                      aria-label={t("properties.associationLoanRateLabel")}
                      className={`${amountInputClass} flex-1`}
                    />
                    <span className="shrink-0 text-xs text-muted">%</span>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addAssocRow}
                className="inline-flex cursor-pointer items-center gap-1 self-start rounded border-0 bg-transparent px-1 text-xs text-accent hover:underline"
              >
                <Plus size={14} aria-hidden focusable={false} />
                {t("properties.associationLoanAddChange")}
              </button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("properties.associationLoanSizeLabel")}
              </span>
              <div className="flex items-center gap-2">
                <ClearableInput
                  value={associationLoanSize}
                  onValueChange={setAssociationLoanSize}
                  inputMode="decimal"
                  placeholder={t("properties.associationLoanSizePlaceholder")}
                  className={amountInputClass}
                />
                <span className="shrink-0 text-sm text-muted">
                  {settings.propertySizeUnit}
                </span>
              </div>
              <p className="m-0 text-xs text-muted">
                {t("properties.associationLoanSizeHint")}
              </p>
            </label>
            <p className="m-0 text-xs text-muted">
              {t("properties.associationLoanHint")}
            </p>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {property ? t("properties.save") : t("properties.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// Routed through `FloatingPanel` so the list lifts out of the modal's
// stacking context. Mirrors the account pickers in AccountTransferModal /
// SheetModal — no native `<select>`. `null` value means "no account".
const ACCOUNT_PICKER_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "left",
  coordinateSpace: "viewport",
};

function PropertyAccountPicker({
  value,
  accounts,
  open,
  onToggle,
  onClose,
  onPick,
}: {
  value: string | null;
  accounts: readonly Account[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (value: string | null) => void;
}) {
  const t = useT();
  const triggerRef = useRef<HTMLDivElement>(null);
  const selected = accounts.find((a) => a.id === value) ?? null;

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      >
        <span
          aria-hidden
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
          style={{
            color: selected?.color,
            backgroundColor: selected?.color
              ? tintFill(selected.color)
              : undefined,
            borderColor: selected?.color
              ? tintBorder(selected.color)
              : undefined,
          }}
        >
          {selected?.glyph ? (
            <CategoryIconGlyph name={selected.glyph} size={12} />
          ) : (
            <Wallet size={12} aria-hidden focusable={false} />
          )}
        </span>
        <span className="flex-1 truncate">
          {selected ? selected.name : t("properties.chooseAccount")}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>
      <FloatingPanel
        open={open}
        onClose={onClose}
        triggerRef={triggerRef}
        placement={ACCOUNT_PICKER_PLACEMENT}
      >
        <ul role="listbox" className="max-h-64 overflow-auto py-1">
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              onClick={() => onPick(null)}
              className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span className="flex-1 truncate">
                {t("properties.noAccount")}
              </span>
              {value === null && (
                <Check
                  size={14}
                  className="text-accent"
                  aria-hidden
                  focusable={false}
                />
              )}
            </button>
          </li>
          {accounts.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">
              {t("properties.noAccountsYet")}
            </li>
          )}
          {accounts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                role="option"
                aria-selected={a.id === value}
                onClick={() => onPick(a.id)}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span
                  aria-hidden
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    color: a.color,
                    backgroundColor: a.color ? tintFill(a.color) : undefined,
                    borderColor: a.color ? tintBorder(a.color) : undefined,
                  }}
                >
                  {a.glyph ? (
                    <CategoryIconGlyph name={a.glyph} size={12} />
                  ) : (
                    <Wallet size={12} aria-hidden focusable={false} />
                  )}
                </span>
                <span className="flex-1 truncate">{a.name}</span>
                {a.id === value && (
                  <Check
                    size={14}
                    className="text-accent"
                    aria-hidden
                    focusable={false}
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </FloatingPanel>
    </div>
  );
}
