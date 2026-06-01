import { useEffect, useMemo, useState } from "react";
import { Briefcase, Pencil, Search } from "lucide-react";

import type { Action } from "../../data/reducer";
import type {
  Employer,
  Salary,
  SalaryView,
  Settings,
  Sheet,
  UserData,
} from "../../data/types";
import { useLang, useT } from "../../i18n";
import { formatMonthLabel } from "../../utils/format";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { ConfirmDialog } from "../ConfirmDialog";
import { useModalDispatch } from "../modal-dispatch";
import { SheetTitleMenu, type SheetTitleMenuItem } from "../SheetTitleMenu";
import { EmployerManageModal } from "./EmployerManageModal";
import { SalaryBulkEditModal } from "./SalaryBulkEditModal";
import type { SalaryBulkApply } from "./SalaryBulkEditModal";
import { SalaryDiscoveryModal } from "./SalaryDiscoveryModal";
import { SalaryEditModal } from "./SalaryEditModal";
import { SalaryYearTable } from "./SalaryYearTable";

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  dispatch: (action: Action) => void;
  // Select-many state lives in AppShell so the universal BottomBar can
  // drive it (see `useSalaryBulkSelection`); the page only renders the
  // checkboxes and the bulk modals it owns.
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (salaryId: string) => void;
  onToggleSelectMany: (salaryIds: string[], target: boolean) => void;
  bulkEditOpen: boolean;
  onCloseBulkEdit: () => void;
  onApplyBulk: (args: SalaryBulkApply) => void;
  bulkDeleteOpen: boolean;
  onCloseBulkDelete: () => void;
  onConfirmBulkDelete: () => void;
  // Payslip attachment, threaded from AppShell where the storage adapter
  // lives. `canUploadPayslip` gates the control on a backend that
  // advertises the `payslips` capability; the callbacks write / read the
  // file through that adapter for the given salary.
  canUploadPayslip: boolean;
  onUploadPayslip: (salary: Salary, file: File) => Promise<string>;
  onViewPayslip: (path: string) => Promise<void>;
};

export function SalaryPage({
  sheet,
  data,
  settings,
  dispatch,
  selectMode,
  selectedIds,
  onToggleSelect,
  onToggleSelectMany,
  bulkEditOpen,
  onCloseBulkEdit,
  onApplyBulk,
  bulkDeleteOpen,
  onCloseBulkDelete,
  onConfirmBulkDelete,
  canUploadPayslip,
  onUploadPayslip,
  onViewPayslip,
}: Props) {
  const t = useT();
  const lang = useLang();
  const dispatchModal = useModalDispatch();

  function handleCreateEmployer(employer: Employer) {
    dispatch({ type: "createEmployer", employer });
  }

  const [findOpen, setFindOpen] = useState(false);
  const [employersOpen, setEmployersOpen] = useState(false);
  const [editing, setEditing] = useState<Salary | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Salary | null>(null);

  // Land at the top of the page when switching to this sheet.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [sheet.id]);

  // The account this salary sheet is bound to (where pay lands). The
  // "Find salaries" walk scans its history directly; bound from the
  // sheet's edit modal.
  const salaryAccountId =
    sheet.items.find((it): it is SalaryView => it.type === "salaryView")
      ?.accountId ?? null;

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

  function handleSaveSalary(
    salaryId: string,
    patch: Partial<Omit<Salary, "id">>,
  ) {
    dispatch({ type: "updateSalary", salaryId, patch });
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

  const hasSalaries = data.salaries.length > 0;

  return (
    <ActiveRowProvider>
      <section>
        <header className="mb-2 flex items-center justify-center md:mb-6">
          <h2 className="m-0">
            <SheetTitleMenu sheetName={sheet.name} items={titleMenuItems} />
          </h2>
        </header>

        <section className="mb-4" data-sheet-content>
          {!hasSalaries ? (
            <div className="flex flex-col items-center gap-4 rounded border border-line bg-surface px-4 py-8 text-center">
              <p className="m-0 text-sm text-muted">{t("salary.noSalaries")}</p>
              <button
                type="button"
                onClick={() => setFindOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-3 px-3 py-2 text-sm text-accent hover:bg-surface"
              >
                <Search size={16} aria-hidden focusable={false} />
                {t("salary.findSalaries")}
              </button>
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
                onToggleSelect={onToggleSelect}
                onToggleSelectYear={onToggleSelectMany}
                onEdit={(salaryId) => {
                  const s = data.salaries.find((x) => x.id === salaryId);
                  if (s) setEditing(s);
                }}
                onDelete={(salary) => setPendingDelete(salary)}
              />
            ))
          )}
        </section>

        <SalaryEditModal
          open={editing !== null}
          salary={editing}
          employers={data.employers}
          settings={settings}
          onClose={() => setEditing(null)}
          onSave={handleSaveSalary}
          onCreateEmployer={handleCreateEmployer}
          canUploadPayslip={canUploadPayslip}
          onUploadPayslip={
            editing ? (file) => onUploadPayslip(editing, file) : undefined
          }
          onViewPayslip={onViewPayslip}
        />

        <SalaryBulkEditModal
          open={bulkEditOpen}
          count={selectedIds.size}
          employers={data.employers}
          onClose={onCloseBulkEdit}
          onApply={onApplyBulk}
        />

        <SalaryDiscoveryModal
          open={findOpen}
          accountId={salaryAccountId}
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
          onCreate={(employer) =>
            dispatch({ type: "createEmployer", employer })
          }
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
                  dispatch({
                    type: "deleteSalary",
                    salaryId: pendingDelete.id,
                  });
                setPendingDelete(null);
              },
            },
          ]}
          onCancel={() => setPendingDelete(null)}
        />

        <ConfirmDialog
          open={bulkDeleteOpen}
          title={t("salary.deleteTitle")}
          description={t("salary.selected", {
            count: String(selectedIds.size),
          })}
          actions={[
            {
              label: t("salary.delete"),
              tone: "danger",
              onSelect: onConfirmBulkDelete,
            },
          ]}
          onCancel={onCloseBulkDelete}
        />
      </section>
    </ActiveRowProvider>
  );
}
