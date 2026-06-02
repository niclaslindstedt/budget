import { useEffect, useState } from "react";
import { Briefcase, Pencil, Plus, Trash2 } from "lucide-react";

import {
  DEFAULT_EMPLOYER_GLYPH,
  DEFAULT_SHEET_COLOR,
  EMPLOYER_GLYPH_NAMES,
  SHEET_COLORS,
} from "../../data/constants/taxonomy";
import { roleDateRange } from "../../data/salary/salary";
import { newId } from "../../data/sheet";
import type { CategoryIcon, Employer, Role, Salary } from "../../data/types";
import { useLang, useT } from "../../i18n";
import { formatMonthLabel } from "../../utils/format";
import { ColorPalette } from "../ColorPalette";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button, ClearableInput, FormSection } from "../form";
import { GlyphGrid } from "../GlyphGrid";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  employers: readonly Employer[];
  // The full salary list — a role carries no dates of its own, so its
  // span is derived from the salaries that reference it.
  salaries: readonly Salary[];
  onClose: () => void;
  onCreate: (employer: Employer) => void;
  onUpdate: (employerId: string, patch: Partial<Omit<Employer, "id">>) => void;
  onDelete: (employerId: string) => void;
};

const TEXT_INPUT_CLASS =
  "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

type EditorState = {
  id: string | null; // null = creating a new employer
  name: string;
  color: string;
  glyph: CategoryIcon;
  roles: Role[];
};

function blankEditor(): EditorState {
  return {
    id: null,
    name: "",
    color: DEFAULT_SHEET_COLOR,
    glyph: DEFAULT_EMPLOYER_GLYPH,
    roles: [],
  };
}

function editorFor(employer: Employer): EditorState {
  return {
    id: employer.id,
    name: employer.name,
    color: employer.color ?? DEFAULT_SHEET_COLOR,
    glyph: employer.glyph ?? DEFAULT_EMPLOYER_GLYPH,
    roles: employer.roles.map((r) => ({ ...r })),
  };
}

export function EmployerManageModal({
  open,
  employers,
  salaries,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const t = useT();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Reset to the list view each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setEditor(null);
    setPendingDelete(null);
  }, [open]);

  function updateRole(roleId: string, patch: Partial<Role>) {
    setEditor((prev) =>
      prev
        ? {
            ...prev,
            roles: prev.roles.map((r) =>
              r.id === roleId ? { ...r, ...patch } : r,
            ),
          }
        : prev,
    );
  }

  function handleSaveEditor() {
    if (!editor) return;
    const name = editor.name.trim();
    if (name === "") return;
    // Drop blank-title roles; a role is just an id + title now (its span
    // is derived from the salaries that reference it).
    const roles: Role[] = editor.roles
      .filter((r) => r.title.trim() !== "")
      .map((r) => ({ id: r.id, title: r.title.trim() }));
    const patch = { name, color: editor.color, glyph: editor.glyph, roles };
    if (editor.id) onUpdate(editor.id, patch);
    else onCreate({ id: newId(), ...patch });
    setEditor(null);
  }

  const headerTitle = editor
    ? editor.id
      ? t("salary.editEmployerAria", { name: editor.name || "—" })
      : t("salary.addEmployer")
    : t("salary.employersTitle");

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="employers-title"
      size="max-w-lg"
    >
      <Modal.Header
        icon={<Briefcase size={14} aria-hidden focusable={false} />}
        title={headerTitle}
        onClose={onClose}
      />
      <Modal.Body>
        {editor ? (
          <div className="flex flex-col gap-3">
            <FormSection as="label" label={t("salary.employerName")}>
              <ClearableInput
                value={editor.name}
                onValueChange={(name) =>
                  setEditor((prev) => (prev ? { ...prev, name } : prev))
                }
                placeholder={t("salary.employerNamePlaceholder")}
                className={TEXT_INPUT_CLASS}
              />
            </FormSection>

            <FormSection label={t("salary.employerColor")}>
              <ColorPalette
                colors={SHEET_COLORS}
                value={editor.color}
                onChange={(color) =>
                  setEditor((prev) => (prev ? { ...prev, color } : prev))
                }
              />
            </FormSection>

            <FormSection label={t("salary.employerGlyph")}>
              <GlyphGrid
                icons={EMPLOYER_GLYPH_NAMES}
                value={editor.glyph}
                onChange={(glyph) =>
                  setEditor((prev) => (prev ? { ...prev, glyph } : prev))
                }
                size={8}
                tintColor={editor.color}
              />
            </FormSection>

            <FormSection label={t("salary.roles")}>
              <div className="flex flex-col gap-2">
                {editor.roles.length === 0 && (
                  <p className="text-xs text-muted">{t("salary.noRoles")}</p>
                )}
                {editor.roles.map((role) => (
                  <div
                    key={role.id}
                    className="flex flex-col gap-2 rounded border border-line bg-surface-2 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <ClearableInput
                        value={role.title}
                        onValueChange={(title) =>
                          updateRole(role.id, { title })
                        }
                        placeholder={t("salary.roleTitlePlaceholder")}
                        wrapperClassName="flex-1"
                        className={TEXT_INPUT_CLASS}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEditor((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  roles: prev.roles.filter(
                                    (r) => r.id !== role.id,
                                  ),
                                }
                              : prev,
                          )
                        }
                        aria-label={t("salary.removeRole")}
                        title={t("salary.removeRole")}
                        className="shrink-0 cursor-pointer rounded border border-line p-1.5 text-muted hover:text-danger"
                      >
                        <Trash2 size={14} aria-hidden focusable={false} />
                      </button>
                    </div>
                    <RoleSpan role={role} salaries={salaries} />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setEditor((prev) =>
                      prev
                        ? {
                            ...prev,
                            roles: [...prev.roles, { id: newId(), title: "" }],
                          }
                        : prev,
                    )
                  }
                  className="flex cursor-pointer items-center justify-center gap-1.5 rounded border border-line px-3 py-2 text-sm text-accent hover:bg-surface"
                >
                  <Plus size={14} aria-hidden focusable={false} />
                  {t("salary.addRole")}
                </button>
              </div>
            </FormSection>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {employers.length === 0 && (
              <p className="px-1 py-4 text-center text-sm text-muted">
                {t("salary.noEmployers")}
              </p>
            )}
            {employers.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded border border-line bg-surface-2 px-3 py-2"
              >
                <span
                  aria-hidden
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line"
                  style={{ color: e.color ?? undefined }}
                >
                  <CategoryIconGlyph
                    name={e.glyph ?? DEFAULT_EMPLOYER_GLYPH}
                    size={16}
                  />
                </span>
                <span className="flex-1 truncate font-mono font-bold text-fg-bright">
                  {e.name}
                </span>
                <button
                  type="button"
                  onClick={() => setEditor(editorFor(e))}
                  aria-label={t("salary.editEmployerAria", { name: e.name })}
                  className="cursor-pointer rounded border border-line p-1.5 text-muted hover:text-accent"
                >
                  <Pencil size={14} aria-hidden focusable={false} />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete({ id: e.id, name: e.name })}
                  aria-label={t("salary.deleteEmployerAria", { name: e.name })}
                  className="cursor-pointer rounded border border-line p-1.5 text-muted hover:text-danger"
                >
                  <Trash2 size={14} aria-hidden focusable={false} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        {editor ? (
          <>
            <Button variant="secondary" onClick={() => setEditor(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveEditor}
              disabled={editor.name.trim() === ""}
            >
              {t("salary.saveEmployer")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t("common.close")}
            </Button>
            <Button
              variant="primary"
              withIcon
              onClick={() => setEditor(blankEditor())}
            >
              <Plus size={14} aria-hidden focusable={false} />
              {t("salary.addEmployer")}
            </Button>
          </>
        )}
      </Modal.Footer>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("salary.deleteEmployer")}
        description={
          pendingDelete
            ? t("salary.deleteEmployerConfirm", { name: pendingDelete.name })
            : null
        }
        actions={[
          {
            label: t("salary.deleteEmployer"),
            tone: "danger",
            onSelect: () => {
              if (pendingDelete) onDelete(pendingDelete.id);
              setPendingDelete(null);
            },
          },
        ]}
        onCancel={() => setPendingDelete(null)}
      />
    </Modal>
  );
}

// A role's effective span, derived from the salaries that reference it.
// Read-only: the role itself stores no dates, so this just narrates the
// range the assigned paychecks span (or a hint when none point at it).
function RoleSpan({
  role,
  salaries,
}: {
  role: Role;
  salaries: readonly Salary[];
}) {
  const t = useT();
  const lang = useLang();
  const range = roleDateRange(role.id, salaries);
  if (range === null) {
    return (
      <span className="text-xs text-muted">{t("salary.roleRangeEmpty")}</span>
    );
  }
  const start = formatMonthLabel(range.start.slice(0, 7), lang);
  const end = formatMonthLabel(range.end.slice(0, 7), lang);
  const text = start === end ? start : t("salary.roleRange", { start, end });
  return <span className="text-xs text-muted">{text}</span>;
}
