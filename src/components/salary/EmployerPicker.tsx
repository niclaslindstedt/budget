import { useCallback, useMemo, useRef, useState } from "react";
import { Briefcase, Check, ChevronDown, Plus } from "lucide-react";

import {
  DEFAULT_EMPLOYER_GLYPH,
  DEFAULT_SHEET_COLOR,
  DEFAULT_SHEET_GLYPH,
  EMPLOYER_GLYPH_NAMES,
  SHEET_COLORS,
} from "../../data/constants/taxonomy";
import { newId } from "../../data/sheet";
import type { CategoryIcon, Employer } from "../../data/types";
import {
  useDesktopAutoFocus,
  useRovingTabindex,
  type FloatingPlacement,
} from "../../hooks";
import { useT } from "../../i18n";
import { ColorPalette } from "../ColorPalette";
import { FloatingPanel } from "../FloatingPanel";
import {
  Button,
  ClearableInput,
  FormSection,
  LISTBOX_CREATE_OPTION_CLASS,
  LISTBOX_OPTION_CLASS,
} from "../form";
import { GlyphGrid } from "../GlyphGrid";
import { HighlightedLabel } from "../HighlightedLabel";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";

// Custom employer dropdown (no native <select>) built on FloatingPanel,
// mirroring CompanyPicker. The list is a flat "No employer" + sorted
// employers; when `onCreate` is wired the panel grows a "New employer"
// footer that opens a creator (name + colour + industry glyph) so a
// fresh workplace can be added without leaving the salary flow. Roles
// are filled in later from the Employers modal.

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 200 },
  anchor: "left",
  coordinateSpace: "document",
};

type Props = {
  // The selected employer id, or undefined for "no employer".
  value: string | undefined;
  employers: readonly Employer[];
  onChange: (employerId: string | undefined) => void;
  // When provided, the dropdown grows a "New employer" footer that
  // creates a name-only employer and selects it. Omit to keep the
  // picker a read-only flat list.
  onCreate?: (employer: Employer) => void;
  ariaLabel?: string;
  // Forwarded to FloatingPanel so a picker rendered inside a sheet row
  // joins the active-row coordinator.
  rowId?: string;
};

export function EmployerPicker({
  value,
  employers,
  onChange,
  onCreate,
  ariaLabel,
  rowId,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...employers].sort((a, b) => a.name.localeCompare(b.name)),
    [employers],
  );
  const selected = useMemo(
    () => employers.find((e) => e.id === value) ?? null,
    [employers, value],
  );

  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
  }, []);

  const handlePick = useCallback(
    (id: string | undefined) => {
      onChange(id);
      close();
    },
    [onChange, close],
  );

  const beginCreating = useCallback(() => {
    setOpen(false);
    setCreating(true);
  }, []);

  // Roving keyboard nav covers the employer list only; the "No
  // employer" header and the "New employer" footer are plain
  // tab-focusable buttons (same split CompanyPicker uses).
  const initialIdx = Math.max(
    0,
    sorted.findIndex((e) => e.id === value),
  );
  const { isCursorAt, registerItem, onKeyDown, typeaheadQuery } =
    useRovingTabindex({
      itemCount: sorted.length,
      initialIndex: initialIdx,
      active: open && !creating,
      typeaheadLabels: sorted.map((e) => e.name),
    });

  return (
    <div ref={rootRef} className="relative inline-block w-full">
      <button
        type="button"
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm hover:border-accent focus-visible:outline-none"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? t("salary.pickEmployer")}
      >
        {selected ? (
          <span className="inline-flex min-w-0 items-center gap-2 text-fg">
            <span style={{ color: selected.color ?? undefined }}>
              <CategoryIconGlyph
                name={selected.glyph ?? DEFAULT_SHEET_GLYPH}
                size={14}
              />
            </span>
            <span className="min-w-0 truncate">{selected.name}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-muted">
            <Briefcase size={14} aria-hidden focusable={false} />
            <span>{t("salary.noEmployer")}</span>
          </span>
        )}
        <ChevronDown
          size={12}
          className="ml-auto shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>

      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={rootRef}
        placement={PLACEMENT}
        rowId={rowId}
      >
        <ul role="listbox" className="max-h-72 overflow-auto py-1">
          <li className="border-b border-line">
            <button
              type="button"
              role="option"
              aria-selected={value === undefined}
              onClick={() => handlePick(undefined)}
              className={LISTBOX_OPTION_CLASS}
            >
              <Briefcase
                size={14}
                aria-hidden
                focusable={false}
                className="shrink-0 text-muted"
              />
              <span className="min-w-0 truncate text-muted">
                {t("salary.noEmployer")}
              </span>
              {value === undefined && (
                <Check
                  size={14}
                  className="ml-auto text-accent"
                  aria-hidden
                  focusable={false}
                />
              )}
            </button>
          </li>
          {sorted.map((e, idx) => (
            <li key={e.id}>
              <button
                ref={registerItem(idx)}
                type="button"
                role="option"
                aria-selected={e.id === value}
                tabIndex={isCursorAt(idx) ? 0 : -1}
                onClick={() => handlePick(e.id)}
                onKeyDown={onKeyDown}
                className={LISTBOX_OPTION_CLASS}
              >
                <span
                  className="shrink-0"
                  style={{ color: e.color ?? undefined }}
                >
                  <CategoryIconGlyph
                    name={e.glyph ?? DEFAULT_SHEET_GLYPH}
                    size={14}
                  />
                </span>
                <span className="min-w-0 truncate">
                  <HighlightedLabel
                    text={e.name}
                    query={isCursorAt(idx) ? typeaheadQuery : ""}
                  />
                </span>
                {e.id === value && (
                  <Check
                    size={14}
                    className="ml-auto text-accent"
                    aria-hidden
                    focusable={false}
                  />
                )}
              </button>
            </li>
          ))}
          {onCreate && (
            <li className="mt-1 border-t border-line">
              <button
                type="button"
                onClick={beginCreating}
                className={LISTBOX_CREATE_OPTION_CLASS}
              >
                <Plus size={14} aria-hidden focusable={false} />
                {t("salary.newEmployer")}
              </button>
            </li>
          )}
        </ul>
      </FloatingPanel>

      {creating && onCreate && (
        <EmployerCreator
          existing={employers}
          onCancel={close}
          onSubmit={({ name, color, glyph }) => {
            const employer: Employer = {
              id: newId(),
              name,
              color,
              glyph,
              roles: [],
            };
            onCreate(employer);
            onChange(employer.id);
            close();
          }}
        />
      )}
    </div>
  );
}

// Focused creator — name + colour + an industry glyph, Cancel / Create.
// The glyph palette (EMPLOYER_GLYPH_NAMES) leans toward the sectors
// people work within and defaults to a briefcase rather than a wallet,
// so a fresh employer reads as a workplace from the start. Roles are
// still filled in later from the Employers modal.
function EmployerCreator({
  existing,
  onCancel,
  onSubmit,
}: {
  existing: readonly Employer[];
  onCancel: () => void;
  onSubmit: (employer: {
    name: string;
    color: string;
    glyph: CategoryIcon;
  }) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_SHEET_COLOR);
  const [glyph, setGlyph] = useState<CategoryIcon>(DEFAULT_EMPLOYER_GLYPH);
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(inputRef, true);
  const trimmed = name.trim();
  const duplicate = existing.some(
    (e) => e.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const canSubmit = trimmed.length > 0 && !duplicate;

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="employer-creator-title"
      size="max-w-sm"
      centered
    >
      <Modal.Header
        icon={<Briefcase size={14} aria-hidden focusable={false} />}
        title={t("salary.newEmployer")}
        onClose={onCancel}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("salary.employerName")}
            </span>
            <ClearableInput
              ref={inputRef}
              value={name}
              onValueChange={setName}
              placeholder={t("salary.employerNamePlaceholder")}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
            {duplicate && (
              <span className="text-xs text-danger">
                {t("salary.duplicateEmployer")}
              </span>
            )}
          </label>

          <FormSection label={t("salary.employerColor")}>
            <ColorPalette
              colors={SHEET_COLORS}
              value={color}
              onChange={setColor}
            />
          </FormSection>

          <FormSection label={t("salary.employerGlyph")}>
            <GlyphGrid
              icons={EMPLOYER_GLYPH_NAMES}
              value={glyph}
              onChange={setGlyph}
              size={8}
              tintColor={color}
            />
          </FormSection>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (canSubmit) onSubmit({ name: trimmed, color, glyph });
          }}
          disabled={!canSubmit}
        >
          {t("common.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
