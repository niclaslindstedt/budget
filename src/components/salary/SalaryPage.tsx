import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  CheckSquare,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import type { Action } from "../../data/reducer";
import { newId } from "../../data/sheet";
import type {
  Employer,
  Salary,
  Settings,
  Sheet,
  UserData,
} from "../../data/types";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatMonthLabel } from "../../utils/format";
import { ConfirmDialog } from "../ConfirmDialog";
import { useModalDispatch } from "../modal-dispatch";
import { SheetTitleMenu, type SheetTitleMenuItem } from "../SheetTitleMenu";
import { EmployerManageModal } from "./EmployerManageModal";
import {
  SalaryBulkEditModal,
  type SalaryBulkApply,
} from "./SalaryBulkEditModal";
import { SalaryDiscoveryModal } from "./SalaryDiscoveryModal";
import { SalaryEditModal } from "./SalaryEditModal";
import { SalaryYearTable } from "./SalaryYearTable";

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  dispatch: (action: Action) => void;
};

// Apply a salary patch (undefined = drop the key) onto a draft, used to
// build the object a brand-new salary is created from. Mirrors the
// reducer's `applySalaryPatch` so create and edit treat the patch the
// same way.
function applyPatch(base: Salary, patch: Partial<Omit<Salary, "id">>): Salary {
  const next: Salary = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key as keyof Salary];
    else (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

export function SalaryPage({ sheet, data, settings, dispatch }: Props) {
  const t = useT();
  const lang = useLang();
  const dispatchModal = useModalDispatch();

  function handleCreateEmployer(employer: Employer) {
    dispatch({ type: "createEmployer", employer });
  }

  const [findOpen, setFindOpen] = useState(false);
  const [employersOpen, setEmployersOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<{
    salary: Salary;
    isNew: boolean;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Salary | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  // Land at the top of the page when switching to this sheet.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [sheet.id]);

  const employersById = useMemo(() => {
    const m = new Map<string, Employer>();
    for (const e of data.employers) m.set(e.id, e);
    return m;
  }, [data.employers]);

  // Salaries grouped by year, newest year first, newest month first
  // inside each year.
  const yearGroups = useMemo(() => {
    const sorted = [...data.salaries].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
    const groups = new Map<string, Salary[]>();
    for (const s of sorted) {
      const y = s.date.slice(0, 4);
      const arr = groups.get(y);
      if (arr) arr.push(s);
      else groups.set(y, [s]);
    }
    return [...groups.entries()];
  }, [data.salaries]);

  // Bank entries already backing a salary — passed to the discovery
  // walk so an added paycheck isn't offered again. Keyed on
  // `sourceHistoryId`; the modal pairs this with a month+net backstop
  // since bank entry ids aren't stable across re-imports.
  const excludeHistoryIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of data.salaries)
      if (s.sourceHistoryId) set.add(s.sourceHistoryId);
    return set;
  }, [data.salaries]);

  const titleMenuItems: SheetTitleMenuItem[] = [
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("sheet.editSheet"),
      onClick: () =>
        dispatchModal({ kind: "open-edit-sheet", sheetId: sheet.id }),
    },
    {
      key: "find",
      icon: <Search size={16} aria-hidden focusable={false} />,
      label: t("salary.findSalaries"),
      onClick: () => setFindOpen(true),
    },
    {
      key: "employers",
      icon: <Briefcase size={16} aria-hidden focusable={false} />,
      label: t("salary.manageEmployers"),
      onClick: () => setEmployersOpen(true),
    },
  ];

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function handleAddSalary() {
    setEditing({
      salary: { id: newId(), date: todayIso(), net: 0 },
      isNew: true,
    });
  }

  function handleSaveSalary(
    salaryId: string,
    patch: Partial<Omit<Salary, "id">>,
  ) {
    if (editing?.isNew) {
      dispatch({
        type: "createSalary",
        salary: applyPatch(editing.salary, patch),
      });
    } else {
      dispatch({ type: "updateSalary", salaryId, patch });
    }
  }

  function handleAddDiscovered(salaries: Salary[]) {
    // Belt-and-suspenders dedupe: drop any month already covered by an
    // existing salary at the same net (±1%). Bank entry ids aren't
    // stable across re-imports, so the `sourceHistoryId` exclusion in
    // the walk can miss a re-imported paycheck — this catches it.
    const existing = data.salaries.map((s) => ({
      month: s.date.slice(0, 7),
      net: s.net,
    }));
    const fresh = salaries.filter((s) => {
      const month = s.date.slice(0, 7);
      return !existing.some(
        (e) =>
          e.month === month &&
          Math.max(e.net, s.net) > 0 &&
          Math.abs(e.net - s.net) / Math.max(e.net, s.net) <= 0.01,
      );
    });
    if (fresh.length > 0) dispatch({ type: "addSalaries", salaries: fresh });
  }

  function handleBulkApply(args: SalaryBulkApply) {
    const ids = [...selectedIds];
    if (args.setEmployer) {
      dispatch({
        type: "bulkUpdateSalaries",
        ids,
        patch: { employerId: args.employerId },
      });
    }
    if (args.setTaxRate) {
      dispatch({ type: "bulkSetSalaryTaxRate", ids, rate: args.rate });
    }
    exitSelect();
  }

  function handleBulkDelete() {
    for (const id of selectedIds)
      dispatch({ type: "deleteSalary", salaryId: id });
    setPendingBulkDelete(false);
    exitSelect();
  }

  const hasSalaries = data.salaries.length > 0;

  return (
    <section>
      <header className="mb-2 flex items-center justify-center md:mb-6">
        <h2 className="m-0">
          <SheetTitleMenu sheetName={sheet.name} items={titleMenuItems} />
        </h2>
      </header>

      <section className="mb-4" data-sheet-content>
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {selectMode ? (
            <>
              <span className="mr-auto text-xs text-muted">
                {t("salary.selected", { count: String(selectedIds.size) })}
              </span>
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                disabled={selectedIds.size === 0}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-sm text-fg hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Layers size={14} aria-hidden focusable={false} />
                {t("salary.bulkEmployerToggle")}
              </button>
              <button
                type="button"
                onClick={() => setPendingBulkDelete(true)}
                disabled={selectedIds.size === 0}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-sm text-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={14} aria-hidden focusable={false} />
                {t("salary.delete")}
              </button>
              <button
                type="button"
                onClick={exitSelect}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-sm text-muted hover:text-fg"
              >
                <X size={14} aria-hidden focusable={false} />
                {t("salary.cancelSelect")}
              </button>
            </>
          ) : (
            hasSalaries && (
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-sm text-fg hover:border-accent"
              >
                <CheckSquare size={14} aria-hidden focusable={false} />
                {t("salary.select")}
              </button>
            )
          )}
        </div>

        {!hasSalaries ? (
          <div className="rounded border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
            {t("salary.noSalaries")}
          </div>
        ) : (
          yearGroups.map(([year, salaries]) => (
            <SalaryYearTable
              key={year}
              year={year}
              salaries={salaries}
              employersById={employersById}
              settings={settings}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onEdit={(salaryId) => {
                const s = data.salaries.find((x) => x.id === salaryId);
                if (s) setEditing({ salary: s, isNew: false });
              }}
              onDelete={(salary) => setPendingDelete(salary)}
            />
          ))
        )}

        <div className="mt-2">
          <button
            type="button"
            onClick={handleAddSalary}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-line bg-surface-3 px-3 py-2 text-sm text-accent hover:bg-surface"
          >
            <Plus size={16} aria-hidden focusable={false} />
            {t("salary.addSalary")}
          </button>
        </div>
      </section>

      <SalaryEditModal
        open={editing !== null}
        salary={editing?.salary ?? null}
        employers={data.employers}
        settings={settings}
        onClose={() => setEditing(null)}
        onSave={handleSaveSalary}
        onCreateEmployer={handleCreateEmployer}
      />

      <SalaryBulkEditModal
        open={bulkOpen}
        count={selectedIds.size}
        employers={data.employers}
        onClose={() => setBulkOpen(false)}
        onApply={handleBulkApply}
      />

      <SalaryDiscoveryModal
        open={findOpen}
        accounts={data.accounts}
        history={data.history}
        employers={data.employers}
        settings={settings}
        excludeHistoryIds={excludeHistoryIds}
        onClose={() => setFindOpen(false)}
        onAdd={handleAddDiscovered}
        onCreateEmployer={handleCreateEmployer}
      />

      <EmployerManageModal
        open={employersOpen}
        employers={data.employers}
        onClose={() => setEmployersOpen(false)}
        onCreate={(employer) => dispatch({ type: "createEmployer", employer })}
        onUpdate={(employerId, patch) =>
          dispatch({ type: "updateEmployer", employerId, patch })
        }
        onDelete={(employerId) =>
          dispatch({ type: "deleteEmployer", employerId })
        }
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("salary.deleteTitle")}
        description={
          pendingDelete
            ? t("salary.deleteConfirm", {
                month: formatMonthLabel(pendingDelete.date.slice(0, 7), lang),
              })
            : null
        }
        actions={[
          {
            label: t("salary.delete"),
            tone: "danger",
            onSelect: () => {
              if (pendingDelete)
                dispatch({ type: "deleteSalary", salaryId: pendingDelete.id });
              setPendingDelete(null);
            },
          },
        ]}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingBulkDelete}
        title={t("salary.deleteTitle")}
        description={t("salary.selected", { count: String(selectedIds.size) })}
        actions={[
          {
            label: t("salary.delete"),
            tone: "danger",
            onSelect: handleBulkDelete,
          },
        ]}
        onCancel={() => setPendingBulkDelete(false)}
      />
    </section>
  );
}
