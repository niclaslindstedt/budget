// oss-spec:allow-large-file: top-level component owns the auth shell, the
// per-user adapter wiring, and the full UserData reducer state machine as
// one cohesive unit; splitting would either fragment the state machine or
// drag component-typed action payloads (BulkPatch, EditPatch,
// ComplexEntryDraft) into data/ in violation of the dependency direction.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListChecks, Settings as SettingsIcon } from "lucide-react";

import { AccountModal, type AccountDraft } from "./components/AccountModal";
import { AccountsSheetView } from "./components/AccountsSheetView";
import { ApplySeriesEditDialog } from "./components/ApplySeriesEditDialog";
import { AuthScreen } from "./components/AuthScreen";
import { BudgetLoading } from "./components/BudgetLoading";
import { BulkActionBar } from "./components/BulkActionBar";
import { BulkEditModal, type BulkPatch } from "./components/BulkEditModal";
import { SheetModal, type SheetDraft } from "./components/SheetModal";
import {
  TransactionModal,
  type TransactionDraft,
  type TransactionModalRequest,
} from "./components/TransactionModal";
import { SheetTabs } from "./components/SheetTabs";
import {
  ComplexEntryModal,
  type ComplexEntryDraft,
} from "./components/ComplexEntryModal";
import { ConfirmDialog, type ConfirmAction } from "./components/ConfirmDialog";
import {
  EditEntryModal,
  type EditPatch,
  type EditScope,
} from "./components/EditEntryModal";
import { ImportExportControls } from "./components/ImportExportControls";
import { MoveCopyModal } from "./components/MoveCopyModal";
import { SaveStateButton } from "./components/SaveStateButton";
import { SettingsModal } from "./components/SettingsModal";
import { SheetView } from "./components/SheetView";
import { SyncDetailsModal } from "./components/SyncDetailsModal";
import { SyncStatus } from "./components/SyncStatus";
import { UserMenu } from "./components/UserMenu";
import { STORAGE_KEY, userDataKey } from "./data/constants";
import {
  createDefaultSheet,
  createEmptyRow,
  findColumnByType,
  getMonthKey,
  isRowSavable,
  moveColumn,
  newId,
  propagateCellInSeries,
  rowsInSeriesFrom,
  shiftIsoToMonth,
  userDataWithSavableRows,
} from "./data/sheet";
import type {
  Account,
  AccountBudget,
  Category,
  CategoryIcon,
  CellValue,
  Row,
  Settings,
  Sheet,
  StoredUser,
  Transaction,
  UserData,
} from "./data/types";
import type { StorageAdapter } from "./storage/adapter";
import {
  type BackendId,
  type EncryptionMode,
  clearDropboxRefreshToken,
  clearDropboxToken,
  clearGdriveToken,
  getBackend,
  getDropboxRefreshToken,
  getDropboxToken,
  getEncryption,
  getGdriveToken,
  setBackend,
  setDropboxRefreshToken,
  setDropboxToken,
  setEncryption,
  setGdriveToken,
} from "./storage/backend-preference";
import { encryptText, isEncryptedEnvelope } from "./storage/crypto";
import {
  completeDropboxAuth,
  createDropboxAdapter,
  startDropboxAuth,
} from "./storage/dropbox-adapter";
import {
  completeGdriveAuth,
  createGdriveAdapter,
  startGdriveAuth,
} from "./storage/gdrive-adapter";
import { withEncryption } from "./storage/encrypting-adapter";
import {
  clearRawStorage,
  createLocalAdapter,
  readRawStorage,
  writeRawStorage,
} from "./storage/local-adapter";
import { clearSession, loadSession, saveSession } from "./storage/session";
import { useUserDataStorage } from "./storage/useUserDataStorage";
import {
  createDefaultUser,
  createUser,
  findDefaultUser,
  loadUsersFile,
  saveUsersFile,
  verifyPassword,
} from "./storage/users";

// Every item-level action carries both `sheetId` (so the dispatcher can
// find the right sheet quickly) and `itemId` (so a sheet that grows to
// hold multiple items can target the right one). Today the UI only
// renders one AccountBudget per sheet, so `itemId` always resolves to
// the same value, but plumbing it through now means future multi-item
// support drops in without another reducer rewrite.
type ItemAction =
  | {
      type: "updateCell";
      sheetId: string;
      itemId: string;
      rowId: string;
      columnId: string;
      value: CellValue;
    }
  | { type: "addRow"; sheetId: string; itemId: string; date: string }
  | {
      type: "addRowsFromComplex";
      sheetId: string;
      itemId: string;
      draft: ComplexEntryDraft;
    }
  | {
      type: "convertToRecurring";
      sheetId: string;
      itemId: string;
      rowId: string;
      futureDates: string[];
      glyph: CategoryIcon | null;
    }
  | {
      type: "editSeries";
      sheetId: string;
      itemId: string;
      rowId: string;
      patch: EditPatch;
      scope: EditScope;
    }
  | {
      type: "propagateCellToFuture";
      sheetId: string;
      itemId: string;
      rowId: string;
      columnId: string;
      value: CellValue;
      untilIso: string | null;
    }
  | {
      type: "deleteRows";
      sheetId: string;
      itemId: string;
      rowIds: string[];
    }
  | {
      type: "bulkUpdate";
      sheetId: string;
      itemId: string;
      rowIds: string[];
      patch: BulkPatch;
    }
  | {
      type: "bulkShiftToMonth";
      sheetId: string;
      itemId: string;
      rowIds: string[];
      targetMonth: string;
    }
  | {
      type: "bulkCopyToMonths";
      sheetId: string;
      itemId: string;
      rowIds: string[];
      targetMonths: string[];
    }
  | {
      type: "bulkMakeRecurring";
      sheetId: string;
      itemId: string;
      rowIds: string[];
      futureDates: string[];
    }
  | {
      type: "reorderColumns";
      sheetId: string;
      itemId: string;
      fromId: string;
      toId: string;
    };

type Action =
  | ItemAction
  | { type: "replace"; data: UserData }
  | { type: "addCategory"; category: Category }
  | { type: "updateSettings"; settings: Settings }
  | { type: "renameSheet"; sheetId: string; name: string }
  | {
      type: "setItemAccount";
      sheetId: string;
      itemId: string;
      accountId: string | null;
    }
  | { type: "createAccount"; account: Account }
  | { type: "updateAccount"; accountId: string; patch: Partial<Account> }
  | { type: "deleteAccount"; accountId: string }
  | { type: "createTransaction"; transaction: Transaction }
  | {
      type: "updateTransaction";
      transactionId: string;
      patch: Partial<Transaction>;
    }
  | { type: "deleteTransaction"; transactionId: string }
  | {
      // Drop a budget row and mint a transaction in one cycle so the
      // app never sits in a state where the same logical transfer
      // exists twice (once as a row, once as a transaction).
      type: "promoteRowToTransaction";
      sheetId: string;
      itemId: string;
      rowId: string;
      transaction: Transaction;
    }
  | { type: "addSheet"; sheet: Sheet }
  | { type: "updateSheetMeta"; sheetId: string; meta: SheetDraft }
  | { type: "deleteSheet"; sheetId: string }
  | { type: "selectSheet"; sheetId: string };

function applyPatch(
  row: Row,
  patch: EditPatch,
  cols: {
    descId?: string;
    amountId?: string;
    categoryId?: string;
  },
): Row {
  const next: Row = { ...row, cells: { ...row.cells } };
  if (cols.descId) next.cells[cols.descId] = patch.description;
  if (cols.amountId && patch.amount !== null)
    next.cells[cols.amountId] = patch.amount;
  if (cols.categoryId) next.cells[cols.categoryId] = patch.categoryId ?? null;
  // `undefined` means "don't touch"; explicit `null` clears the glyph
  // back to the default recurring icon.
  if (patch.glyph !== undefined) {
    if (patch.glyph === null) delete next.glyph;
    else next.glyph = patch.glyph;
  }
  return next;
}

function reduceAccountBudget(
  item: AccountBudget,
  action: ItemAction,
): AccountBudget {
  switch (action.type) {
    case "updateCell":
      return {
        ...item,
        rows: item.rows.map((r) =>
          r.id === action.rowId
            ? { ...r, cells: { ...r.cells, [action.columnId]: action.value } }
            : r,
        ),
      };

    case "addRow": {
      const dateCol = findColumnByType(item.columns, "date");
      const newRow: Row = createEmptyRow(item.columns, {
        date: dateCol && action.date ? action.date : null,
        completed: false,
      });
      return { ...item, rows: [...item.rows, newRow] };
    }

    case "addRowsFromComplex": {
      const { draft } = action;
      // All rows generated by one modal submit share a seriesId so they
      // can be edited or deleted together later.
      const seriesId = draft.dates.length > 1 ? newId() : undefined;
      const newRows: Row[] = draft.dates.map((date) => {
        const row = createEmptyRow(item.columns, {
          date,
          description: draft.description,
          amount: draft.amount,
          category: draft.categoryId,
          completed: false,
        });
        if (seriesId) row.seriesId = seriesId;
        if (draft.glyph) row.glyph = draft.glyph;
        return row;
      });
      return { ...item, rows: [...item.rows, ...newRows] };
    }

    case "convertToRecurring": {
      const anchor = item.rows.find((r) => r.id === action.rowId);
      if (!anchor) return item;
      // Promote the anchor row into a series of its own. Future rows
      // inherit description, amount, and category from the anchor; the
      // glyph comes from the modal so promotion and custom glyph
      // selection happen in the same step.
      const seriesId = anchor.seriesId ?? newId();
      const descCol = findColumnByType(item.columns, "description");
      const amountCol = findColumnByType(item.columns, "amount");
      const categoryCol = findColumnByType(item.columns, "category");
      const newRows: Row[] = action.futureDates.map((date) => {
        const row = createEmptyRow(item.columns, {
          date,
          description:
            descCol && typeof anchor.cells[descCol.id] === "string"
              ? (anchor.cells[descCol.id] as string)
              : "",
          amount:
            amountCol && typeof anchor.cells[amountCol.id] === "number"
              ? (anchor.cells[amountCol.id] as number)
              : 0,
          category:
            categoryCol && typeof anchor.cells[categoryCol.id] === "string"
              ? (anchor.cells[categoryCol.id] as string)
              : null,
          completed: false,
        });
        row.seriesId = seriesId;
        if (action.glyph) row.glyph = action.glyph;
        return row;
      });
      return {
        ...item,
        rows: [
          ...item.rows.map((r) => {
            if (r.id !== anchor.id) return r;
            const next: Row = { ...r, seriesId };
            if (action.glyph) next.glyph = action.glyph;
            else if (action.glyph === null) delete next.glyph;
            return next;
          }),
          ...newRows,
        ],
      };
    }

    case "editSeries": {
      const anchor = item.rows.find((r) => r.id === action.rowId);
      if (!anchor) return item;
      const dateCol = findColumnByType(item.columns, "date");
      if (!dateCol) return item;
      const cols = {
        descId: findColumnByType(item.columns, "description")?.id,
        amountId: findColumnByType(item.columns, "amount")?.id,
        categoryId: findColumnByType(item.columns, "category")?.id,
      };
      let targets: ReadonlySet<string>;
      if (action.scope.kind === "just-this") {
        targets = new Set([anchor.id]);
      } else {
        const future = rowsInSeriesFrom(
          item.rows,
          anchor,
          dateCol.id,
          action.scope.untilIso,
        );
        targets = new Set(future.map((r) => r.id));
      }
      return {
        ...item,
        rows: item.rows.map((r) =>
          targets.has(r.id) ? applyPatch(r, action.patch, cols) : r,
        ),
      };
    }

    case "propagateCellToFuture": {
      const anchor = item.rows.find((r) => r.id === action.rowId);
      if (!anchor) return item;
      const dateCol = findColumnByType(item.columns, "date");
      if (!dateCol) return item;
      return {
        ...item,
        rows: propagateCellInSeries(
          item.rows,
          anchor,
          dateCol.id,
          action.columnId,
          action.value,
          action.untilIso,
        ),
      };
    }

    case "deleteRows": {
      const drop = new Set(action.rowIds);
      return { ...item, rows: item.rows.filter((r) => !drop.has(r.id)) };
    }

    case "bulkUpdate": {
      const ids = new Set(action.rowIds);
      const dateColId = findColumnByType(item.columns, "date")?.id;
      const amountColId = findColumnByType(item.columns, "amount")?.id;
      const categoryColId = findColumnByType(item.columns, "category")?.id;
      return {
        ...item,
        rows: item.rows.map((r) => {
          if (!ids.has(r.id)) return r;
          const cells = { ...r.cells };
          if (action.patch.date !== undefined && dateColId) {
            cells[dateColId] = action.patch.date;
          }
          if (action.patch.amount !== undefined && amountColId) {
            cells[amountColId] = action.patch.amount;
          }
          if (action.patch.categoryId !== undefined && categoryColId) {
            cells[categoryColId] = action.patch.categoryId;
          }
          return { ...r, cells };
        }),
      };
    }

    case "bulkShiftToMonth": {
      const ids = new Set(action.rowIds);
      const dateColId = findColumnByType(item.columns, "date")?.id;
      if (!dateColId) return item;
      return {
        ...item,
        rows: item.rows.map((r) => {
          if (!ids.has(r.id)) return r;
          const cur = r.cells[dateColId];
          if (typeof cur !== "string") return r;
          return {
            ...r,
            cells: {
              ...r.cells,
              [dateColId]: shiftIsoToMonth(cur, action.targetMonth),
            },
          };
        }),
      };
    }

    case "bulkCopyToMonths": {
      const ids = new Set(action.rowIds);
      const dateColId = findColumnByType(item.columns, "date")?.id;
      if (!dateColId) return item;
      const newRows: Row[] = [];
      for (const r of item.rows) {
        if (!ids.has(r.id)) continue;
        const cur = r.cells[dateColId];
        if (typeof cur !== "string") continue;
        for (const month of action.targetMonths) {
          // Copies are independent — drop any seriesId so they don't
          // accidentally inherit the source row's recurring group.
          newRows.push({
            id: newId(),
            cells: { ...r.cells, [dateColId]: shiftIsoToMonth(cur, month) },
          });
        }
      }
      return { ...item, rows: [...item.rows, ...newRows] };
    }

    case "bulkMakeRecurring": {
      const ids = new Set(action.rowIds);
      const dateColId = findColumnByType(item.columns, "date")?.id;
      if (!dateColId) return item;
      // Stamp each selected row with a fresh seriesId (preserving an
      // existing one if it already had one), then replicate it at every
      // recurrence date except its own anchor date.
      const updated = item.rows.map((r) =>
        ids.has(r.id) ? { ...r, seriesId: r.seriesId ?? newId() } : r,
      );
      const additions: Row[] = [];
      for (const r of updated) {
        if (!ids.has(r.id)) continue;
        const anchorDate = r.cells[dateColId];
        if (typeof anchorDate !== "string") continue;
        for (const date of action.futureDates) {
          if (date === anchorDate) continue;
          const next: Row = {
            id: newId(),
            cells: { ...r.cells, [dateColId]: date },
            seriesId: r.seriesId,
          };
          if (r.glyph) next.glyph = r.glyph;
          additions.push(next);
        }
      }
      return { ...item, rows: [...updated, ...additions] };
    }

    case "reorderColumns":
      return {
        ...item,
        columns: moveColumn(item.columns, action.fromId, action.toId),
      };
  }
}

function reduceSheet(sheet: Sheet, action: ItemAction): Sheet {
  return {
    ...sheet,
    items: sheet.items.map((item) =>
      item.id === action.itemId && item.type === "accountBudget"
        ? reduceAccountBudget(item, action)
        : item,
    ),
  };
}

function reducer(state: UserData, action: Action): UserData {
  if (action.type === "replace") return action.data;
  if (action.type === "addCategory") {
    return { ...state, categories: [...state.categories, action.category] };
  }
  if (action.type === "updateSettings") {
    return { ...state, settings: action.settings };
  }
  if (action.type === "createAccount") {
    return { ...state, accounts: [...state.accounts, action.account] };
  }
  if (action.type === "updateAccount") {
    return {
      ...state,
      accounts: state.accounts.map((a) =>
        a.id === action.accountId ? { ...a, ...action.patch } : a,
      ),
    };
  }
  if (action.type === "deleteAccount") {
    // Cascading detach: clear `accountId` on any AccountBudget that
    // referenced this account so the budgets keep working as
    // free-standing ledgers, and drop any transactions that touched
    // it (a transfer between two known accounts loses its other half
    // once one side is gone, so the cleanest answer is removal).
    return {
      ...state,
      accounts: state.accounts.filter((a) => a.id !== action.accountId),
      sheets: state.sheets.map((sheet) => ({
        ...sheet,
        items: sheet.items.map((item) =>
          item.type === "accountBudget" && item.accountId === action.accountId
            ? { ...item, accountId: null }
            : item,
        ),
      })),
      transactions: state.transactions.filter(
        (tx) =>
          tx.fromAccountId !== action.accountId &&
          tx.toAccountId !== action.accountId,
      ),
    };
  }
  if (action.type === "createTransaction") {
    return {
      ...state,
      transactions: [...state.transactions, action.transaction],
    };
  }
  if (action.type === "updateTransaction") {
    return {
      ...state,
      transactions: state.transactions.map((tx) =>
        tx.id === action.transactionId ? { ...tx, ...action.patch } : tx,
      ),
    };
  }
  if (action.type === "deleteTransaction") {
    return {
      ...state,
      transactions: state.transactions.filter(
        (tx) => tx.id !== action.transactionId,
      ),
    };
  }
  if (action.type === "promoteRowToTransaction") {
    return {
      ...state,
      transactions: [...state.transactions, action.transaction],
      sheets: state.sheets.map((sheet) =>
        sheet.id === action.sheetId
          ? {
              ...sheet,
              items: sheet.items.map((item) =>
                item.id === action.itemId && item.type === "accountBudget"
                  ? {
                      ...item,
                      rows: item.rows.filter((r) => r.id !== action.rowId),
                    }
                  : item,
              ),
            }
          : sheet,
      ),
    };
  }
  if (action.type === "renameSheet") {
    return {
      ...state,
      sheets: state.sheets.map((sheet) =>
        sheet.id === action.sheetId ? { ...sheet, name: action.name } : sheet,
      ),
    };
  }
  if (action.type === "addSheet") {
    // New sheets become the active sheet so the user lands on the
    // empty ledger they just created instead of having to chase down
    // its tab.
    return {
      ...state,
      sheets: [...state.sheets, action.sheet],
      activeSheetId: action.sheet.id,
    };
  }
  if (action.type === "updateSheetMeta") {
    return {
      ...state,
      sheets: state.sheets.map((sheet) =>
        sheet.id === action.sheetId ? { ...sheet, ...action.meta } : sheet,
      ),
    };
  }
  if (action.type === "deleteSheet") {
    // Guard against deleting the only sheet — the UI never offers it
    // but the reducer enforces it too so an externally dispatched
    // action can't strand the user with an empty workspace.
    if (state.sheets.length <= 1) return state;
    const nextSheets = state.sheets.filter((s) => s.id !== action.sheetId);
    const nextActive =
      state.activeSheetId === action.sheetId
        ? nextSheets[0].id
        : state.activeSheetId;
    return { ...state, sheets: nextSheets, activeSheetId: nextActive };
  }
  if (action.type === "selectSheet") {
    if (!state.sheets.some((s) => s.id === action.sheetId)) return state;
    return { ...state, activeSheetId: action.sheetId };
  }
  if (action.type === "setItemAccount") {
    return {
      ...state,
      sheets: state.sheets.map((sheet) =>
        sheet.id === action.sheetId
          ? {
              ...sheet,
              items: sheet.items.map((item) =>
                item.id === action.itemId && item.type === "accountBudget"
                  ? { ...item, accountId: action.accountId }
                  : item,
              ),
            }
          : sheet,
      ),
    };
  }
  return {
    ...state,
    sheets: state.sheets.map((sheet) =>
      sheet.id === action.sheetId ? reduceSheet(sheet, action) : sheet,
    ),
  };
}

type DeletePrompt = { kind: "delete"; row: Row };
type EditPrompt = { kind: "edit"; row: Row };
type BulkDeletePrompt = { kind: "bulk-delete"; rowIds: string[] };
type MoveCopyPrompt = { kind: "move" | "copy"; rows: Row[] };
type PendingSeriesEdit = {
  rowId: string;
  columnId: string;
  // Pre-snapshotted so the dialog renders without re-deriving from
  // possibly-stale row state if the user kept editing elsewhere.
  fieldLabel: string;
  anchorDate: string;
  lastSeriesDate: string | null;
  value: CellValue;
};

// Auth is rooted in the per-device user registry. Three states:
//   "signed-out"  — no active user; the auth screen is shown with the
//                   sign-in form (or sign-up if the registry is empty).
//   "signed-in"   — a user is active and their decrypted budget is
//                   being edited; the password lives in `passwordRef`
//                   so the encrypting adapter can encrypt every save.
// The state is also persisted in `budget.users.v1` so a reload lands
// the user on the sign-in form for the same account they last used.
// The session-storage cache (see `src/storage/session.ts`) carries the
// rolling-window deadline; an idle-tracking effect inside BudgetView
// extends it while the user is active and signs the user out once
// activity has been idle for longer than the user's chosen TTL.
type AuthState =
  | { kind: "signed-out"; lastUsername: string | null }
  | { kind: "signed-in"; user: StoredUser; password: string };

// Resolve the auth state to land on at boot. If sessionStorage still
// holds a non-expired password for a known user, jump straight back
// into the signed-in state — that's the whole point of the cache.
// The no-password "guest" account skips the auth screen entirely
// whenever it's the only account on the device.
function readBootAuth(): { users: StoredUser[]; auth: AuthState } {
  const file = loadUsersFile();
  const session = loadSession();
  if (session) {
    const user = file.users.find((u) => u.id === session.userId);
    if (user) {
      return {
        users: file.users,
        auth: { kind: "signed-in", user, password: session.password },
      };
    }
    // Session points at a user that no longer exists locally — sweep
    // the orphan and fall through to the regular signed-out flow.
    clearSession();
  }
  const defaultUser = findDefaultUser(file.users);
  if (defaultUser && file.users.length === 1) {
    return {
      users: file.users,
      auth: { kind: "signed-in", user: defaultUser, password: "" },
    };
  }
  const last = file.activeUserId
    ? (file.users.find((u) => u.id === file.activeUserId) ?? null)
    : null;
  return {
    users: file.users,
    auth: { kind: "signed-out", lastUsername: last?.username ?? null },
  };
}

export function App() {
  // Compute boot state exactly once — the result feeds `useState` and
  // `useRef` initial values below, and we don't want to re-read
  // sessionStorage on every render.
  const bootRef = useRef<ReturnType<typeof readBootAuth> | null>(null);
  if (bootRef.current === null) bootRef.current = readBootAuth();
  const boot = bootRef.current;

  const [users, setUsers] = useState<StoredUser[]>(boot.users);

  const [auth, setAuth] = useState<AuthState>(boot.auth);

  // Whether any plaintext pre-account data is sitting in the legacy
  // `STORAGE_KEY` bucket. Detected once at mount and offered to the
  // first account that gets created. Encrypted legacy envelopes are
  // ignored — we don't have the old password to unwrap them, so the
  // user has to recover that data via Import after signing in.
  const legacyBudgetAvailable = useMemo(() => {
    const legacy = readRawStorage(STORAGE_KEY);
    return Boolean(legacy && !isEncryptedEnvelope(legacy));
  }, []);

  // Held password for the active user. Read by the encrypting adapter
  // on every save / load; cleared whenever auth flips to signed-out.
  // Seeded from the boot session so the encrypting adapter can decrypt
  // straight away after a refresh that restored a cached password.
  const passwordRef = useRef<string | null>(
    boot.auth.kind === "signed-in" ? boot.auth.password : null,
  );

  // Per-user device-local storage preferences. Loaded lazily on sign-
  // in so a fresh-device session lands on local until the user
  // reconnects Dropbox here. Lives in App so the adapter `useMemo`
  // can rebuild when the user flips the choice from Settings.
  const [backend, setBackendState] = useState<BackendId>("local");
  const [dropboxToken, setDropboxTokenState] = useState<string | null>(null);
  // The refresh token is held in a ref rather than React state because
  // silent refreshes update the access token in localStorage and inside
  // the adapter's closure — bouncing it through `setState` would
  // rebuild the `adapter` useMemo and trigger a needless reload of the
  // user's data.
  const dropboxRefreshTokenRef = useRef<string | null>(null);
  const [gdriveToken, setGdriveTokenState] = useState<string | null>(null);
  const [encryption, setEncryptionState] =
    useState<EncryptionMode>("encrypted");

  // Sync state with the active user every time auth flips. The
  // default (no-password) user is pinned to plaintext storage — there
  // is no password to derive a key from, and the user explicitly
  // opted out of accounts.
  useEffect(() => {
    if (auth.kind !== "signed-in") {
      setBackendState("local");
      setDropboxTokenState(null);
      dropboxRefreshTokenRef.current = null;
      setGdriveTokenState(null);
      setEncryptionState("encrypted");
      return;
    }
    setBackendState(getBackend(auth.user.id));
    setDropboxTokenState(getDropboxToken(auth.user.id));
    dropboxRefreshTokenRef.current = getDropboxRefreshToken(auth.user.id);
    setGdriveTokenState(getGdriveToken(auth.user.id));
    setEncryptionState(
      auth.user.isDefault ? "plaintext" : getEncryption(auth.user.id),
    );
  }, [auth]);

  // Complete the cloud-backend OAuth round-trip when the redirect
  // lands back here. The user signed in before clicking Connect, so
  // by the time this fires they should already be signed-in again
  // (or about to be — we wait for that transition). The `state`
  // query param tags which provider issued the code; we default to
  // Dropbox for backwards compatibility with the legacy auth URL
  // that didn't set `state`. Errors surface in the console only; a
  // future polish pass can surface them in UI.
  useEffect(() => {
    if (auth.kind !== "signed-in") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    const provider = params.get("state") === "gdrive" ? "gdrive" : "dropbox";
    let cancelled = false;
    if (provider === "gdrive") {
      completeGdriveAuth(code)
        .then((token) => {
          if (cancelled || auth.kind !== "signed-in") return;
          setGdriveToken(auth.user.id, token);
          setBackend(auth.user.id, "gdrive");
          setGdriveTokenState(token);
          setBackendState("gdrive");
        })
        .catch((err: unknown) => {
          console.error(`${provider} connect failed:`, err);
        })
        .finally(cleanCodeFromUrl);
    } else {
      completeDropboxAuth(code)
        .then((result) => {
          if (cancelled || auth.kind !== "signed-in") return;
          setDropboxToken(auth.user.id, result.accessToken);
          if (result.refreshToken) {
            setDropboxRefreshToken(auth.user.id, result.refreshToken);
            dropboxRefreshTokenRef.current = result.refreshToken;
          } else {
            // Shouldn't happen — `token_access_type=offline` should
            // always return one — but clear stale state if it does so
            // we don't try to refresh with the previous account's token.
            clearDropboxRefreshToken(auth.user.id);
            dropboxRefreshTokenRef.current = null;
          }
          setBackend(auth.user.id, "dropbox");
          setDropboxTokenState(result.accessToken);
          setBackendState("dropbox");
        })
        .catch((err: unknown) => {
          console.error(`${provider} connect failed:`, err);
        })
        .finally(cleanCodeFromUrl);
    }
    function cleanCodeFromUrl() {
      // Clean the code out of the URL regardless of outcome so a page
      // reload doesn't re-trigger the exchange.
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      window.history.replaceState({}, "", url.toString());
    }
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const adapter = useMemo<StorageAdapter | null>(() => {
    if (auth.kind !== "signed-in") return null;
    const userId = auth.user.id;
    const inner: StorageAdapter =
      backend === "dropbox" && dropboxToken
        ? createDropboxAdapter({
            accessToken: dropboxToken,
            refreshToken: dropboxRefreshTokenRef.current,
            // Persist the silently-refreshed access token so the next
            // page load picks it up; deliberately do NOT touch React
            // state, since rebuilding the adapter mid-session would
            // discard our `lastSnapshot` and force a reload of the
            // user's data.
            onAccessTokenRefreshed: (next) => {
              setDropboxToken(userId, next);
            },
          })
        : backend === "gdrive" && gdriveToken
          ? createGdriveAdapter(gdriveToken)
          : createLocalAdapter(userDataKey(userId));
    // Skip the encryption wrapper entirely when the user has opted
    // out — keeps `loadSync` available on local and writes plaintext
    // bytes to whichever inner backend is active (including the
    // cloud backends).
    return encryption === "plaintext"
      ? inner
      : withEncryption(inner, passwordRef);
  }, [auth, backend, dropboxToken, gdriveToken, encryption]);

  const handleConnectDropbox = useCallback(() => {
    void startDropboxAuth();
  }, []);

  const handleConnectGdrive = useCallback(() => {
    void startGdriveAuth();
  }, []);

  const handleSelectLocal = useCallback(() => {
    if (auth.kind !== "signed-in") return;
    setBackend(auth.user.id, "local");
    setBackendState("local");
  }, [auth]);

  const handleDisconnectDropbox = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    const userId = auth.user.id;
    // Pull the latest Dropbox snapshot — through the encrypting
    // wrapper when the user keeps storage encrypted, raw otherwise —
    // so the bytes that land in localStorage match what was up there.
    // Failing to fetch is tolerated: the in-memory state has just
    // been auto-saved there moments ago, so worst case the user
    // loses the few minutes between the last sync and the disconnect.
    if (dropboxToken) {
      try {
        const cloudInner = createDropboxAdapter({
          accessToken: dropboxToken,
          refreshToken: dropboxRefreshTokenRef.current,
          onAccessTokenRefreshed: (next) => {
            setDropboxToken(userId, next);
          },
        });
        const cloud =
          encryption === "plaintext"
            ? cloudInner
            : withEncryption(cloudInner, passwordRef);
        const snap = await cloud.load();
        if (snap) {
          const localInner = createLocalAdapter(userDataKey(userId));
          const local =
            encryption === "plaintext"
              ? localInner
              : withEncryption(localInner, passwordRef);
          await local.save(snap.text);
        }
      } catch (err) {
        console.error("Dropbox disconnect: failed to mirror to local", err);
      }
    }
    clearDropboxToken(userId);
    clearDropboxRefreshToken(userId);
    setBackend(userId, "local");
    setDropboxTokenState(null);
    dropboxRefreshTokenRef.current = null;
    setBackendState("local");
  }, [auth, dropboxToken, encryption]);

  const handleDisconnectGdrive = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    const userId = auth.user.id;
    // Mirror the Dropbox disconnect flow: pull the latest cloud
    // snapshot down so the bytes that land in localStorage match
    // what was up there. Best-effort — a stale local copy is a
    // few-minute regression at worst because the auto-save runs on
    // the same debounce.
    if (gdriveToken) {
      try {
        const cloudInner = createGdriveAdapter(gdriveToken);
        const cloud =
          encryption === "plaintext"
            ? cloudInner
            : withEncryption(cloudInner, passwordRef);
        const snap = await cloud.load();
        if (snap) {
          const localInner = createLocalAdapter(userDataKey(userId));
          const local =
            encryption === "plaintext"
              ? localInner
              : withEncryption(localInner, passwordRef);
          await local.save(snap.text);
        }
      } catch (err) {
        console.error(
          "Google Drive disconnect: failed to mirror to local",
          err,
        );
      }
    }
    clearGdriveToken(userId);
    setBackend(userId, "local");
    setGdriveTokenState(null);
    setBackendState("local");
  }, [auth, gdriveToken, encryption]);

  // Flip the per-user encryption preference, re-wrapping the bytes
  // already in the active backend so the next load isn't reading the
  // wrong envelope. Reads through the *current* preference and writes
  // through the *new* one. Backend choice (local vs Dropbox vs
  // Google Drive) is independent — encryption is just whether the
  // adapter wraps with `withEncryption` on top.
  const handleSetEncryption = useCallback(
    async (next: EncryptionMode) => {
      if (auth.kind !== "signed-in") return;
      // The default (no-password) user has no key to derive — pin to
      // plaintext and ignore any toggle attempts.
      if (auth.user.isDefault) return;
      if (next === encryption) return;
      const userId = auth.user.id;
      function buildInner(): StorageAdapter {
        if (backend === "dropbox" && dropboxToken)
          return createDropboxAdapter({
            accessToken: dropboxToken,
            refreshToken: dropboxRefreshTokenRef.current,
            onAccessTokenRefreshed: (nextToken) => {
              setDropboxToken(userId, nextToken);
            },
          });
        if (backend === "gdrive" && gdriveToken)
          return createGdriveAdapter(gdriveToken);
        return createLocalAdapter(userDataKey(userId));
      }
      const innerForCurrent: StorageAdapter = buildInner();
      const innerForNext: StorageAdapter = buildInner();
      const current =
        encryption === "plaintext"
          ? innerForCurrent
          : withEncryption(innerForCurrent, passwordRef);
      const target =
        next === "plaintext"
          ? innerForNext
          : withEncryption(innerForNext, passwordRef);
      try {
        const snap = await current.load();
        if (snap) await target.save(snap.text);
      } catch (err) {
        console.error("Encryption toggle: failed to re-wrap bytes", err);
        return;
      }
      setEncryption(userId, next);
      setEncryptionState(next);
    },
    [auth, backend, dropboxToken, gdriveToken, encryption],
  );

  const persistRegistry = useCallback(
    (nextUsers: StoredUser[], activeUserId: string | null) => {
      saveUsersFile({ version: 1, users: nextUsers, activeUserId });
    },
    [],
  );

  const handleSignIn = useCallback(
    async (user: StoredUser, password: string) => {
      const ok = await verifyPassword(user, password);
      if (!ok) throw new Error("Wrong password");
      passwordRef.current = password;
      persistRegistry(users, user.id);
      saveSession(user.id, password);
      setBackendState(getBackend(user.id));
      setDropboxTokenState(getDropboxToken(user.id));
      dropboxRefreshTokenRef.current = getDropboxRefreshToken(user.id);
      setEncryptionState(getEncryption(user.id));
      setAuth({ kind: "signed-in", user, password });
    },
    [users, persistRegistry],
  );

  const handleCreateAccount = useCallback(
    async (username: string, password: string, importLegacy: boolean) => {
      const user = await createUser(username, password);
      const existingDefault = findDefaultUser(users);
      const realUsers = users.filter((u) => !u.isDefault);
      // The first real account always absorbs the guest session's data
      // — that's the whole "first user consumes the default user" rule.
      // Bytes live in plaintext under `userDataKey(defaultUser.id)`;
      // re-wrap them under the new account's password so the rest of
      // the app sees a normal encrypted envelope from the first read.
      // Falls back to the legacy pre-account `STORAGE_KEY` migration
      // when no default user is around and the user opted in.
      if (existingDefault) {
        const guestBytes = readRawStorage(userDataKey(existingDefault.id));
        if (guestBytes) {
          const envelope = await encryptText(guestBytes, password);
          writeRawStorage(envelope, userDataKey(user.id));
        }
        clearRawStorage(userDataKey(existingDefault.id));
      } else if (importLegacy && realUsers.length === 0) {
        const legacy = readRawStorage(STORAGE_KEY);
        // Only migrate plaintext legacy data — an encrypted envelope
        // would need the old password to decrypt and our migration
        // doesn't have it. The user can recover that data later via
        // the Import button, which prompts for it.
        if (legacy && !isEncryptedEnvelope(legacy)) {
          const envelope = await encryptText(legacy, password);
          writeRawStorage(envelope, userDataKey(user.id));
          clearRawStorage(STORAGE_KEY);
        }
      }
      const nextUsers = [...realUsers, user];
      setUsers(nextUsers);
      persistRegistry(nextUsers, user.id);
      passwordRef.current = password;
      saveSession(user.id, password);
      // Sync the per-user backend / encryption preferences in the
      // same batch as the auth flip so the adapter useMemo rebuilds
      // with the right wrappers on the very first post-flip render.
      // Skipping this leaves a flash where the new user's encrypted
      // bytes are read through a plaintext adapter (from the guest
      // session's state) and momentarily render as a fresh budget.
      setBackendState(getBackend(user.id));
      setDropboxTokenState(getDropboxToken(user.id));
      dropboxRefreshTokenRef.current = getDropboxRefreshToken(user.id);
      setEncryptionState(getEncryption(user.id));
      setAuth({ kind: "signed-in", user, password });
    },
    [users, persistRegistry],
  );

  const handleContinueWithoutAccount = useCallback(async () => {
    // Re-use an existing guest account if one is already in the
    // registry (e.g. user signed out then changed their mind). Only
    // mint a new one when there isn't one — keeps the data intact
    // across "sign out → continue without account" round trips.
    const existing = findDefaultUser(users);
    const user = existing ?? createDefaultUser();
    const nextUsers = existing ? users : [...users, user];
    if (!existing) {
      setUsers(nextUsers);
    }
    persistRegistry(nextUsers, user.id);
    passwordRef.current = "";
    saveSession(user.id, "");
    setBackendState("local");
    setDropboxTokenState(null);
    dropboxRefreshTokenRef.current = null;
    setEncryptionState("plaintext");
    setAuth({ kind: "signed-in", user, password: "" });
  }, [users, persistRegistry]);

  const handleSignOut = useCallback(() => {
    passwordRef.current = null;
    clearSession();
    setAuth((prev) => {
      const lastUsername =
        prev.kind === "signed-in"
          ? prev.user.username
          : prev.kind === "signed-out"
            ? prev.lastUsername
            : null;
      return { kind: "signed-out", lastUsername };
    });
    persistRegistry(users, null);
  }, [users, persistRegistry]);

  const handleSwitchUser = useCallback(() => {
    // Same as sign-out but explicitly clears the "last user" hint so
    // the picker comes up blank instead of pre-filling the just-left
    // account.
    passwordRef.current = null;
    clearSession();
    setAuth({ kind: "signed-out", lastUsername: null });
    persistRegistry(users, null);
  }, [users, persistRegistry]);

  const handleStartCreateAccountFromMenu = useCallback(() => {
    // The auth screen detects an empty username hint and lands on the
    // sign-up form when no users exist; we surface that affordance
    // here too by signing out + setting the hint to null.
    passwordRef.current = null;
    clearSession();
    setAuth({ kind: "signed-out", lastUsername: null });
    persistRegistry(users, null);
  }, [users, persistRegistry]);

  const handleDeleteAccount = useCallback(
    async (password: string) => {
      if (auth.kind !== "signed-in") return;
      // Default (no-password) users skip verification — there's no
      // password to check, and the menu omits the password prompt
      // for them anyway. Real accounts still require their password.
      if (!auth.user.isDefault) {
        const ok = await verifyPassword(auth.user, password);
        if (!ok) throw new Error("Wrong password");
      }
      const remaining = users.filter((u) => u.id !== auth.user.id);
      clearRawStorage(userDataKey(auth.user.id));
      setUsers(remaining);
      persistRegistry(remaining, null);
      passwordRef.current = null;
      clearSession();
      setAuth({ kind: "signed-out", lastUsername: null });
    },
    [auth, users, persistRegistry],
  );

  if (auth.kind === "signed-out" || adapter === null) {
    const realUsers = users.filter((u) => !u.isDefault);
    const guestAvailable = findDefaultUser(users) !== undefined;
    return (
      <AuthScreen
        users={users}
        initialUsername={auth.kind === "signed-out" ? auth.lastUsername : null}
        legacyBudgetAvailable={legacyBudgetAvailable && realUsers.length === 0}
        guestAvailable={guestAvailable}
        onSignIn={handleSignIn}
        onCreateAccount={handleCreateAccount}
        onContinueWithoutAccount={handleContinueWithoutAccount}
      />
    );
  }

  // Real (non-guest) users on the device. Guest accounts never coexist
  // with real ones at steady state, but filtering keeps "Switch user"
  // honest mid-flow.
  const otherRealUsers = users.filter(
    (u) => !u.isDefault && u.id !== auth.user.id,
  );

  return (
    <BudgetView
      adapter={adapter}
      user={auth.user}
      password={auth.password}
      hasOtherUsers={otherRealUsers.length > 0}
      backend={backend}
      dropboxConnected={dropboxToken !== null}
      gdriveConnected={gdriveToken !== null}
      encryption={encryption}
      getEncryptionPassword={() => passwordRef.current}
      onSignOut={handleSignOut}
      onSwitchUser={handleSwitchUser}
      onCreateAccount={handleStartCreateAccountFromMenu}
      onDeleteAccount={handleDeleteAccount}
      onConnectDropbox={handleConnectDropbox}
      onDisconnectDropbox={handleDisconnectDropbox}
      onConnectGdrive={handleConnectGdrive}
      onDisconnectGdrive={handleDisconnectGdrive}
      onSelectLocal={handleSelectLocal}
      onSetEncryption={handleSetEncryption}
    />
  );
}

type BudgetViewProps = {
  adapter: StorageAdapter;
  user: StoredUser;
  // The active user's password — handed to the idle tracker so it can
  // re-stamp `sessionStorage` with the user's chosen TTL on each tick.
  password: string;
  hasOtherUsers: boolean;
  backend: BackendId;
  dropboxConnected: boolean;
  gdriveConnected: boolean;
  encryption: EncryptionMode;
  // Returns the active user's password — used by the export flow to
  // wrap downloaded files in the same envelope shape the storage
  // adapter uses.
  getEncryptionPassword: () => string | null;
  onSignOut: () => void;
  onSwitchUser: () => void;
  onCreateAccount: () => void;
  onDeleteAccount: (password: string) => Promise<void>;
  onConnectDropbox: () => void;
  onDisconnectDropbox: () => void;
  onConnectGdrive: () => void;
  onDisconnectGdrive: () => void;
  onSelectLocal: () => void;
  onSetEncryption: (mode: EncryptionMode) => void;
};

function BudgetView({
  adapter,
  user,
  password,
  hasOtherUsers,
  backend,
  dropboxConnected,
  gdriveConnected,
  encryption,
  getEncryptionPassword,
  onSignOut,
  onSwitchUser,
  onCreateAccount,
  onDeleteAccount,
  onConnectDropbox,
  onDisconnectDropbox,
  onConnectGdrive,
  onDisconnectGdrive,
  onSelectLocal,
  onSetEncryption,
}: BudgetViewProps) {
  const { data, dispatch, status, dirty, saveNow } = useUserDataStorage(
    adapter,
    reducer,
    { beforeSerialize: userDataWithSavableRows },
  );
  const [complexOpen, setComplexOpen] = useState(false);
  const [complexSeedDate, setComplexSeedDate] = useState("");
  const [deletePrompt, setDeletePrompt] = useState<DeletePrompt | null>(null);
  const [editPrompt, setEditPrompt] = useState<EditPrompt | null>(null);
  // Captures the most recent inline edit on a recurring row so the user
  // can choose to fan the change out to every following entry in the
  // series. `null` while no prompt is pending.
  const [pendingSeriesEdit, setPendingSeriesEdit] =
    useState<PendingSeriesEdit | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeletePrompt, setBulkDeletePrompt] =
    useState<BulkDeletePrompt | null>(null);
  const [moveCopyPrompt, setMoveCopyPrompt] = useState<MoveCopyPrompt | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);
  // Bumped each time the user clicks the budget icon/title in the
  // header. SheetView watches this counter and re-scrolls to today's
  // row (or the current fiscal month) on every increment, even when
  // the active sheet and month haven't changed.
  const [scrollToTodayTick, setScrollToTodayTick] = useState(0);
  const onScrollToToday = useCallback(() => {
    setScrollToTodayTick((tick) => tick + 1);
  }, []);
  // null = closed; { sheet: null } = new-sheet modal; { sheet: <Sheet> } = edit.
  const [sheetModal, setSheetModal] = useState<{ sheet: Sheet | null } | null>(
    null,
  );
  // null = closed; { account: null } = create-account modal; otherwise edit.
  const [accountModal, setAccountModal] = useState<{
    account: Account | null;
  } | null>(null);
  // null = closed; otherwise the request describes the mode (promote /
  // create / edit). The TransactionModal seeds itself from the request.
  const [transactionRequest, setTransactionRequest] =
    useState<TransactionModalRequest | null>(null);

  const activeSheet =
    data.sheets.find((s) => s.id === data.activeSheetId) ?? data.sheets[0];

  // The active sheet's first AccountBudget block. For sheets of type
  // "budget" this is what the rest of the view renders against. For
  // "accounts" sheets there's no budget item — `activeBudget` is null
  // and we render `AccountsSheetView` in place of `SheetView`. The
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

  // Idle-tracked sign-out. Every user input bumps `lastActivityRef`;
  // a 1 s tick decides whether to surface the "about to sign out"
  // warning, sign the user out, or just re-stamp sessionStorage so a
  // reload mid-session inherits the rolling deadline. The save is
  // throttled to once every 30 s; the warning starts 60 s before the
  // deadline. Stashing `onSignOut` in a ref keeps the effect from
  // re-subscribing every render.
  //
  // The default (no-password) user skips this entirely — there is no
  // key sitting in memory worth expiring, and "Continue without
  // account" implies a stay-signed-in experience.
  const ttlMs = data.settings.sessionTimeoutMinutes * 60_000;
  const signOutRef = useRef(onSignOut);
  signOutRef.current = onSignOut;
  const lastActivityRef = useRef<number>(Date.now());
  const lastSaveAtRef = useRef<number>(0);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState<number | null>(
    null,
  );
  const isGuest = user.isDefault === true;
  useEffect(() => {
    if (isGuest) return;
    // Treat the start of every signed-in session (and every TTL
    // change) as activity so the rolling window restarts from now;
    // re-stamp sessionStorage immediately so a reload right after a
    // setting change picks up the new deadline.
    lastActivityRef.current = Date.now();
    lastSaveAtRef.current = Date.now();
    saveSession(user.id, password, ttlMs);
    setWarningSecondsLeft(null);

    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const e of events) {
      window.addEventListener(e, bump, { passive: true });
    }

    // Aim for a 60 s heads-up, but never more than half the window so
    // a hand-edited 1-minute TTL doesn't fire the warning the moment
    // the user pauses to read.
    const WARNING_LEAD_MS = Math.min(60_000, Math.floor(ttlMs / 2));
    const SAVE_INTERVAL_MS = 30_000;
    const tick = window.setInterval(() => {
      const now = Date.now();
      const idleMs = now - lastActivityRef.current;
      if (idleMs >= ttlMs) {
        signOutRef.current();
        return;
      }
      const remainingMs = ttlMs - idleMs;
      if (remainingMs <= WARNING_LEAD_MS) {
        setWarningSecondsLeft(Math.max(1, Math.ceil(remainingMs / 1000)));
      } else {
        setWarningSecondsLeft((prev) => (prev === null ? prev : null));
        if (now - lastSaveAtRef.current >= SAVE_INTERVAL_MS) {
          saveSession(user.id, password, ttlMs);
          lastSaveAtRef.current = now;
        }
      }
    }, 1000);

    return () => {
      for (const e of events) window.removeEventListener(e, bump);
      window.clearInterval(tick);
    };
  }, [isGuest, user.id, password, ttlMs]);

  const onStaySignedIn = useCallback(() => {
    lastActivityRef.current = Date.now();
    lastSaveAtRef.current = Date.now();
    saveSession(user.id, password, ttlMs);
    setWarningSecondsLeft(null);
  }, [user.id, password, ttlMs]);

  // Drop ids that no longer exist (e.g. after an import) so the toolbar
  // never claims a stale count.
  useEffect(() => {
    const existing = new Set(activeItem.rows.map((r) => r.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (existing.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeItem.rows]);

  const onUpdateCell = useCallback(
    (rowId: string, columnId: string, value: CellValue) =>
      dispatch({
        type: "updateCell",
        sheetId,
        itemId,
        rowId,
        columnId,
        value,
      }),
    [dispatch, sheetId, itemId],
  );
  const onCommitCell = useCallback(
    (rowId: string, columnId: string, value: CellValue) => {
      const row = activeItem.rows.find((r) => r.id === rowId);
      if (!row?.seriesId) return;
      const col = activeItem.columns.find((c) => c.id === columnId);
      // Only propagate fields that make sense across every occurrence —
      // date and completed are inherently per-occurrence, balance is
      // computed.
      if (
        !col ||
        (col.type !== "description" &&
          col.type !== "amount" &&
          col.type !== "category")
      ) {
        return;
      }
      const dateCol = findColumnByType(activeItem.columns, "date");
      const anchorDate =
        dateCol && typeof row.cells[dateCol.id] === "string"
          ? (row.cells[dateCol.id] as string)
          : "";
      let lastSeriesDate: string | null = null;
      if (dateCol) {
        const seriesDates = activeItem.rows
          .filter((r) => r.seriesId === row.seriesId)
          .map((r) => r.cells[dateCol.id])
          .filter((d): d is string => typeof d === "string");
        if (seriesDates.length > 0) {
          lastSeriesDate = seriesDates.sort().at(-1) ?? null;
        }
      }
      setPendingSeriesEdit({
        rowId,
        columnId,
        fieldLabel: col.label,
        anchorDate,
        lastSeriesDate,
        value,
      });
    },
    [activeItem.rows, activeItem.columns],
  );
  const onApplyPendingToFuture = useCallback(
    (untilIso: string | null) => {
      if (!pendingSeriesEdit) return;
      dispatch({
        type: "propagateCellToFuture",
        sheetId,
        itemId,
        rowId: pendingSeriesEdit.rowId,
        columnId: pendingSeriesEdit.columnId,
        value: pendingSeriesEdit.value,
        untilIso,
      });
      setPendingSeriesEdit(null);
    },
    [dispatch, pendingSeriesEdit, sheetId, itemId],
  );
  const onDismissPendingSeriesEdit = useCallback(() => {
    setPendingSeriesEdit(null);
  }, []);

  // Drop the pending prompt if the row vanishes (sheet switch, delete,
  // import) so a stale prompt can't fan out a no-longer-relevant edit.
  useEffect(() => {
    if (!pendingSeriesEdit) return;
    const exists = activeItem.rows.some(
      (r) => r.id === pendingSeriesEdit.rowId,
    );
    if (!exists) setPendingSeriesEdit(null);
  }, [pendingSeriesEdit, activeItem.rows]);
  const onAddRow = useCallback(
    (date: string) => dispatch({ type: "addRow", sheetId, itemId, date }),
    [dispatch, sheetId, itemId],
  );
  const onAddComplex = useCallback((date: string) => {
    setComplexSeedDate(date);
    setComplexOpen(true);
  }, []);
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
    [activeItem.columns, dispatch, sheetId, itemId],
  );
  const onEditRequest = useCallback((row: Row) => {
    setEditPrompt({ kind: "edit", row });
  }, []);
  const onReorderColumns = useCallback(
    (fromId: string, toId: string) =>
      dispatch({ type: "reorderColumns", sheetId, itemId, fromId, toId }),
    [dispatch, sheetId, itemId],
  );
  const onImport = useCallback(
    (next: UserData) => dispatch({ type: "replace", data: next }),
    [dispatch],
  );
  const onCreateCategory = useCallback(
    (draft: Omit<Category, "id">): Category => {
      const category: Category = { id: newId(), ...draft };
      dispatch({ type: "addCategory", category });
      return category;
    },
    [dispatch],
  );
  const onSaveSettings = useCallback(
    (settings: Settings) => dispatch({ type: "updateSettings", settings }),
    [dispatch],
  );
  const onSelectSheet = useCallback(
    (id: string) => dispatch({ type: "selectSheet", sheetId: id }),
    [dispatch],
  );
  const onOpenNewSheet = useCallback(() => {
    setSheetModal({ sheet: null });
  }, []);
  const onOpenEditSheet = useCallback(
    (id: string) => {
      const target = data.sheets.find((s) => s.id === id);
      if (target) setSheetModal({ sheet: target });
    },
    [data.sheets],
  );
  const onSaveSheet = useCallback(
    (draft: SheetDraft) => {
      // Resolve the final accountId. When the user typed a name into
      // the inline "new account" form we mint the account here, then
      // bind the sheet's budget item to its fresh id in the same
      // dispatch batch so a refresh mid-save can't strand the budget
      // pointing at nothing.
      let finalAccountId = draft.accountId;
      if (draft.newAccountName) {
        const account: Account = { id: newId(), name: draft.newAccountName };
        dispatch({ type: "createAccount", account });
        finalAccountId = account.id;
      }

      if (sheetModal?.sheet) {
        const target = sheetModal.sheet;
        dispatch({
          type: "updateSheetMeta",
          sheetId: target.id,
          meta: draft,
        });
        // Update the account binding on the sheet's budget item if it
        // changed. Finding the first AccountBudget mirrors the picker
        // in the view: the current UI exposes one block per sheet.
        const budgetItem = target.items.find(
          (it): it is AccountBudget => it.type === "accountBudget",
        );
        if (budgetItem && budgetItem.accountId !== finalAccountId) {
          dispatch({
            type: "setItemAccount",
            sheetId: target.id,
            itemId: budgetItem.id,
            accountId: finalAccountId,
          });
        }
      } else {
        const sheet = createDefaultSheet(draft.name, finalAccountId, {
          type: draft.type,
          glyph: draft.glyph,
          color: draft.color,
          description: draft.description,
        });
        dispatch({ type: "addSheet", sheet });
      }
    },
    [dispatch, sheetModal],
  );
  const onDeleteSheet = useCallback(() => {
    if (!sheetModal?.sheet) return;
    dispatch({ type: "deleteSheet", sheetId: sheetModal.sheet.id });
    setSheetModal(null);
  }, [dispatch, sheetModal]);

  // Account / transaction modal handlers. Kept on the BudgetView so
  // they share the same dispatch and Account state as the rest of the
  // workspace — the modals themselves stay pure presentational shells.
  const onOpenCreateAccount = useCallback(() => {
    setAccountModal({ account: null });
  }, []);
  const onOpenEditAccount = useCallback(
    (accountId: string) => {
      const target = data.accounts.find((a) => a.id === accountId);
      if (target) setAccountModal({ account: target });
    },
    [data.accounts],
  );
  const onSaveAccount = useCallback(
    (draft: AccountDraft) => {
      // Strip empty strings from optional fields so a cleared input
      // restores "unset" rather than persisting an empty value the
      // schema would carry through every export.
      const patch: Partial<Account> = {
        name: draft.name,
        description: draft.description || undefined,
        glyph: draft.glyph ?? undefined,
        color: draft.color ?? undefined,
        bank: draft.bank || undefined,
        clearing: draft.clearing || undefined,
        accountNumber: draft.accountNumber || undefined,
        iban: draft.iban || undefined,
        bic: draft.bic || undefined,
        currency: draft.currency || undefined,
      };
      if (accountModal?.account) {
        dispatch({
          type: "updateAccount",
          accountId: accountModal.account.id,
          patch,
        });
      } else {
        const account: Account = {
          id: newId(),
          name: draft.name,
          ...(draft.description && { description: draft.description }),
          ...(draft.glyph && { glyph: draft.glyph }),
          ...(draft.color && { color: draft.color }),
          ...(draft.bank && { bank: draft.bank }),
          ...(draft.clearing && { clearing: draft.clearing }),
          ...(draft.accountNumber && { accountNumber: draft.accountNumber }),
          ...(draft.iban && { iban: draft.iban }),
          ...(draft.bic && { bic: draft.bic }),
          ...(draft.currency && { currency: draft.currency }),
        };
        dispatch({ type: "createAccount", account });
      }
      setAccountModal(null);
    },
    [dispatch, accountModal],
  );
  const onDeleteFinancialAccount = useCallback(() => {
    if (!accountModal?.account) return;
    dispatch({
      type: "deleteAccount",
      accountId: accountModal.account.id,
    });
    setAccountModal(null);
  }, [dispatch, accountModal]);

  // Transaction modal entry points. The promote-row path computes the
  // direction from the row's amount sign so the modal only has to ask
  // for the OTHER account.
  const onTransactionRequest = useCallback(
    (row: Row) => {
      if (!activeBudget || activeBudget.accountId === null) return;
      if (row.transactionId) {
        // Synthesized transaction row — open it in edit mode by
        // looking up the underlying transaction.
        const tx = data.transactions.find((t) => t.id === row.transactionId);
        if (!tx) return;
        setTransactionRequest({
          kind: "edit",
          transactionId: tx.id,
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          fromAccountId: tx.fromAccountId,
          toAccountId: tx.toAccountId,
          categoryId: tx.categoryId ?? null,
          completed: tx.completed ?? false,
        });
        return;
      }
      const dateCol = findColumnByType(activeBudget.columns, "date");
      const descCol = findColumnByType(activeBudget.columns, "description");
      const amountCol = findColumnByType(activeBudget.columns, "amount");
      const categoryCol = findColumnByType(activeBudget.columns, "category");
      const rawDate = dateCol ? row.cells[dateCol.id] : null;
      const rawDesc = descCol ? row.cells[descCol.id] : null;
      const rawAmount = amountCol ? row.cells[amountCol.id] : null;
      const rawCategory = categoryCol ? row.cells[categoryCol.id] : null;
      const amount = typeof rawAmount === "number" ? rawAmount : 0;
      setTransactionRequest({
        kind: "promote",
        row,
        selfAccountId: activeBudget.accountId,
        seedDate: typeof rawDate === "string" ? rawDate : "",
        seedDescription: typeof rawDesc === "string" ? rawDesc : "",
        seedAmount: amount,
        outgoing: amount < 0,
        seedCategoryId: typeof rawCategory === "string" ? rawCategory : null,
      });
    },
    [activeBudget, data.transactions],
  );
  const onOpenCreateTransaction = useCallback(() => {
    const today = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    setTransactionRequest({
      kind: "create",
      defaultFromId: data.accounts[0]?.id ?? null,
      defaultToId: data.accounts[1]?.id ?? null,
      seedDate: today,
    });
  }, [data.accounts]);
  const onOpenEditTransaction = useCallback(
    (transactionId: string) => {
      const tx = data.transactions.find((t) => t.id === transactionId);
      if (!tx) return;
      setTransactionRequest({
        kind: "edit",
        transactionId: tx.id,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        fromAccountId: tx.fromAccountId,
        toAccountId: tx.toAccountId,
        categoryId: tx.categoryId ?? null,
        completed: tx.completed ?? false,
      });
    },
    [data.transactions],
  );
  const onPromoteTransaction = useCallback(
    (draft: TransactionDraft) => {
      if (!activeBudget || transactionRequest?.kind !== "promote") return;
      const transaction: Transaction = {
        id: newId(),
        date: draft.date,
        description: draft.description,
        amount: draft.amount,
        fromAccountId: draft.fromAccountId,
        toAccountId: draft.toAccountId,
        ...(draft.categoryId !== null && { categoryId: draft.categoryId }),
        ...(draft.completed && { completed: draft.completed }),
      };
      dispatch({
        type: "promoteRowToTransaction",
        sheetId,
        itemId: activeBudget.id,
        rowId: transactionRequest.row.id,
        transaction,
      });
      setTransactionRequest(null);
    },
    [dispatch, activeBudget, sheetId, transactionRequest],
  );
  const onCreateTransaction = useCallback(
    (draft: TransactionDraft) => {
      const transaction: Transaction = {
        id: newId(),
        date: draft.date,
        description: draft.description,
        amount: draft.amount,
        fromAccountId: draft.fromAccountId,
        toAccountId: draft.toAccountId,
        ...(draft.categoryId !== null && { categoryId: draft.categoryId }),
        ...(draft.completed && { completed: draft.completed }),
      };
      dispatch({ type: "createTransaction", transaction });
      setTransactionRequest(null);
    },
    [dispatch],
  );
  const onEditTransactionSave = useCallback(
    (transactionId: string, draft: TransactionDraft) => {
      dispatch({
        type: "updateTransaction",
        transactionId,
        patch: {
          date: draft.date,
          description: draft.description,
          amount: draft.amount,
          fromAccountId: draft.fromAccountId,
          toAccountId: draft.toAccountId,
          categoryId: draft.categoryId,
          completed: draft.completed,
        },
      });
      setTransactionRequest(null);
    },
    [dispatch],
  );
  const onDeleteTransactionFromModal = useCallback(
    (transactionId: string) => {
      dispatch({ type: "deleteTransaction", transactionId });
      setTransactionRequest(null);
    },
    [dispatch],
  );
  const onComplexSubmit = useCallback(
    (draft: ComplexEntryDraft) => {
      dispatch({ type: "addRowsFromComplex", sheetId, itemId, draft });
      setComplexOpen(false);
    },
    [dispatch, sheetId, itemId],
  );
  const onConvertToRecurring = useCallback(
    (rowId: string, futureDates: string[], glyph: CategoryIcon | null) => {
      dispatch({
        type: "convertToRecurring",
        sheetId,
        itemId,
        rowId,
        futureDates,
        glyph,
      });
      setEditPrompt(null);
    },
    [dispatch, sheetId, itemId],
  );
  const onEditSeries = useCallback(
    (rowId: string, patch: EditPatch, scope: EditScope) => {
      dispatch({ type: "editSeries", sheetId, itemId, rowId, patch, scope });
      setEditPrompt(null);
    },
    [dispatch, sheetId, itemId],
  );

  const onToggleSelect = useCallback((rowId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);
  const onToggleSelectMonth = useCallback(
    (rowIds: string[], target: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of rowIds) {
          if (target) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [],
  );
  const onCancelSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);
  const onToggleSelectMode = useCallback(() => {
    setSelectMode((on) => {
      if (on) setSelectedIds(new Set());
      return !on;
    });
  }, []);

  const dateCol = useMemo(
    () => findColumnByType(activeItem.columns, "date"),
    [activeItem.columns],
  );

  const selectedRows = useMemo(
    () => activeItem.rows.filter((r) => selectedIds.has(r.id)),
    [activeItem.rows, selectedIds],
  );

  const selectedSourceMonths = useMemo<ReadonlySet<string>>(() => {
    if (!dateCol) return new Set();
    const set = new Set<string>();
    for (const r of selectedRows) {
      const key = getMonthKey(r.cells[dateCol.id], data.settings.startOfMonth);
      if (key !== "undated") set.add(key);
    }
    return set;
  }, [selectedRows, dateCol, data.settings.startOfMonth]);

  // Last ISO date in the candidate series — defaults the "until" picker.
  const editLastSeriesDate = useMemo<string | null>(() => {
    const row = editPrompt?.row;
    if (!row?.seriesId || !dateCol) return null;
    const dates = activeItem.rows
      .filter((r) => r.seriesId === row.seriesId)
      .map((r) => r.cells[dateCol.id])
      .filter((d): d is string => typeof d === "string");
    return dates.length > 0 ? (dates.sort().at(-1) ?? null) : null;
  }, [editPrompt, activeItem.rows, dateCol]);

  const deleteActions: ConfirmAction[] = useMemo(() => {
    if (!deletePrompt) return [];
    const row = deletePrompt.row;
    if (!row.seriesId || !dateCol) {
      return [
        {
          label: "Delete this row",
          tone: "danger",
          onSelect: () => {
            dispatch({
              type: "deleteRows",
              sheetId,
              itemId,
              rowIds: [row.id],
            });
            setDeletePrompt(null);
          },
        },
      ];
    }
    const futureIds = rowsInSeriesFrom(activeItem.rows, row, dateCol.id).map(
      (r) => r.id,
    );
    return [
      {
        label: "Just this one",
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteRows", sheetId, itemId, rowIds: [row.id] });
          setDeletePrompt(null);
        },
      },
      {
        label: `This and all future (${futureIds.length})`,
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteRows", sheetId, itemId, rowIds: futureIds });
          setDeletePrompt(null);
        },
      },
    ];
  }, [deletePrompt, activeItem.rows, dateCol, dispatch, sheetId, itemId]);

  const bulkDeleteActions: ConfirmAction[] = useMemo(() => {
    if (!bulkDeletePrompt) return [];
    const ids = bulkDeletePrompt.rowIds;
    return [
      {
        label: `Delete ${ids.length} ${ids.length === 1 ? "row" : "rows"}`,
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteRows", sheetId, itemId, rowIds: ids });
          setBulkDeletePrompt(null);
          onCancelSelect();
        },
      },
    ];
  }, [bulkDeletePrompt, dispatch, sheetId, itemId, onCancelSelect]);

  const onBulkEdit = useCallback(() => setBulkEditOpen(true), []);
  const onBulkDelete = useCallback(() => {
    setBulkDeletePrompt({ kind: "bulk-delete", rowIds: [...selectedIds] });
  }, [selectedIds]);
  const onBulkMove = useCallback(() => {
    setMoveCopyPrompt({ kind: "move", rows: selectedRows });
  }, [selectedRows]);
  const onBulkCopy = useCallback(() => {
    setMoveCopyPrompt({ kind: "copy", rows: selectedRows });
  }, [selectedRows]);

  const onApplyBulkPatch = useCallback(
    (rowIds: string[], patch: BulkPatch) => {
      dispatch({ type: "bulkUpdate", sheetId, itemId, rowIds, patch });
    },
    [dispatch, sheetId, itemId],
  );
  const onApplyBulkRecurring = useCallback(
    (rowIds: string[], futureDates: string[]) => {
      dispatch({
        type: "bulkMakeRecurring",
        sheetId,
        itemId,
        rowIds,
        futureDates,
      });
    },
    [dispatch, sheetId, itemId],
  );
  const handleMoveCopySubmit = useCallback(
    (targetMonths: string[]) => {
      if (!moveCopyPrompt) return;
      const rowIds = moveCopyPrompt.rows.map((r) => r.id);
      if (moveCopyPrompt.kind === "move") {
        dispatch({
          type: "bulkShiftToMonth",
          sheetId,
          itemId,
          rowIds,
          targetMonth: targetMonths[0],
        });
      } else {
        dispatch({
          type: "bulkCopyToMonths",
          sheetId,
          itemId,
          rowIds,
          targetMonths,
        });
      }
      setMoveCopyPrompt(null);
      onCancelSelect();
    },
    [dispatch, moveCopyPrompt, sheetId, itemId, onCancelSelect],
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-full flex-col px-1 pb-20 md:px-5">
      <header className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-page-bg px-2 pt-3 pb-3 md:mb-6 md:gap-x-4 md:gap-y-3 md:px-0 md:pt-4 md:pb-4">
        <button
          type="button"
          onClick={onScrollToToday}
          aria-label="Scroll to today"
          title="Scroll to today"
          className="inline-flex cursor-pointer items-center gap-2 rounded border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
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
          <span className="hidden text-base font-bold tracking-wide text-fg-bright md:inline">
            budget
          </span>
        </button>
        <div className="ml-auto inline-flex items-center gap-2">
          <SaveStateButton dirty={dirty} onSave={saveNow} />
          {backend === "dropbox" && (
            <SyncStatus
              status={status}
              dirty={dirty}
              onClick={() => setSyncDetailsOpen(true)}
            />
          )}
          <ImportExportControls
            data={data}
            onImport={onImport}
            encryption={encryption}
            getEncryptionPassword={getEncryptionPassword}
          />
          <button
            type="button"
            onClick={onToggleSelectMode}
            aria-pressed={selectMode}
            aria-label={selectMode ? "Exit select mode" : "Select rows"}
            title={selectMode ? "Cancel" : "Select"}
            className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
              selectMode
                ? "border-pipe bg-pipe/15 text-pipe"
                : "border-line text-pipe hover:border-pipe hover:bg-surface-2"
            }`}
          >
            <ListChecks size={18} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-line text-muted hover:border-fg hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          >
            <SettingsIcon size={18} aria-hidden focusable={false} />
          </button>
          <UserMenu
            user={user}
            hasOtherUsers={hasOtherUsers}
            onSignOut={onSignOut}
            onSwitchUser={onSwitchUser}
            onCreateAccount={onCreateAccount}
            onDeleteAccount={onDeleteAccount}
          />
        </div>
      </header>
      <main className="flex-1">
        {status.kind === "loading" ? (
          <BudgetLoading />
        ) : activeSheet.type === "accounts" ? (
          <AccountsSheetView
            sheet={activeSheet}
            data={data}
            settings={data.settings}
            onCreateAccount={onOpenCreateAccount}
            onEditAccount={onOpenEditAccount}
            onCreateTransaction={onOpenCreateTransaction}
            onEditTransaction={onOpenEditTransaction}
          />
        ) : (
          <SheetView
            sheet={activeSheet}
            item={activeItem}
            categories={data.categories}
            accounts={data.accounts}
            transactions={data.transactions}
            settings={data.settings}
            selectMode={selectMode}
            selectedIds={selectedIds}
            scrollToTodayTick={scrollToTodayTick}
            onUpdateCell={onUpdateCell}
            onCommitCell={onCommitCell}
            onAddRow={onAddRow}
            onAddComplex={onAddComplex}
            onDeleteRequest={onDeleteRequest}
            onEditRequest={onEditRequest}
            onTransactionRequest={onTransactionRequest}
            onReorderColumns={onReorderColumns}
            onToggleSelect={onToggleSelect}
            onToggleSelectMonth={onToggleSelectMonth}
            onCreateCategory={onCreateCategory}
          />
        )}
      </main>
      {status.kind === "loading" ? null : selectMode ? (
        <BulkActionBar
          count={selectedIds.size}
          onEdit={onBulkEdit}
          onDelete={onBulkDelete}
          onMove={onBulkMove}
          onCopy={onBulkCopy}
          onCancel={onCancelSelect}
        />
      ) : (
        <SheetTabs
          sheets={data.sheets}
          activeSheetId={activeSheet.id}
          onSelect={onSelectSheet}
          onEdit={onOpenEditSheet}
          onAdd={onOpenNewSheet}
        />
      )}
      <SheetModal
        open={sheetModal !== null}
        sheet={sheetModal?.sheet ?? null}
        currentAccountId={
          sheetModal?.sheet
            ? (sheetModal.sheet.items.find(
                (it): it is AccountBudget => it.type === "accountBudget",
              )?.accountId ?? null)
            : null
        }
        accounts={data.accounts}
        canDelete={data.sheets.length > 1}
        // The Accounts flavour is a singleton. The picker greys it out
        // when one already exists (unless the current draft is editing
        // that very sheet).
        accountsSheetTaken={data.sheets.some(
          (s) => s.type === "accounts" && s.id !== sheetModal?.sheet?.id,
        )}
        onClose={() => setSheetModal(null)}
        onSave={onSaveSheet}
        onDelete={onDeleteSheet}
      />
      <AccountModal
        open={accountModal !== null}
        account={accountModal?.account ?? null}
        onClose={() => setAccountModal(null)}
        onSave={onSaveAccount}
        onDelete={onDeleteFinancialAccount}
      />
      <TransactionModal
        open={transactionRequest !== null}
        request={transactionRequest}
        accounts={data.accounts}
        categories={data.categories}
        settings={data.settings}
        onClose={() => setTransactionRequest(null)}
        onPromote={onPromoteTransaction}
        onCreate={onCreateTransaction}
        onEdit={onEditTransactionSave}
        onDelete={onDeleteTransactionFromModal}
        onCreateCategory={onCreateCategory}
      />
      <ComplexEntryModal
        open={complexOpen}
        initialDate={complexSeedDate}
        categories={data.categories}
        settings={data.settings}
        onClose={() => setComplexOpen(false)}
        onCreate={onComplexSubmit}
        onCreateCategory={onCreateCategory}
      />
      <EditEntryModal
        open={editPrompt !== null}
        row={editPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={data.categories}
        settings={data.settings}
        lastSeriesDate={editLastSeriesDate}
        onClose={() => setEditPrompt(null)}
        onConvertToRecurring={onConvertToRecurring}
        onEditSeries={onEditSeries}
        onCreateCategory={onCreateCategory}
      />
      <ApplySeriesEditDialog
        open={pendingSeriesEdit !== null}
        fieldLabel={pendingSeriesEdit?.fieldLabel ?? ""}
        anchorDate={pendingSeriesEdit?.anchorDate ?? ""}
        lastSeriesDate={pendingSeriesEdit?.lastSeriesDate ?? null}
        onCancel={onDismissPendingSeriesEdit}
        onApplyToFuture={onApplyPendingToFuture}
      />
      <BulkEditModal
        open={bulkEditOpen && selectedRows.length > 0}
        rows={selectedRows}
        columns={activeItem.columns}
        categories={data.categories}
        settings={data.settings}
        onClose={() => setBulkEditOpen(false)}
        onApplyPatch={onApplyBulkPatch}
        onApplyRecurring={onApplyBulkRecurring}
        onCreateCategory={onCreateCategory}
      />
      <MoveCopyModal
        open={moveCopyPrompt !== null}
        mode={moveCopyPrompt?.kind ?? "move"}
        rows={moveCopyPrompt?.rows ?? []}
        sourceMonths={selectedSourceMonths}
        onClose={() => setMoveCopyPrompt(null)}
        onSubmit={handleMoveCopySubmit}
      />
      <ConfirmDialog
        open={deletePrompt !== null}
        title={
          deletePrompt?.row.seriesId ? "Delete recurring entry" : "Delete row"
        }
        description={
          deletePrompt?.row.seriesId
            ? "This entry is part of a recurring series. How much should be removed?"
            : "This row will be permanently removed."
        }
        actions={deleteActions}
        onCancel={() => setDeletePrompt(null)}
      />
      <ConfirmDialog
        open={bulkDeletePrompt !== null}
        title="Delete selected"
        description={`${bulkDeletePrompt?.rowIds.length ?? 0} row${
          (bulkDeletePrompt?.rowIds.length ?? 0) === 1 ? "" : "s"
        } will be permanently removed.`}
        actions={bulkDeleteActions}
        onCancel={() => setBulkDeletePrompt(null)}
      />
      <SyncDetailsModal
        open={syncDetailsOpen}
        backend={backend}
        status={status}
        dirty={dirty}
        onSaveNow={saveNow}
        onClose={() => setSyncDetailsOpen(false)}
      />
      <SettingsModal
        open={settingsOpen}
        settings={data.settings}
        backend={backend}
        dropboxConnected={dropboxConnected}
        gdriveConnected={gdriveConnected}
        encryption={encryption}
        isGuest={isGuest}
        onClose={() => setSettingsOpen(false)}
        onSave={onSaveSettings}
        onConnectDropbox={onConnectDropbox}
        onDisconnectDropbox={onDisconnectDropbox}
        onConnectGdrive={onConnectGdrive}
        onDisconnectGdrive={onDisconnectGdrive}
        onSelectLocal={onSelectLocal}
        onSetEncryption={onSetEncryption}
      />
      <ConfirmDialog
        open={warningSecondsLeft !== null}
        title="About to sign out"
        description={
          warningSecondsLeft !== null
            ? `For your security, you'll be signed out in ${warningSecondsLeft} ${
                warningSecondsLeft === 1 ? "second" : "seconds"
              } unless you stay signed in.`
            : null
        }
        actions={[{ label: "Stay signed in", onSelect: onStaySignedIn }]}
        hideCancel
        onCancel={onStaySignedIn}
      />
    </div>
  );
}
