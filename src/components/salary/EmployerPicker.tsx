import { useCallback, useMemo, useRef, useState } from "react";
import { Briefcase, Check, ChevronDown, Plus } from "lucide-react";

import {
  DEFAULT_SHEET_COLOR,
  DEFAULT_SHEET_GLYPH,
} from "../../data/constants/taxonomy";
import { newId } from "../../data/sheet";
import type { Employer } from "../../data/types";
import {
  useDesktopAutoFocus,
  useRovingTabindex,
  type FloatingPlacement,
} from "../../hooks";
import { useT } from "../../i18n";
import { FloatingPanel } from "../FloatingPanel";
import { Button, ClearableInput } from "../form";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";

// Custom employer dropdown (no native <select>) built on FloatingPanel,
// mirroring CompanyPicker. The list is a flat "No employer" + sorted
// employers; when `onCreate` is wired the panel grows a "New employer"
// footer that opens a name-only creator so a fresh workplace can be
// added without leaving the salary flow. Colour / glyph / roles are
// filled in later from the Employers modal.

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 200 },
  anchor: "left",
  coordinateSpace: "document",
};

const ROW_CLASS =
  "flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

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
  const { isCursorAt, registerItem, onKeyDown } = useRovingTabindex({
    itemCount: sorted.length,
    initialIndex: initialIdx,
    active: open && !creating,
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
              className={ROW_CLASS}
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
                className={ROW_CLASS}
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
                <span className="min-w-0 truncate">{e.name}</span>
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
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
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
          onSubmit={(name) => {
            const employer: Employer = {
              id: newId(),
              name,
              color: DEFAULT_SHEET_COLOR,
              glyph: DEFAULT_SHEET_GLYPH,
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

// Focused name-only creator — single text input, Cancel / Create.
// Matches CompanyCreator; colour / glyph / roles default and are
// editable later from the Employers modal.
function EmployerCreator({
  existing,
  onCancel,
  onSubmit,
}: {
  existing: readonly Employer[];
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
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
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">{t("salary.employerName")}</span>
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
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (canSubmit) onSubmit(trimmed);
          }}
          disabled={!canSubmit}
        >
          {t("common.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
