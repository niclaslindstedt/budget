import { Suspense, lazy, useCallback, useEffect, useMemo } from "react";

import {
  type AppShellAuth,
  type AppShellStorage,
  headerActionDescription,
} from "./types";
import { useAccountDialog } from "./hooks/useAccountDialog";
import { useSavingDialog } from "./hooks/useSavingDialog";
import { useLoanDialog } from "./hooks/useLoanDialog";
import { useBulkSelection } from "./hooks/useBulkSelection";
import { useSalaryBulkSelection } from "../salary/useSalaryBulkSelection";
import { useComplexEntry } from "./hooks/useComplexEntry";
import { useDeletePrompts } from "./hooks/useDeletePrompts";
import { useEditPrompts } from "./hooks/useEditPrompts";
import { useRowMutations } from "./hooks/useRowMutations";
import { useSearchModal } from "./hooks/useSearchModal";
import { useDownloadFlow } from "./hooks/useDownloadFlow";
import { useImportFlow } from "./hooks/useImportFlow";
import { useReceiptManager } from "./hooks/useReceiptManager";
import { usePropertyAttachments } from "../properties/usePropertyAttachments";
import { useMatchRuleUi } from "./hooks/useMatchRuleUi";
import { useTransferFlow } from "./hooks/useTransferFlow";
import { useSheetMetaDialog } from "./hooks/useSheetMetaDialog";
import { useSheetNav } from "./hooks/useSheetNav";
import { useTaxonomyCrud } from "./hooks/useTaxonomyCrud";
import { useToastEffects } from "./hooks/useToastEffects";
import { useUndoRedo } from "./hooks/useUndoRedo";

import { AppLoading } from "../AppLoading";
import { BottomBar } from "../BottomBar";
import { BudgetPage } from "../budget/BudgetPage";
import { BudgetRecurringCandidatesPanel } from "../budget/BudgetRecurringCandidatesPanel";
import { HeaderMenu } from "../HeaderMenu";
import { HeaderStar } from "../HeaderStar";
import { ModalDispatchProvider } from "../ModalDispatchProvider";
import { type ModalCommandHandlers } from "../modal-dispatch";
import { PullToRefreshIndicator } from "../PullToRefreshIndicator";
import { SaveStateButton } from "../SaveStateButton";
import { SheetSwitcher } from "../SheetSwitcher";
import { SyncStatus } from "../SyncStatus";
import { allCategories, allTypes } from "../../data/presets/merge";
import {
  companyTypeSuggestionsFromHints,
  computeCompanyTypeHints,
} from "../../data/budget/company-type-hints";
import {
  isRowSavable,
  userDataHasUnsavableRows,
  userDataWithSavableRows,
} from "../../data/budget/rows";
import { MAX_FAVORITE_SHEETS, findColumnByType } from "../../data/sheet";
import type {
  AccountBudget,
  Item,
  Row,
  Salary,
  Settings,
  UserData,
} from "../../data/types";
import { buildPayslipPath, extensionOf } from "../../data/salary/payslip-name";
import { findItemLink, type ItemTxnLink } from "../../data/items/link";
import type { TxnReceiptTarget } from "../../data/receipts/target";
import { type Action, reducer } from "../../data/reducer";
import {
  unlock as unlockAchievement,
  useAchievementWatcher,
} from "../../data/achievements";
import { useUserDataStorage } from "../../storage/useUserDataStorage";
import { describeActionSubject } from "../../data/action-summary";
import { useLang, useT } from "../../i18n";
import {
  useDevSeed,
  useEffectiveSettings,
  useIdleSignOut,
  useIsMobile,
  usePullToRefresh,
  useToast,
} from "../../hooks";
import { createDevSeedAdapter } from "../../storage/dev-seed-adapter";

// Non-default pages are lazy so their code (and the salary tax engine,
// property modals, etc.) stays out of the entry chunk — they only
// download when the user opens a sheet of that type. The budget page is
// the default first paint, so it stays statically imported above.
//
// The modal hosts are lazy too: together they pull in dozens of modals
// (~0.5 MB) that no first paint needs, so their chunks load after the
// initial render rather than blocking it. They each register a slice of
// the modal-dispatch handler table on mount, and the chrome (HeaderMenu,
// BottomBar) can fire a command before a host's chunk has resolved —
// `ModalDispatchProvider` holds such a command and replays it once the
// owning slice registers, so the deferral doesn't drop early clicks.
const AccountsPage = lazy(() =>
  import("../accounts/AccountsPage").then((m) => ({ default: m.AccountsPage })),
);
const ItemsPage = lazy(() =>
  import("../items/ItemsPage").then((m) => ({ default: m.ItemsPage })),
);
const PropertiesPage = lazy(() =>
  import("../properties/PropertiesPage").then((m) => ({
    default: m.PropertiesPage,
  })),
);
const SalaryPage = lazy(() =>
  import("../salary/SalaryPage").then((m) => ({ default: m.SalaryPage })),
);
const SavingsPage = lazy(() =>
  import("../savings/SavingsPage").then((m) => ({ default: m.SavingsPage })),
);
const LoansPage = lazy(() =>
  import("../loans/LoansPage").then((m) => ({ default: m.LoansPage })),
);
const UniversalModalHost = lazy(() =>
  import("./UniversalModalHost").then((m) => ({
    default: m.UniversalModalHost,
  })),
);
const AccountsModalHost = lazy(() =>
  import("./AccountsModalHost").then((m) => ({ default: m.AccountsModalHost })),
);
const SavingsModalHost = lazy(() =>
  import("./SavingsModalHost").then((m) => ({ default: m.SavingsModalHost })),
);
const LoansModalHost = lazy(() =>
  import("./LoansModalHost").then((m) => ({ default: m.LoansModalHost })),
);
const BudgetModalHost = lazy(() =>
  import("./BudgetModalHost").then((m) => ({ default: m.BudgetModalHost })),
);

type AppShellProps = {
  auth: AppShellAuth;
  storage: AppShellStorage;
  // App owns this ref and reads it from the cloud-link conflict path
  // when the user picks "replace with current budget"; AppShell's
  // job is to keep it pointed at whatever `useUserDataStorage` is
  // showing on screen so the upload reflects the latest in-memory edits.
  currentDataRef: React.MutableRefObject<UserData | null>;
};

// Gather every payslip path already in use across all salaries, so a
// fresh upload that would collide with another salary's payslip name
// gets a disambiguating suffix rather than overwriting it. The current
// salary's own path is excluded so replacing a payslip keeps the same
// tidy name. Mirrors `collectReceiptPaths` in `BudgetModalHost`.
function collectPayslipPaths(
  data: UserData,
  exclude: string | undefined,
): Set<string> {
  const paths = new Set<string>();
  for (const salary of data.salaries) {
    if (salary.payslipPath) paths.add(salary.payslipPath);
  }
  if (exclude) paths.delete(exclude);
  return paths;
}

// Reduce an item's resolved transaction link to the page-agnostic receipt
// target the receipt manager addresses — both carry the same ids, the link
// just adds the item-specific line-item snapshot the manager re-reads live.
function linkToReceiptTarget(link: ItemTxnLink): TxnReceiptTarget {
  return link.kind === "history"
    ? { kind: "history", accountId: link.accountId, entryId: link.entryId }
    : {
        kind: "row",
        sheetId: link.sheetId,
        sheetItemId: link.sheetItemId,
        rowId: link.rowId,
      };
}

export function AppShell({ auth, storage, currentDataRef }: AppShellProps) {
  const {
    user,
    password,
    hasOtherUsers,
    getEncryptionPassword,
    onSignOut,
    onSwitchUser,
    onCreateAccount,
    onDeleteAccount,
  } = auth;
  const {
    adapter,
    backend,
    dropboxConnected,
    gdriveConnected,
    folderConnected,
  } = storage;
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  // Resolve the subject of each dispatched action for the action-history
  // modal and undo / redo toasts. Captures `lang` so the (rare) settings
  // subject is named in the active language; re-created on a language
  // switch, which only re-stamps subjects recorded afterward.
  const describeSubject = useCallback(
    (action: Action, prev: UserData, next: UserData) =>
      describeActionSubject(action, prev, next, lang),
    [lang],
  );
  // Developer "Fake data" toggle. When active, swap in an ephemeral
  // in-memory adapter preloaded with seed data — substituting it here
  // (after the encryption / cloud-mirror wrapping in
  // `useStorageBackend`) keeps the fake bytes off every real backend.
  // The load effect in `useUserDataStorage` reloads whenever this
  // reference changes, so flipping the toggle off restores the real
  // adapter and reloads the user's untouched data. The dev adapter is
  // rebuilt fresh each activation; while active it stays referentially
  // stable even if the real `adapter` re-memos, so no spurious reload.
  const { active: devSeedActive } = useDevSeed();
  const devAdapter = useMemo(
    () => (devSeedActive ? createDevSeedAdapter() : null),
    [devSeedActive],
  );
  const effectiveAdapter = devAdapter ?? adapter;
  const {
    data,
    dispatch,
    status,
    dirty,
    saveNow,
    resolveKeepLocal,
    resolveKeepRemote,
    confirmShrinkSave,
    discardShrinkSave,
    undo,
    redo,
    canUndo,
    canRedo,
    historyEntries,
    historyIndex,
    jumpToHistory,
    reload,
  } = useUserDataStorage(effectiveAdapter, reducer, {
    beforeSerialize: userDataWithSavableRows,
    hasUnsavableContent: userDataHasUnsavableRows,
    userId: user.id,
    describeSubject,
  });
  // Pull-to-refresh wiring. Listens for a downward drag from the top
  // of the page; on release past the trigger distance, re-runs
  // `adapter.load()` via `reload()` so the user can pick up edits
  // pushed by another device. Gated off during the initial load, an
  // open conflict modal, or a paused shrink save — those states
  // already own the screen and a quietly-replaced in-memory state
  // would race with their resolution.
  const ptrEnabled =
    status.kind !== "loading" &&
    status.kind !== "conflict" &&
    status.kind !== "shrink-warning";
  const ptr = usePullToRefresh(reload, { enabled: ptrEnabled });
  // Watch for achievement unlocks. Runs derived predicates on each
  // state delta and drains the manual-unlock bus; new unlocks land
  // in `data.settings.unseenAchievements` via `recordAchievementUnlock`,
  // which the HeaderStar below reads to decide whether to glow.
  // Gated on a loaded budget so the placeholder `freshUserData()`
  // state never gets compared against the hydrated snapshot — that
  // comparison would briefly flip the star on while loading, then
  // off again the moment the adapter replaces state with the
  // persisted bucket.
  useAchievementWatcher(data, dispatch, status.kind !== "loading");
  // Mirror in-memory data into the App-owned ref so the cloud-link
  // conflict path can upload the latest budget. Updated on every render
  // because both data changes and ref-identity changes (after a sign-
  // out / sign-in round trip) need to land here.
  useEffect(() => {
    currentDataRef.current = data;
  }, [currentDataRef, data]);
  const searchModal = useSearchModal({ data });
  const { setSearchOpen, scrollToRowRequest } = searchModal;

  useToastEffects({
    dropboxConnected,
    gdriveConnected,
    folderConnected,
    status,
    toast,
  });
  // Account ids for the import-history and view-history modals.
  const deletePrompts = useDeletePrompts();
  const { setDeletePrompt, setCorrectionDeletePrompt, setHistoryEditPrompt } =
    deletePrompts;
  // null = closed; otherwise the sheet the user is downloading. The

  const activeSheet =
    data.sheets.find((s) => s.id === data.activeSheetId) ?? data.sheets[0];

  // The active sheet's first AccountBudget block. For sheets of type
  // "budget" this is what the rest of the view renders against. For
  // "accounts" sheets there's no budget item — `activeBudget` is null
  // and we render `AccountsPage` in place of `BudgetPage`. The
  // budget-only callbacks below fall back to a stub when null so the
  // type checker stays happy; they're never invoked while an accounts
  // sheet is active because the budget UI isn't on screen.
  const activeBudget: AccountBudget | null =
    activeSheet.items.find(
      (it): it is AccountBudget => it.type === "accountBudget",
    ) ?? null;
  const stubBudget = useMemo<AccountBudget>(
    () => ({
      id: "stub",
      type: "accountBudget",
      accountId: null,
      columns: [],
      rows: [],
    }),
    [],
  );
  const activeItem: AccountBudget = activeBudget ?? stubBudget;

  const sheetId = activeSheet.id;
  const itemId = activeItem.id;

  const editPrompts = useEditPrompts({
    activeRows: activeItem.rows,
    activeAccountId: activeItem.accountId,
    history: data.history,
  });
  const {
    setEditPrompt,
    setEditRowPrompt,
    setSplitPrompt,
    setLineItemsPrompt,
    setPendingSeriesEdit,
  } = editPrompts;

  // Merged category / type lists exposed to every picker, renderer,
  // and resolver. Built-in `PRESET_CATEGORIES` / `PRESET_ENTRY_TYPES`
  // come first (minus the ones the user has hidden via Settings),
  // followed by the user-added entries on `data.categories` /
  // `data.types`. Computing them once here keeps the merge rules in
  // one place — pickers downstream stay unaware of the preset / user
  // split.
  //
  // The dependency list is narrowed to the sub-fields `allTypes` /
  // `allCategories` actually consume so a cell-edit (which only flips
  // `data.sheets`) doesn't mint fresh arrays here. Without that, the
  // new references propagate to `BudgetPage`'s `types` / `categories`
  // props and silently invalidate every downstream memo — including
  // `buildSynthesizedRows`, which is meant to skip across keystrokes
  // (see the comment in BudgetPage near that useMemo). The result was
  // every history entry re-synthesized + every match rule re-tested
  // on every keystroke; for a budget with a few thousand history
  // entries and a handful of rules that was the dominant cost of
  // typing in a cell.
  const allCategoriesMerged = useMemo(
    () => allCategories(data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.hiddenPresetCategoryIds, data.categories],
  );
  const allTypesMerged = useMemo(
    () => allTypes(data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.hiddenPresetTypeIds, data.presetTypeKindOverrides, data.types],
  );

  // (company, type) tallies for the auto-fill: when the user picks a
  // company on a row whose type isn't set, and the company has been
  // paired with one single type more times than the user-configured
  // threshold, we auto-fill the type. Walks every budget row and
  // history-entry override on every relevant data change — small
  // surface, cheap enough not to bother caching across renders.
  const companyTypeHints = useMemo(() => computeCompanyTypeHints(data), [data]);
  const companyTypeSuggestions = useMemo(
    () => companyTypeSuggestionsFromHints(companyTypeHints),
    [companyTypeHints],
  );

  // Warn before unload when the in-memory state has changes the
  // auto-save deliberately skipped (e.g. a half-filled row). The
  // browser shows its own generic confirmation prompt; we just have
  // to opt in.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const { handleUndo, handleRedo } = useUndoRedo({
    canUndo,
    canRedo,
    historyEntries,
    historyIndex,
    undo,
    redo,
    toast,
  });

  // Resolve the bucketed `PersistedSettings` into the flat shape every
  // downstream component already consumes. The hook subscribes to the
  // viewport breakpoint so resizing a desktop browser narrow flips
  // `fontScale`, `showCurrency`, `abbreviateNumbers`, etc. to the
  // mobile bucket's values immediately.
  const isMobile = useIsMobile();
  const effectiveSettings = useEffectiveSettings(data.settings);
  // Bucket-canonical language preference, consumed by the download flow
  // (filename / number formatting). The Appearance projection that also
  // reads it now lives in `UniversalModalHost` alongside the SettingsModal
  // preview draft it overlays — see `useAppearanceProjection` there.
  const language = data.settings.language;

  const isGuest = user.isDefault === true;
  const { warningSecondsLeft, onStaySignedIn } = useIdleSignOut({
    user,
    password,
    ttlMs: data.settings.sessionTimeoutMinutes * 60_000,
    onSignOut,
  });

  const rowMutations = useRowMutations({
    sheetId,
    itemId,
    activeRows: activeItem.rows,
    activeColumns: activeItem.columns,
    activeAccountId: activeItem.accountId,
    history: data.history,
    companyTypeSuggestions,
    effectiveSettings,
    setPendingSeriesEdit,
    setHistoryEditPrompt,
    setCorrectionDeletePrompt,
    dispatch,
  });
  const {
    onUpdateCell,
    onCommitCell,
    onSetFiscalMonthShift,
    onSetSeriesPrimaryIncome,
    onClearMerchantHints,
    onClearRecurringDismissals,
    onClearTransferDismissals,
    onClearIgnoredItemEntries,
    onClearItemFindExclusions,
    onToggleRowTransfer,
    onEditHistoryRequest,
    onUpdateHistoryEntry,
    onApplyMetadataToMatchingHistory,
    onSplitHistoryEntry,
    onSetRowCompany,
    onSetRowNoCompany,
    onCorrectionDeleteRequest,
  } = rowMutations;
  const onAddRow = useCallback(
    (date: string) => dispatch({ type: "addRow", sheetId, itemId, date }),
    [dispatch, sheetId, itemId],
  );
  const onDeleteRequest = useCallback(
    (row: Row) => {
      // A row that hasn't been persisted yet (no description + amount) is
      // a transient placeholder — discard it without prompting.
      if (!isRowSavable(row, activeItem.columns)) {
        dispatch({ type: "deleteRows", sheetId, itemId, rowIds: [row.id] });
        return;
      }
      setDeletePrompt({ kind: "delete", row });
    },
    [activeItem.columns, dispatch, sheetId, itemId, setDeletePrompt],
  );
  const onEditRequest = useCallback(
    (row: Row) => {
      setEditPrompt({ kind: "edit", row });
    },
    [setEditPrompt],
  );
  const onEditRowRequest = useCallback(
    (row: Row) => {
      // Synthesized rows (transfer / history) and balance-correction
      // rows have their own edit flows; the row component already
      // suppresses the long-press and the pen button on them, but guard
      // here too so a stray dispatch never opens the modal on a row it
      // can't meaningfully edit.
      if (row.kind !== "user") return;
      setEditRowPrompt({ kind: "edit-row", row });
    },
    [setEditRowPrompt],
  );
  const onSplitRequest = useCallback(
    (row: Row) => {
      // Transfers have their own edit modal, correction rows are
      // display-only — splitting either of those is meaningless. History
      // rows are allowed: splitting a bank entry writes a `splits` array
      // on the underlying `HistoryEntry`, which the synthesizer fans out
      // into multiple rows on the next render.
      if (row.kind === "transfer" || row.kind === "correction") return;
      setSplitPrompt({ kind: "split", row });
    },
    [setSplitPrompt],
  );

  const onLineItemsRequest = useCallback(
    (row: Row) => {
      // Same guards as splitting: transfers and balance corrections aren't
      // purchases. History rows are allowed — their links live on the
      // underlying `HistoryEntry` and route through the dedicated action.
      if (row.kind === "transfer" || row.kind === "correction") return;
      setLineItemsPrompt({ kind: "line-items", row });
    },
    [setLineItemsPrompt],
  );
  const onReorderColumns = useCallback(
    (fromId: string, toId: string) =>
      dispatch({ type: "reorderColumns", sheetId, itemId, fromId, toId }),
    [dispatch, sheetId, itemId],
  );
  const onImport = useCallback(
    (next: UserData) => dispatch({ type: "replace", data: next }),
    [dispatch],
  );
  const taxonomyCrud = useTaxonomyCrud({ dispatch });
  const {
    onCreateCategory,
    onCreateType,
    onCreateCompany,
    onCreateTag,
    onCreateSubtype,
    onCreateItem,
  } = taxonomyCrud;
  const onSaveSettings = useCallback(
    (draft: Settings) =>
      dispatch({
        type: "updateSettings",
        draft,
        scope: isMobile ? "mobile" : "desktop",
      }),
    [dispatch, isMobile],
  );
  const { sheetPanelRef, onSelectSheet, onClickHeaderTitle } = useSheetNav({
    sheets: data.sheets,
    activeSheetId: data.activeSheetId,
    effectiveSettings,
    dispatch,
  });
  const sheetMetaDialog = useSheetMetaDialog({
    sheets: data.sheets,
    dispatch,
    toast,
  });
  const { onOpenNewSheet, onOpenEditSheet } = sheetMetaDialog;
  const downloadFlow = useDownloadFlow({
    data,
    effectiveSettings,
    dispatch,
    isMobile,
    language,
    allTypesMerged,
    allCategoriesMerged,
  });
  const { onOpenDownloadSheet } = downloadFlow;

  // Account / transfer modal handlers. Kept on the AppShell so
  // they share the same dispatch and Account state as the rest of the
  // workspace — the modals themselves stay pure presentational shells.
  const accountDialog = useAccountDialog({ data, dispatch, toast });
  const {
    onOpenCreateAccount,
    onOpenEditAccount,
    onRequestDeleteAccount,
    onOpenUpdateBalance,
  } = accountDialog;

  // Savings-account modal handlers (CRUD + dated-balance updates). Kept on
  // the AppShell alongside the account dialog so it shares the same dispatch
  // and state; savings render on their own sheet but live in the same
  // workspace data.
  const savingDialog = useSavingDialog({ data, dispatch, toast });
  const {
    onOpenCreateSaving,
    onOpenEditSaving,
    onRequestDeleteSaving,
    onOpenUpdateBalance: onOpenUpdateSavingBalance,
  } = savingDialog;

  // Loan modal handlers (CRUD + payment import). Kept on the AppShell
  // alongside the saving dialog for the same reason — loans render on
  // their own sheet but live in the same workspace data.
  const loanDialog = useLoanDialog({ data, dispatch, toast });
  const {
    onOpenCreateLoan,
    onOpenEditLoan,
    onRequestDeleteLoan,
    onOpenPayments: onOpenLoanPayments,
    onOpenImportPayments: onOpenLoanImportPayments,
  } = loanDialog;

  // Bank-history import / viewer flows. The Accounts page surfaces a
  // per-row Upload button (always enabled) and a History viewer
  // button (enabled when entries exist). Both are scoped to the
  // clicked account so the import flow never has to ask "which
  // account is this for?".
  const importFlow = useImportFlow({
    data,
    activeItem,
    sheetId,
    itemId,
    dispatch,
  });
  const {
    onOpenImportHistory,
    onOpenViewHistory,
    onOpenCutHistory,
    onTriageMonth,
    onMergeConflictIntoHistory,
    onMergeConflictUserRows,
  } = importFlow;

  const transferFlow = useTransferFlow({ data, activeBudget, dispatch });
  const { onTransferRequest, onOpenCreateTransfer, onOpenEditTransfer } =
    transferFlow;

  const complexEntry = useComplexEntry({
    activeBudget,
    sheetId,
    itemId,
    dispatch,
    closeEditPrompt: useCallback(() => setEditPrompt(null), [setEditPrompt]),
  });
  const {
    onAddComplex,
    onPromoteRecurringCandidate,
    onDismissRecurringCandidate,
    onDismissAllRecurringCandidates,
  } = complexEntry;

  const dateCol = useMemo(
    () => findColumnByType(activeItem.columns, "date"),
    [activeItem.columns],
  );

  const bulkSelection = useBulkSelection({
    sheetId,
    itemId,
    activeItem,
    startOfMonth: data.settings.startOfMonth,
    dispatch,
    toast,
    dateCol,
  });
  const {
    selectMode,
    selectedIds,
    onToggleSelect,
    onToggleSelectMonth,
    onToggleSelectMode,
    onCancelSelect,
    onBulkEdit,
    onBulkDelete,
    onBulkMove,
    onBulkCopy,
    onCopyRequest,
  } = bulkSelection;

  // Salary sheets run their own select-many flow (employer / tax bulk
  // edit + delete, no move / copy). The active sheet decides which of
  // the two drives the BottomBar's select toggle + action bar.
  const isSalarySheet = activeSheet.type === "salary";
  const salaryBulk = useSalaryBulkSelection({
    salaries: data.salaries,
    dispatch,
  });

  // Payslip attachment, mirroring the item-receipt flow below. The storage
  // adapter lives here, so the upload / download / remove callbacks are
  // built here and threaded into SalaryPage's shared attachment modal.
  // Each upload / remove commits the file AND the `Salary.payslipPath`
  // reference together, since the modal is opened straight from a row's
  // "…" menu rather than riding a parent form's Save.
  const canUploadPayslip = adapter?.capabilities.has("payslips") ?? false;
  const onUploadPayslip = useCallback(
    async (salary: Salary, file: File): Promise<string> => {
      if (!adapter?.payslips) throw new Error("payslips unavailable");
      const employerName = salary.employerId
        ? data.employers.find((e) => e.id === salary.employerId)?.name
        : undefined;
      const path = buildPayslipPath({
        employerName,
        fallbackLabel: t("salary.payslipFallbackName"),
        month: salary.date.slice(0, 7),
        salaryId: salary.id,
        extension: extensionOf(file.name),
        // Excluding the salary's own current path reuses its tidy name on
        // replace, so the new file overwrites the old in place — no orphan.
        usedPaths: collectPayslipPaths(data, salary.payslipPath),
      });
      await adapter.payslips.upload(path, file);
      unlockAchievement("payslipKeeper");
      dispatch({
        type: "updateSalary",
        salaryId: salary.id,
        patch: { payslipPath: path },
      });
      return path;
    },
    [adapter, data, t, dispatch],
  );
  // Download the payslip blob for the in-app preview. We do NOT
  // `window.open` a `blob:` URL: on iOS that hangs on a blank page inside
  // in-app browsers and standalone PWAs, and opening a window after this
  // `await` loses the user-gesture so the popup is blocked. The shared
  // attachment modal renders the blob inline instead.
  const onDownloadPayslip = useCallback(
    async (path: string): Promise<Blob> => {
      if (!adapter?.payslips) throw new Error("payslips unavailable");
      const blob = await adapter.payslips.download(path);
      if (!blob) throw new Error("payslip missing");
      return blob;
    },
    [adapter],
  );
  // Delete the payslip file and clear the reference — the "Remove" action
  // in the shared attachment modal.
  const onRemovePayslip = useCallback(
    async (salary: Salary, path: string): Promise<void> => {
      if (!adapter?.payslips) throw new Error("payslips unavailable");
      await adapter.payslips.remove(path);
      dispatch({
        type: "updateSalary",
        salaryId: salary.id,
        patch: { payslipPath: undefined },
      });
    },
    [adapter, dispatch],
  );

  // Transaction-generic receipt handling — the file write plus the data
  // commit for ANY transaction's receipt. Shared by the Items sheet and the
  // Properties repairs view so each page only supplies its target + naming.
  const receiptManager = useReceiptManager({
    data,
    adapter,
    settings: effectiveSettings,
    dispatch,
  });
  const { canManageReceipt, uploadReceipt, downloadReceipt, removeReceipt } =
    receiptManager;

  // Property-attachment handling — repair receipts and uploaded files, both
  // living in the per-property `properties/` store. Owns the file write plus
  // the data commit for each, threaded to the Properties page.
  const propertyAttachments = usePropertyAttachments({
    data,
    adapter,
    dispatch,
  });

  // Item receipt attachment. A receipt hangs off the single transaction an
  // item is linked to (an item can belong to at most one purchase), so
  // managing an item's receipt reads / writes the linked row's or history
  // entry's `receiptPath` — `findItemLink` resolves which, and
  // `linkToReceiptTarget` reduces it to the generic address the receipt
  // manager addresses. The file is named off the item (its name + acquired
  // date + type) for a recognisable filename on the Items sheet.
  const canManageItemReceipt = canManageReceipt;
  const onUploadItemReceipt = useCallback(
    async (item: Item, file: File): Promise<string> => {
      const link = findItemLink(data, item.id);
      if (!link) throw new Error("item not linked to a transaction");
      const subtype = item.subtypeId
        ? data.subtypes.find((s) => s.id === item.subtypeId)
        : undefined;
      const typeLabel = subtype
        ? allTypesMerged.find((ty) => ty.id === subtype.typeId)?.name
        : undefined;
      return uploadReceipt(linkToReceiptTarget(link), file, {
        companyName: item.name,
        entryId: item.id,
        entryDate: item.acquiredAt,
        typeLabel,
      });
    },
    [data, allTypesMerged, uploadReceipt],
  );
  const onDownloadItemReceipt = downloadReceipt;
  const onRemoveItemReceipt = useCallback(
    async (item: Item, path: string): Promise<void> => {
      const link = findItemLink(data, item.id);
      if (!link) return;
      await removeReceipt(linkToReceiptTarget(link), path);
    },
    [data, removeReceipt],
  );
  // Accounts / items pages have no row-level select-many — the toggle is
  // disabled there instead of dropping into an empty selection mode.
  const selectSupported = activeSheet.type === "budget" || isSalarySheet;

  const matchRuleUi = useMatchRuleUi({ data, activeItem, dispatch, toast });
  const { onMatchRuleRequest } = matchRuleUi;

  // Base modal-handler slice for ModalDispatchProvider — the page chrome
  // (header menu, bottom bar, header star, sync status), the page title
  // menus (budget / accounts), and the budget table's per-row affordances
  // name the modal they want instead of each carrying an opener callback
  // prop. These are the handlers whose state AppShell still owns; modal
  // hosts that own a hook's state register their own slice (see
  // `useRegisterModalHandlers`), and the provider merges them at dispatch
  // time. Defined below the transfer / bulk / match-rule hooks so their
  // `on*Request` openers are in scope. Open-side achievement unlocks (the
  // search "detective") ride along here so the chrome stays unaware of
  // them; the budget-row handlers keep their own guards (e.g. `deleteRow`
  // discards an unsaved placeholder row).
  const modalHandlers = useMemo<Partial<ModalCommandHandlers>>(
    () => ({
      openSearch: () => {
        unlockAchievement("detective");
        setSearchOpen(true);
      },
      openNewSheet: onOpenNewSheet,
      openEditSheet: onOpenEditSheet,
      openDownloadSheet: onOpenDownloadSheet,
      toggleSheetFavorite: (sheetId: string) => {
        const target = data.sheets.find((s) => s.id === sheetId);
        if (!target) return;
        if (!target.favorite) {
          const count = data.sheets.filter((s) => s.favorite).length;
          if (count >= MAX_FAVORITE_SHEETS) {
            toast.push({ kind: "info", message: t("sheet.favoritesFull") });
            return;
          }
        }
        dispatch({ type: "toggleSheetFavorite", sheetId });
      },
      editEntry: onEditRequest,
      editRow: onEditRowRequest,
      deleteRow: onDeleteRequest,
      splitRow: onSplitRequest,
      lineItems: onLineItemsRequest,
      transferRow: onTransferRequest,
      matchRule: onMatchRuleRequest,
      editHistory: onEditHistoryRequest,
      copyRow: onCopyRequest,
      correctionDelete: onCorrectionDeleteRequest,
    }),
    [
      setSearchOpen,
      onOpenNewSheet,
      onOpenEditSheet,
      onOpenDownloadSheet,
      data.sheets,
      dispatch,
      toast,
      t,
      onEditRequest,
      onEditRowRequest,
      onDeleteRequest,
      onSplitRequest,
      onLineItemsRequest,
      onTransferRequest,
      onMatchRuleRequest,
      onEditHistoryRequest,
      onCopyRequest,
      onCorrectionDeleteRequest,
    ],
  );

  return (
    <ModalDispatchProvider handlers={modalHandlers}>
      {/* The BottomBar is `position: sticky; bottom: 0` in browser
          mode (so the AddRow at the foot of the last month ends its
          scroll just above the bar) and `position: fixed; inset: auto
          0 0 0` in installed-PWA mode (see `src/styles.css`). The
          `data-budget-shell` and `data-budget-main` attributes are the
          hooks the standalone-mode rules target — wrapper pinned to
          `min-height: 100dvh`, main given a `padding-bottom` reserve
          so the AddRow clears the now-out-of-flow bar. */}
      <div
        data-budget-shell
        className="mx-auto flex min-h-svh max-w-full flex-col px-1 md:px-5"
      >
        {/* Pull-to-refresh pip lives outside the `data-modal-background`
          wrapper so an open modal's `inert` doesn't disable its
          fixed-position rendering. The hook itself gates on
          `[aria-modal="true"]` so the gesture is suppressed while a
          modal is up — this is purely so the pip can finish its
          slide-out animation if a modal opens mid-pull. */}
        <PullToRefreshIndicator
          state={ptr.state}
          pullDistance={ptr.pullDistance}
        />
        {devSeedActive && (
          <div
            role="status"
            className="border-2 border-danger bg-surface-3 px-2 py-1 text-center text-xs font-bold tracking-wide text-danger uppercase"
          >
            {t("settings.developer.fakeDataBanner")}
          </div>
        )}
        {/* `data-modal-background` is the toggle target for the modal
          lifecycle hook in src/utils/scroll-lock.ts — any open modal
          flips `inert` on every match, freezing focus and pointer
          events on the chrome behind the backdrop. `display: contents`
          keeps the flex column layout unchanged. */}
        <div className="contents" data-modal-background>
          {/* `pt` adds `env(safe-area-inset-top)` so the header content
            clears the iOS status bar / Dynamic Island when running as
            an installed PWA (where `apple-mobile-web-app-status-bar-style`
            is `black-translucent` and the page extends edge-to-edge under
            the system chrome). Without it, the title overlaps the clock
            and battery indicators. The `data-app-header` hook lets the
            standalone-mode block in `styles.css` shave the extra
            breathing room so the gap above the header matches the
            Dynamic Island's tiny margin to the top edge. */}
          <header
            data-app-header
            className="sticky top-0 z-30 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-page-bg px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 md:mb-6 md:gap-x-4 md:gap-y-3 md:px-0 md:pt-[calc(1rem+env(safe-area-inset-top))] md:pb-4"
          >
            <button
              type="button"
              onClick={onClickHeaderTitle}
              title={headerActionDescription(
                effectiveSettings.headerAction,
                data.sheets,
                t,
              )}
              className="inline-flex cursor-pointer items-center gap-2 rounded border border-transparent bg-transparent p-0 text-left hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
            >
              <img
                src="/icons/icon-64.png"
                srcSet="/icons/icon-64.png 1x, /icons/icon-256.png 4x"
                alt=""
                aria-hidden
                width={24}
                height={24}
                className="h-6 w-6 rounded-sm"
              />
              <h1 className="m-0 text-base font-bold tracking-wide text-fg-bright">
                budget
              </h1>
            </button>
            <SheetSwitcher
              sheets={data.sheets}
              activeSheetId={activeSheet.id}
              onSelectSheet={onSelectSheet}
            />
            <div
              role="toolbar"
              aria-label={t("app.headerToolbar")}
              className="ml-auto inline-flex items-center gap-2"
            >
              <HeaderStar
                unseenCount={data.settings.unseenAchievements.length}
              />
              {backend === "dropbox" || backend === "gdrive" ? (
                <SyncStatus
                  providerName={
                    backend === "dropbox" ? "Dropbox" : "Google Drive"
                  }
                  status={status}
                  dirty={dirty}
                  onSave={saveNow}
                />
              ) : (
                <SaveStateButton
                  dirty={dirty}
                  saving={status.kind === "saving"}
                  onSave={saveNow}
                />
              )}
              <HeaderMenu
                user={user}
                hasOtherUsers={hasOtherUsers}
                onSignOut={onSignOut}
                onSwitchUser={onSwitchUser}
                onCreateAccount={onCreateAccount}
              />
            </div>
          </header>
          {/* `<main>` stays as the page-level landmark; the inner wrapper
            is a labelled region named after the active sheet (the
            BottomBar tablist that used to label it was replaced by the
            header SheetSwitcher dropdown). `tabIndex={-1}` lets
            `Skip to content`-style jumps move focus into the panel
            without it being part of the normal keyboard tour. */}
          <main
            data-budget-main
            className="flex flex-1 flex-col [overflow-x:clip]"
          >
            <div
              ref={sheetPanelRef}
              role="region"
              id={`sheet-panel-${activeSheet.id}`}
              aria-label={activeSheet.name}
              tabIndex={-1}
              className="flex-1 will-change-transform"
            >
              <Suspense fallback={<AppLoading />}>
                {status.kind === "loading" ? (
                  <AppLoading />
                ) : activeSheet.type === "accounts" ? (
                  <AccountsPage
                    sheet={activeSheet}
                    data={data}
                    settings={effectiveSettings}
                    onCreateAccount={onOpenCreateAccount}
                    onEditAccount={onOpenEditAccount}
                    onDeleteAccount={onRequestDeleteAccount}
                    onUpdateBalance={onOpenUpdateBalance}
                    onCreateTransfer={onOpenCreateTransfer}
                    onEditTransfer={onOpenEditTransfer}
                    onImportHistory={onOpenImportHistory}
                    onViewHistory={onOpenViewHistory}
                    onCutHistory={onOpenCutHistory}
                  />
                ) : activeSheet.type === "items" ? (
                  <ItemsPage
                    sheet={activeSheet}
                    data={data}
                    settings={effectiveSettings}
                    onDeleteItem={(itemId) =>
                      dispatch({ type: "deleteItem", itemId })
                    }
                    canManageReceipt={canManageItemReceipt}
                    onUploadReceipt={onUploadItemReceipt}
                    onDownloadReceipt={onDownloadItemReceipt}
                    onRemoveReceipt={onRemoveItemReceipt}
                  />
                ) : activeSheet.type === "properties" ? (
                  <PropertiesPage
                    sheet={activeSheet}
                    data={data}
                    settings={effectiveSettings}
                    dispatch={dispatch}
                    attachments={propertyAttachments}
                  />
                ) : activeSheet.type === "salary" ? (
                  <SalaryPage
                    sheet={activeSheet}
                    data={data}
                    settings={effectiveSettings}
                    dispatch={dispatch}
                    selectMode={salaryBulk.selectMode}
                    selectedIds={salaryBulk.selectedIds}
                    onToggleSelect={salaryBulk.onToggleSelect}
                    onToggleSelectMany={salaryBulk.onToggleSelectMany}
                    bulkEditOpen={salaryBulk.bulkEditOpen}
                    onCloseBulkEdit={() => salaryBulk.setBulkEditOpen(false)}
                    onApplyBulk={salaryBulk.onApplyBulk}
                    bulkDeleteOpen={salaryBulk.bulkDeleteOpen}
                    onCloseBulkDelete={() =>
                      salaryBulk.setBulkDeleteOpen(false)
                    }
                    onConfirmBulkDelete={salaryBulk.onConfirmBulkDelete}
                    canManagePayslip={canUploadPayslip}
                    onUploadPayslip={onUploadPayslip}
                    onDownloadPayslip={onDownloadPayslip}
                    onRemovePayslip={onRemovePayslip}
                  />
                ) : activeSheet.type === "savings" ? (
                  <SavingsPage
                    sheet={activeSheet}
                    data={data}
                    settings={effectiveSettings}
                    onCreateSaving={onOpenCreateSaving}
                    onEditSaving={onOpenEditSaving}
                    onUpdateBalance={onOpenUpdateSavingBalance}
                    onRequestDeleteSaving={onRequestDeleteSaving}
                    onImportHistory={onOpenImportHistory}
                    onViewHistory={onOpenViewHistory}
                    onCutHistory={onOpenCutHistory}
                  />
                ) : activeSheet.type === "loans" ? (
                  <LoansPage
                    sheet={activeSheet}
                    data={data}
                    settings={effectiveSettings}
                    onCreateLoan={onOpenCreateLoan}
                    onEditLoan={onOpenEditLoan}
                    onRequestDeleteLoan={onRequestDeleteLoan}
                    onImportPayments={onOpenLoanImportPayments}
                    onViewPayments={onOpenLoanPayments}
                  />
                ) : (
                  <>
                    <BudgetRecurringCandidatesPanel
                      history={
                        activeItem.accountId
                          ? (data.history[activeItem.accountId] ?? [])
                          : []
                      }
                      dismissedKeys={data.recurringDismissals}
                      merchantHints={data.merchantHints}
                      types={allTypesMerged}
                      settings={effectiveSettings}
                      onPromote={onPromoteRecurringCandidate}
                      onDismiss={onDismissRecurringCandidate}
                      onDismissAll={onDismissAllRecurringCandidates}
                    />
                    <BudgetPage
                      sheet={activeSheet}
                      item={activeItem}
                      data={data}
                      types={allTypesMerged}
                      categories={allCategoriesMerged}
                      companies={data.companies}
                      companyTypeSuggestions={companyTypeSuggestions}
                      companyTypeHints={companyTypeHints}
                      onCreateType={onCreateType}
                      onCreateCategory={onCreateCategory}
                      onCreateCompany={onCreateCompany}
                      accounts={data.accounts}
                      transfers={data.transfers}
                      history={
                        activeItem.accountId
                          ? (data.history[activeItem.accountId] ?? [])
                          : []
                      }
                      merchantHints={data.merchantHints}
                      matchRules={data.matchRules}
                      openingBalance={
                        activeItem.accountId
                          ? (data.accounts.find(
                              (a) => a.id === activeItem.accountId,
                            )?.openingBalance ?? 0)
                          : 0
                      }
                      settings={effectiveSettings}
                      selectMode={selectMode}
                      selectedIds={selectedIds}
                      scrollToRowRequest={scrollToRowRequest}
                      onUpdateCell={onUpdateCell}
                      onCommitCell={onCommitCell}
                      onAddRow={onAddRow}
                      onAddComplex={onAddComplex}
                      onToggleRowTransfer={onToggleRowTransfer}
                      onSetFiscalMonthShift={onSetFiscalMonthShift}
                      onUpdateHistoryEntry={onUpdateHistoryEntry}
                      onApplyMetadataToMatchingHistory={
                        onApplyMetadataToMatchingHistory
                      }
                      onSplitHistoryEntry={onSplitHistoryEntry}
                      tags={data.tags}
                      onCreateTag={onCreateTag}
                      onReorderColumns={onReorderColumns}
                      onToggleSelect={onToggleSelect}
                      onToggleSelectMonth={onToggleSelectMonth}
                      onMergeConflictIntoHistory={onMergeConflictIntoHistory}
                      onMergeConflictUserRows={onMergeConflictUserRows}
                      onTriageMonth={onTriageMonth}
                      onSetRowCompany={onSetRowCompany}
                      onSetRowNoCompany={onSetRowNoCompany}
                    />
                  </>
                )}
              </Suspense>
            </div>
          </main>
          {status.kind === "loading" ? null : (
            <BottomBar
              favoriteSheets={data.sheets.filter((s) => s.favorite)}
              activeSheetId={activeSheet.id}
              onSelectSheet={onSelectSheet}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={() => {
                unlockAchievement("secondThoughts");
                handleUndo();
              }}
              onRedo={handleRedo}
              selectSupported={selectSupported}
              selectMode={
                selectSupported &&
                (isSalarySheet ? salaryBulk.selectMode : selectMode)
              }
              onToggleSelectMode={
                isSalarySheet
                  ? salaryBulk.onToggleSelectMode
                  : onToggleSelectMode
              }
              bulkSelectedCount={
                isSalarySheet ? salaryBulk.selectedIds.size : selectedIds.size
              }
              onBulkEdit={isSalarySheet ? salaryBulk.onBulkEdit : onBulkEdit}
              // Salaries are pinned to their pay month — no move / copy.
              onBulkMove={isSalarySheet ? undefined : onBulkMove}
              onBulkCopy={isSalarySheet ? undefined : onBulkCopy}
              onBulkDelete={
                isSalarySheet ? salaryBulk.onBulkDelete : onBulkDelete
              }
              onBulkCancel={
                isSalarySheet ? salaryBulk.onCancelSelect : onCancelSelect
              }
            />
          )}
        </div>
        <Suspense fallback={null}>
          <UniversalModalHost
            data={data}
            effectiveSettings={effectiveSettings}
            dispatch={dispatch}
            user={user}
            isGuest={isGuest}
            storageState={{
              status,
              dirty,
              saveNow,
              resolveKeepLocal,
              resolveKeepRemote,
              confirmShrinkSave,
              discardShrinkSave,
              historyEntries,
              historyIndex,
              jumpToHistory,
            }}
            storage={storage}
            auth={{ getEncryptionPassword, onDeleteAccount }}
            warningSecondsLeft={warningSecondsLeft}
            onStaySignedIn={onStaySignedIn}
            sheetMetaDialog={sheetMetaDialog}
            downloadFlow={downloadFlow}
            searchModal={searchModal}
            searchBulk={{
              selectMode,
              selectedIds,
              activeSheetId: activeSheet.id,
              onToggleSelectMode,
              onToggleSelect,
              onSelectMany: (rowIds) => onToggleSelectMonth(rowIds, true),
              onSelectSheet,
              onBulkEdit,
              onBulkMove,
              onBulkCopy,
              onBulkDelete,
              onBulkCancel: onCancelSelect,
            }}
            taxonomyCrud={taxonomyCrud}
            matchRuleUi={matchRuleUi}
            onClearMerchantHints={onClearMerchantHints}
            onClearRecurringDismissals={onClearRecurringDismissals}
            onClearTransferDismissals={onClearTransferDismissals}
            onClearIgnoredItemEntries={onClearIgnoredItemEntries}
            onClearItemFindExclusions={onClearItemFindExclusions}
            onSaveSettings={onSaveSettings}
            onImport={onImport}
          />
          <AccountsModalHost
            data={data}
            effectiveSettings={effectiveSettings}
            categories={allCategoriesMerged}
            types={allTypesMerged}
            accountDialog={accountDialog}
            importFlow={importFlow}
            transferFlow={transferFlow}
            onCreateType={onCreateType}
            onCreateCategory={onCreateCategory}
          />
          <SavingsModalHost
            effectiveSettings={effectiveSettings}
            savingDialog={savingDialog}
          />
          <LoansModalHost
            data={data}
            effectiveSettings={effectiveSettings}
            loanDialog={loanDialog}
          />
          <BudgetModalHost
            data={data}
            effectiveSettings={effectiveSettings}
            categories={allCategoriesMerged}
            types={allTypesMerged}
            companyTypeSuggestions={companyTypeSuggestions}
            companyTypeHints={companyTypeHints}
            sheetId={sheetId}
            itemId={itemId}
            activeItem={activeItem}
            dateCol={dateCol}
            dispatch={dispatch}
            editPrompts={editPrompts}
            deletePrompts={deletePrompts}
            complexEntry={complexEntry}
            matchRuleUi={matchRuleUi}
            bulkSelection={bulkSelection}
            onCreateType={onCreateType}
            onCreateCategory={onCreateCategory}
            onCreateCompany={onCreateCompany}
            onCreateTag={onCreateTag}
            onCreateSubtype={onCreateSubtype}
            onCreateItem={onCreateItem}
            onSetSeriesPrimaryIncome={onSetSeriesPrimaryIncome}
          />
        </Suspense>
      </div>
    </ModalDispatchProvider>
  );
}
