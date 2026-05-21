import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListChecks, Settings as SettingsIcon } from "lucide-react";

import { AccountModal, type AccountDraft } from "./components/AccountModal";
import { UpdateBalanceModal } from "./components/UpdateBalanceModal";
import { AccountsSheetView } from "./components/AccountsSheetView";
import { ApplySeriesEditDialog } from "./components/ApplySeriesEditDialog";
import { AuthScreen } from "./components/AuthScreen";
import { BudgetLoading } from "./components/BudgetLoading";
import { ChangelogModal } from "./components/ChangelogModal";
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
  type ComplexEntrySeed,
} from "./components/ComplexEntryModal";
import { ConfirmDialog, type ConfirmAction } from "./components/ConfirmDialog";
import {
  EditEntryModal,
  type EditPatch,
  type EditScope,
  type HistoryMatchPreview,
  type HistoryPromotePrefill,
} from "./components/EditEntryModal";
import {
  EditRowModal,
  type EditRowPatch,
  type EditRowScope,
} from "./components/EditRowModal";
import {
  SplitEntryModal,
  type SplitSubmission,
} from "./components/SplitEntryModal";
import { DownloadModal, type DownloadConfig } from "./components/DownloadModal";
import { HistoryEntryEditModal } from "./components/HistoryEntryEditModal";
import { HistoryModal } from "./components/HistoryModal";
import { ImportHistoryModal } from "./components/ImportHistoryModal";
import {
  ReconciliationModal,
  type ReconciliationApply,
} from "./components/ReconciliationModal";
import {
  MatchRuleModal,
  type MatchRuleDraft,
} from "./components/MatchRuleModal";
import { MoveCopyModal } from "./components/MoveCopyModal";
import { SaveStateButton } from "./components/SaveStateButton";
import { SettingsModal } from "./components/SettingsModal";
import { SheetView } from "./components/SheetView";
import { ConflictResolutionModal } from "./components/ConflictResolutionModal";
import { ReconnectCloudModal } from "./components/ReconnectCloudModal";
import { SyncDetailsModal } from "./components/SyncDetailsModal";
import { SyncStatus } from "./components/SyncStatus";
import { UserMenu } from "./components/UserMenu";
import { STORAGE_KEY, cloudMirrorKey, userDataKey } from "./data/constants";
import {
  buildBudgetExportRows,
  CSV_MIME_TYPE,
  exportRowsToTable,
  rowsToCsv,
} from "./data/budget-export";
import {
  buildAccountsExport,
  JSON_MIME_TYPE,
  serializeAccountsExport,
} from "./data/accounts-export";
import { allCategories, allTypes } from "./data/presets";
import {
  accountBalance,
  createDefaultSheet,
  findColumnByType,
  getMonthKey,
  isRowSavable,
  newId,
  rowsInSeriesFrom,
  userDataWithSavableRows,
} from "./data/sheet";
import { coverageDelta, coveredMonths } from "./data/coverage";
import { detectPaydayDayOfMonth } from "./data/payday";
import {
  findCandidates,
  findOrphans,
  findRuleDrivenCandidates,
  type MatchCandidate,
  type OrphanRow,
} from "./data/reconciliation";
import type {
  Account,
  AccountBudget,
  Category,
  CellValue,
  Column,
  EntryType,
  HistoryEntry,
  HistoryEntrySplit,
  MatchRule,
  Row,
  Settings,
  Sheet,
  StoredUser,
  Transaction,
  UserData,
} from "./data/types";
import { normaliseDescription } from "./data/description-normaliser";
import { RecurringCandidatesPanel } from "./components/RecurringCandidatesPanel";
import { TransferCollapseModal } from "./components/TransferCollapseModal";
import type { RecurringCandidate } from "./data/recurring-detection";
import {
  detectTransferCandidates,
  type TransferCandidate,
} from "./data/transfer-collapse";
import { expandRecurrence, type RecurrenceRule } from "./data/recurrence";
import { reducer } from "./data/reducer";
import type { Snapshot, StorageAdapter } from "./storage/adapter";
import {
  type BackendId,
  type EncryptionMode,
  clearCloudOfflineMode,
  clearDropboxRefreshToken,
  clearDropboxToken,
  clearGdriveToken,
  getBackend,
  getCloudOfflineMode,
  getCloudReauthAutoOpen,
  getDropboxRefreshToken,
  getDropboxToken,
  getEncryption,
  getGdriveToken,
  setBackend,
  setCloudOfflineMode,
  setCloudReauthAutoOpen,
  setDropboxRefreshToken,
  setDropboxToken,
  setEncryption,
  setGdriveToken,
} from "./storage/backend-preference";
import { encryptText, isEncryptedEnvelope } from "./storage/crypto";
import {
  type DropboxAuthResult,
  completeDropboxAuth,
  createDropboxAdapter,
  hasPendingDropboxAuth,
  startDropboxAuth,
} from "./storage/dropbox-adapter";
import { mergeHistory, type ParsedBankFile } from "./storage/bank-parsers";
import { serializeUserData } from "./storage/file";
import { createGdriveAdapter, startGdriveAuth } from "./storage/gdrive-adapter";
import { withCloudMirror, clearCloudMirror } from "./storage/cloud-mirror";
import { withEncryption } from "./storage/encrypting-adapter";
import { createFolderAdapter } from "./storage/folder-adapter";
import {
  clearDirectoryHandle,
  ensurePermission,
  isFolderBackendAvailable,
  loadDirectoryHandle,
  saveDirectoryHandle,
} from "./storage/folder-handle-store";
import {
  clearRawStorage,
  createLocalAdapter,
  readRawStorage,
  writeRawStorage,
} from "./storage/local-adapter";
import { clearSession, loadSession, saveSession } from "./storage/session";
import { useUserDataStorage } from "./storage/useUserDataStorage";
import {
  type AccountsDownloadPrefs,
  type BudgetDownloadPrefs,
  getAccountsDownloadPrefs,
  getBudgetDownloadPrefs,
  setAccountsDownloadPrefs,
  setBudgetDownloadPrefs,
} from "./storage/download-preferences";
import { bcp47, type Lang, useT } from "./i18n";
import { useTheme } from "./hooks/useTheme";
import { writeLanguagePreference } from "./i18n/language-preference";
import { APP_VERSION } from "./utils/build-env";
import { createLogger } from "./utils/logger";
import { slugifyFilename, todayStamp, triggerDownload } from "./utils/download";
import { formatNumber, withCurrency } from "./utils/format";
import { cmpSemver } from "./utils/semver";
import { buildXlsx, XLSX_MIME_TYPE } from "./utils/xlsx";

const log = createLogger("app");
import {
  createDefaultUser,
  createUser,
  findDefaultUser,
  loadUsersFile,
  saveUsersFile,
  verifyPassword,
} from "./storage/users";

type DeletePrompt = { kind: "delete"; row: Row };
type EditPrompt = { kind: "edit"; row: Row };
type EditRowPrompt = { kind: "edit-row"; row: Row };
type SplitPrompt = { kind: "split"; row: Row };
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

// Reconciliation modal state, populated immediately after an import
// dispatch. Snapshotted from the pre-import data + parsed entries so
// the modal doesn't have to chase the reducer to reproduce the
// matcher's view of the world. The reducer applies stored series
// rules silently in advance; `candidates` therefore only contains
// pairs that don't already fit a learned rule.
type ReconciliationState = {
  accountId: string;
  // For rendering: pre-import data so the modal can look up row /
  // entry shapes from a stable reference even if the user keeps
  // working in the background.
  preImportData: UserData;
  // History entries newly added by this import (excluding ones the
  // silent series-rule pass already paired up).
  newEntries: HistoryEntry[];
  candidates: MatchCandidate[];
  orphans: OrphanRow[];
  // Day-of-month the orphan move-to picker defaults to.
  paydayDay: number;
};

// In-flight recurring-candidate promotion. Captured when the user
// clicks Promote on the recurring-candidate panel and consumed by
// the ComplexEntryModal's submit so the dispatcher knows the
// candidate key to mark as consumed and the raw bank text for the
// merchant-hint key.
type RecurringPromoteContext = {
  key: string;
  sourceDescription: string;
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

// In-flight cloud-link awaiting the user's confirmation. OAuth has
// completed (so we hold valid tokens) and the target cloud and the
// active source backend have both been probed — `remoteSnapshot` is
// the cloud's existing file (or `null` when the cloud is empty), and
// `sourceText` is the bytes currently on the source side (or `null`
// when the source has nothing yet). The dialog uses the
// presence / absence of each side to decide what to ask; resolving
// uploads `sourceText` to the cloud (threading
// `remoteSnapshot.revision` so the write lands as an update rather
// than a colliding `add`) when the user picks "use this device's
// budget", and otherwise just flips the backend.
type PendingCloudLink =
  | {
      provider: "dropbox";
      auth: DropboxAuthResult;
      // The backend the user is linking *from*, used to phrase the
      // dialog ("this device" vs. "your current Dropbox" etc.).
      fromBackend: BackendId;
      remoteSnapshot: Snapshot | null;
      sourceText: string | null;
    }
  | {
      provider: "gdrive";
      accessToken: string;
      fromBackend: BackendId;
      remoteSnapshot: Snapshot | null;
      sourceText: string | null;
    };

// In-flight folder-link awaiting the user's confirmation. Same shape
// as `PendingCloudLink` but gesture-driven rather than OAuth-driven —
// the handle is already granted by the time we get here. Kept
// separate from `PendingCloudLink` so the dialog wording and the
// commit path stay specific to each flow (OAuth tokens vs. a directory
// handle, "your Dropbox" vs. "the folder you picked").
type PendingFolderLink = {
  handle: FileSystemDirectoryHandle;
  fromBackend: BackendId;
  remoteSnapshot: Snapshot | null;
  sourceText: string | null;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addMonthsIso(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return iso;
  }
  const target = new Date(Date.UTC(y, m - 1 + months, d));
  const ty = target.getUTCFullYear();
  const tm = String(target.getUTCMonth() + 1).padStart(2, "0");
  const td = String(target.getUTCDate()).padStart(2, "0");
  return `${ty}-${tm}-${td}`;
}

// Shift a candidate-derived rule so its first occurrence is on or
// after `today`. The recurring-candidate detector emits a rule whose
// `start` is the last historical occurrence — useful for cadence
// inference, but the user only ever wants to schedule future rows.
// When every expanded date is already past `today` (the candidate
// has gone quiet) we fall back to the rule's original window so the
// user still sees the detected cadence in the form.
function shiftRuleStartToFuture(
  rule: RecurrenceRule,
  today: string,
): RecurrenceRule {
  const all = expandRecurrence(rule);
  const firstFuture = all.find((d) => d > today);
  if (!firstFuture) return rule;
  switch (rule.kind) {
    case "once":
      return { kind: "once", date: firstFuture };
    case "dates":
      return { kind: "dates", dates: rule.dates.filter((d) => d > today) };
    case "everyNDays":
      return {
        ...rule,
        start: firstFuture,
        end: addMonthsIso(firstFuture, 12),
      };
    case "everyNMonths": {
      const span = rule.intervalMonths >= 12 ? 24 : 12;
      return {
        ...rule,
        start: firstFuture,
        end: addMonthsIso(firstFuture, span),
      };
    }
  }
}

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

  // Per-user device-local storage preferences. Seeded from boot so the
  // very first adapter built by the `useMemo` below matches what the
  // auth effect would later set — same fix shape as encryption below.
  // Without this, a refresh on a cloud-backed account boots with
  // backend="browser", builds a local adapter whose `loadSync()` hands
  // back whatever stale bytes happen to live under `userDataKey(uid)`,
  // shows them on screen for a frame, then the auth effect swaps the
  // adapter to the real cloud one — which races a queued auto-save of
  // the stale bytes against the in-flight cloud load. On mobile this
  // surfaces as the real budget flashing in for a moment ("blink") and
  // then collapsing back to a fresh "Sheet 1" with the save button lit
  // up dirty (the empty in-memory state vs. the bytes the racing save
  // wrote into `lastSavedText`).
  const [backend, setBackendState] = useState<BackendId>(() =>
    boot.auth.kind === "signed-in" ? getBackend(boot.auth.user.id) : "browser",
  );
  const [dropboxToken, setDropboxTokenState] = useState<string | null>(() =>
    boot.auth.kind === "signed-in" ? getDropboxToken(boot.auth.user.id) : null,
  );
  // The refresh token is held in a ref rather than React state because
  // silent refreshes update the access token in localStorage and inside
  // the adapter's closure — bouncing it through `setState` would
  // rebuild the `adapter` useMemo and trigger a needless reload of the
  // user's data.
  const dropboxRefreshTokenRef = useRef<string | null>(
    boot.auth.kind === "signed-in"
      ? getDropboxRefreshToken(boot.auth.user.id)
      : null,
  );
  const [gdriveToken, setGdriveTokenState] = useState<string | null>(() =>
    boot.auth.kind === "signed-in" ? getGdriveToken(boot.auth.user.id) : null,
  );
  // Live `FileSystemDirectoryHandle` for the folder backend, restored
  // from IndexedDB after auth flips. `folderHandleLoaded` distinguishes
  // "still probing IDB" from "no handle exists" so the `adapter`
  // useMemo can hold off on building anything during the async restore
  // (returning `null` from the memo, which the storage hook treats as
  // a no-op — same contract as the auth handshake). Seeded `true` for
  // non-folder users so the adapter useMemo isn't gated on a probe
  // that has nothing to find — without this gate, every cloud-backed
  // refresh would flicker through `folderHandleLoaded=false → true`
  // and rebuild the adapter for no reason.
  const [folderHandle, setFolderHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [folderHandleLoaded, setFolderHandleLoaded] = useState<boolean>(() => {
    if (boot.auth.kind !== "signed-in") return true;
    return getBackend(boot.auth.user.id) !== "folder";
  });
  // Set when a boot-time `queryPermission` returns anything other than
  // "granted" — the App keeps the IDB record around so the user can
  // re-grant with one click, but the Settings hint flips to a
  // "Reconnect folder" cue and the active adapter falls back to the
  // browser backend so editing keeps working.
  const [folderReconnectNeeded, setFolderReconnectNeeded] = useState(false);
  // Seeded from boot so the very first adapter built by the `useMemo`
  // below matches what the auth effect would later set. Without this,
  // a guest-with-data session boots with encryption="encrypted", the
  // adapter is wrapped with `withEncryption` (no `loadSync`), the
  // storage hook latches into status:"loading", and the auth effect's
  // swap to the bare local adapter races the in-flight load — the
  // load gets cancelled and "Loading budget…" never clears.
  const [encryption, setEncryptionState] = useState<EncryptionMode>(() => {
    if (boot.auth.kind !== "signed-in") return "encrypted";
    return boot.auth.user.isDefault
      ? "plaintext"
      : getEncryption(boot.auth.user.id);
  });
  // Per-user, per-device opt-in for the cloud-mirror fallback. Off by
  // default — without it a cloud-backed session waits for the cloud to
  // answer before letting the user edit, which is the historical
  // contract. Seeded from the same per-user key as `encryption` above
  // so the adapter `useMemo` below sees the right wrapping on first
  // render.
  const [cloudOfflineMode, setCloudOfflineModeState] = useState<boolean>(() => {
    if (boot.auth.kind !== "signed-in") return false;
    return getCloudOfflineMode(boot.auth.user.id);
  });

  // Pending cloud-link conflict resolution. Non-null while the user is
  // being asked to decide between adopting the cloud file or replacing
  // it with their current budget — the tokens collected by OAuth are
  // parked here so the dialog's "Use cloud" / "Replace with current
  // budget" branches can finish the link with the right effect.
  const [pendingCloudLink, setPendingCloudLink] =
    useState<PendingCloudLink | null>(null);
  const [pendingFolderLink, setPendingFolderLink] =
    useState<PendingFolderLink | null>(null);

  // Mirror of BudgetView's in-memory `UserData` so the OAuth-completion
  // and conflict-resolution paths in App can push the user's current
  // budget into a freshly-linked cloud backend. BudgetView updates this
  // on every render — see the `useEffect` near `useUserDataStorage` —
  // and null means "no budget loaded yet" (e.g. between mount and the
  // first async load on a cloud adapter).
  const currentDataRef = useRef<UserData | null>(null);

  // Sync state with the active user every time auth flips. The
  // default (no-password) user is pinned to plaintext storage — there
  // is no password to derive a key from, and the user explicitly
  // opted out of accounts.
  useEffect(() => {
    if (auth.kind !== "signed-in") {
      log.info("auth: signed-out — clearing per-user preferences");
      setBackendState("browser");
      setDropboxTokenState(null);
      dropboxRefreshTokenRef.current = null;
      setGdriveTokenState(null);
      setEncryptionState("encrypted");
      setCloudOfflineModeState(false);
      return;
    }
    const nextBackend = getBackend(auth.user.id);
    const nextDropboxToken = getDropboxToken(auth.user.id);
    const nextRefresh = getDropboxRefreshToken(auth.user.id);
    const nextGdriveToken = getGdriveToken(auth.user.id);
    const nextEncryption = auth.user.isDefault
      ? "plaintext"
      : getEncryption(auth.user.id);
    const nextOffline = getCloudOfflineMode(auth.user.id);
    log.info(
      `auth: signed-in user=${auth.user.username} isDefault=${Boolean(auth.user.isDefault)} backend=${nextBackend} hasDropboxToken=${Boolean(nextDropboxToken)} hasDropboxRefresh=${Boolean(nextRefresh)} hasGdriveToken=${Boolean(nextGdriveToken)} encryption=${nextEncryption} cloudOffline=${nextOffline}`,
    );
    setBackendState(nextBackend);
    setDropboxTokenState(nextDropboxToken);
    dropboxRefreshTokenRef.current = nextRefresh;
    setGdriveTokenState(nextGdriveToken);
    setEncryptionState(nextEncryption);
    setCloudOfflineModeState(nextOffline);
  }, [auth]);

  // Persist the OAuth tokens and flip the active backend in one batch,
  // so the adapter `useMemo` below rebuilds against the new cloud
  // backend exactly once. Split out from the OAuth effect because both
  // the "no remote file" branch and the conflict-resolution dialog
  // need the same commit step.
  const commitDropboxLink = useCallback(
    (userId: string, result: DropboxAuthResult) => {
      log.info(
        `commitDropboxLink: persisting tokens hasRefresh=${Boolean(result.refreshToken)}`,
      );
      setDropboxToken(userId, result.accessToken);
      if (result.refreshToken) {
        setDropboxRefreshToken(userId, result.refreshToken);
        dropboxRefreshTokenRef.current = result.refreshToken;
      } else {
        log.warn(
          "commitDropboxLink: no refresh token in response — silent refresh will not work",
        );
        // Shouldn't happen — `token_access_type=offline` should always
        // return one — but clear stale state if it does so we don't
        // try to refresh with the previous account's token.
        clearDropboxRefreshToken(userId);
        dropboxRefreshTokenRef.current = null;
      }
      setBackend(userId, "dropbox");
      setDropboxTokenState(result.accessToken);
      setBackendState("dropbox");
    },
    [],
  );

  const commitGdriveLink = useCallback((userId: string, token: string) => {
    log.info("commitGdriveLink: persisting token");
    setGdriveToken(userId, token);
    setBackend(userId, "gdrive");
    setGdriveTokenState(token);
    setBackendState("gdrive");
  }, []);

  // Wrap a raw adapter with `withEncryption` when the active user has
  // encryption on AND a password is in hand — mirrors the same gate
  // used when assembling the live `adapter` below, so source / target
  // probes during the link flow see and write the bytes through the
  // same envelope the steady-state app does.
  const wrapWithActiveEncryption = useCallback(
    (raw: StorageAdapter): StorageAdapter => {
      const password = passwordRef.current;
      return encryption === "encrypted" && password
        ? withEncryption(raw, passwordRef)
        : raw;
    },
    [encryption],
  );

  // Build a raw adapter for the *source* backend so the OAuth-
  // completion path can load the user's current bytes without
  // depending on `currentDataRef` — which only reflects whatever
  // BudgetView happens to have loaded by the time the redirect lands
  // (typically `freshUserData()` on a cold boot, since cloud loads
  // are async). Returns null only when the source is a cloud backend
  // and the token has gone missing.
  const buildSourceRawAdapter = useCallback(
    (userId: string, fromBackend: BackendId): StorageAdapter | null => {
      if (fromBackend === "dropbox") {
        const token = getDropboxToken(userId);
        if (!token) return null;
        const refresh = getDropboxRefreshToken(userId);
        return createDropboxAdapter({
          accessToken: token,
          refreshToken: refresh,
          onAccessTokenRefreshed: (next) => {
            setDropboxToken(userId, next);
          },
        });
      }
      if (fromBackend === "gdrive") {
        const token = getGdriveToken(userId);
        if (!token) return null;
        return createGdriveAdapter(token);
      }
      if (fromBackend === "folder") {
        // The folder source needs the live handle held in App state,
        // not something we can rebuild from localStorage. Caller falls
        // back to the in-memory snapshot when the handle isn't there
        // — e.g. permission was revoked between sessions.
        if (!folderHandle) return null;
        return createFolderAdapter({ directoryHandle: folderHandle });
      }
      return createLocalAdapter(userDataKey(userId));
    },
    [folderHandle],
  );

  // Read the source backend's current bytes, falling back to the
  // in-memory snapshot if the source adapter can't be built (e.g. a
  // cloud source whose token expired between sessions). The result
  // is plaintext UserData JSON ready to be re-written through a
  // wrapped target adapter on the resolve path.
  const loadSourceText = useCallback(
    async (userId: string, fromBackend: BackendId): Promise<string | null> => {
      const raw = buildSourceRawAdapter(userId, fromBackend);
      if (raw) {
        try {
          const wrapped = wrapWithActiveEncryption(raw);
          const snap = await wrapped.load();
          if (snap) return snap.text;
        } catch (err) {
          log.error("source load failed during cloud link", err);
        }
      }
      const fallback = currentDataRef.current;
      return fallback ? serializeUserData(fallback) : null;
    },
    [buildSourceRawAdapter, wrapWithActiveEncryption],
  );

  // Complete the Dropbox OAuth round-trip when the redirect lands
  // back here. The user signed in before clicking Connect, so by the
  // time this fires they should already be signed-in again (or about
  // to be — we wait for that transition). Errors surface in the
  // console only; a future polish pass can surface them in UI.
  //
  // Google Drive uses a popup-based GIS token client (no redirect),
  // so only Dropbox arrives via this codepath. Pending-verifier check
  // guards against picking up a stray `?code=` from some other source
  // before kicking off the token exchange.
  //
  // Before flipping the backend we probe both sides — the target
  // cloud (so the dialog knows whether it already holds a budget)
  // and the source backend (so we have authoritative bytes to push,
  // independent of whether BudgetView has finished its async load
  // into `currentDataRef`). The result is always parked in
  // `pendingCloudLink` so the user sees an explicit confirmation
  // dialog for the switch, even in the no-conflict cases — silently
  // flipping the backend has been the source of "did it work?"
  // confusion.
  useEffect(() => {
    if (auth.kind !== "signed-in") return;
    const rawSearch = window.location.search;
    const params = new URLSearchParams(rawSearch);
    const code = params.get("code");
    if (!code) return;
    // Pin the narrowed string into a local — TypeScript's
    // `if (!code) return` narrowing doesn't reach the nested function
    // declarations below, which would otherwise see `string | null`.
    const authCode = code;
    const state = params.get("state");
    const oauthErr = params.get("error");
    const dropboxPending = hasPendingDropboxAuth();
    // Echo the raw query string (sans the code, which is a secret) so
    // a misbehaving redirect chain — extra params, dropped `state`,
    // unexpected fragments — shows up in the console verbatim instead
    // of being inferred from the routing decision below.
    const sanitisedSearch = rawSearch.replace(/(code=)[^&]*/, "$1<redacted>");
    log.info(
      `oauth: redirect landed — search=${sanitisedSearch || "<empty>"} state=${state ?? "<none>"} error=${oauthErr ?? "<none>"} dropboxPending=${dropboxPending}`,
    );
    if (oauthErr) {
      log.error(
        `oauth: provider returned error=${oauthErr} desc=${params.get("error_description") ?? "<none>"}; aborting and cleaning URL`,
      );
      cleanCodeFromUrl();
      return;
    }
    if (!dropboxPending) {
      log.error(
        `oauth: ?code= present but no Dropbox verifier — ignoring and cleaning URL (state=${state ?? "<none>"})`,
      );
      cleanCodeFromUrl();
      return;
    }
    let cancelled = false;
    const userId = auth.user.id;
    const fromBackend = getBackend(userId);
    log.info(
      `oauth: ?code= present provider=dropbox (state=${state ?? "<none>"}) fromBackend=${fromBackend}`,
    );

    void doDropbox()
      .catch((err: unknown) => {
        log.error("oauth: dropbox connect failed", err);
      })
      .finally(cleanCodeFromUrl);

    async function doDropbox(): Promise<void> {
      log.info("oauth(dropbox): exchanging code for tokens");
      const result = await completeDropboxAuth(authCode);
      if (cancelled || auth.kind !== "signed-in") {
        log.info("oauth(dropbox): aborted after token exchange (cancelled)");
        return;
      }
      log.info("oauth(dropbox): probing remote + source in parallel");
      const probe = createDropboxAdapter({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        // Refresh-token swaps before commit have nowhere durable to
        // land — the user hasn't accepted the link yet. Drop the new
        // token on the floor; the post-commit adapter will mint its
        // own on the next 401.
        onAccessTokenRefreshed: () => {},
      });
      const [remote, sourceText] = await Promise.all([
        probe.load().catch((err: unknown) => {
          log.error("oauth(dropbox): probe failed", err);
          return null;
        }),
        loadSourceText(userId, fromBackend),
      ]);
      if (cancelled || auth.kind !== "signed-in") {
        log.info("oauth(dropbox): aborted after probe (cancelled)");
        return;
      }
      log.info(
        `oauth(dropbox): probe done remoteHasBytes=${Boolean(remote)} sourceHasBytes=${Boolean(sourceText)} — opening confirmation`,
      );
      setPendingCloudLink({
        provider: "dropbox",
        auth: result,
        fromBackend,
        remoteSnapshot: remote,
        sourceText,
      });
    }

    function cleanCodeFromUrl() {
      // Clean the OAuth round-trip params out of the URL regardless
      // of outcome so a page reload doesn't re-trigger the exchange
      // and so the URL bar isn't left littered with provider-specific
      // junk. `code`/`state` are ours; `error`/`error_description` are
      // standard OAuth 2.0 error fields; `iss` is RFC 9207 issuer
      // identification (Google sets it); `scope`, `authuser`, `prompt`,
      // and `hd` are Google-specific extras.
      const url = new URL(window.location.href);
      for (const key of [
        "code",
        "state",
        "error",
        "error_description",
        "iss",
        "scope",
        "authuser",
        "prompt",
        "hd",
      ]) {
        url.searchParams.delete(key);
      }
      window.history.replaceState({}, "", url.toString());
    }
    return () => {
      cancelled = true;
    };
  }, [auth, loadSourceText]);

  // Resolve a parked cloud-link confirmation. "use-cloud" just flips
  // the backend and lets the storage hook reload from the cloud (which
  // may itself be empty — that's the "both sides empty, just confirm"
  // case). "use-source" pushes the stashed `sourceText` through the
  // probe adapter first, threading the remote revision so the write
  // lands as an update rather than a colliding `add` when the cloud
  // already had a file; then flips the backend. The dialog is
  // dismissed as soon as the user picks so the path stays snappy;
  // any error from the upload is logged and the link silently aborts
  // (the user can retry from Settings).
  const resolveCloudLink = useCallback(
    async (action: "use-cloud" | "use-source"): Promise<void> => {
      const pending = pendingCloudLink;
      if (!pending || auth.kind !== "signed-in") return;
      log.info(
        `cloud-link resolve: ${pending.provider} action=${action} fromBackend=${pending.fromBackend}`,
      );
      setPendingCloudLink(null);
      const userId = auth.user.id;
      try {
        if (action === "use-source" && pending.sourceText !== null) {
          log.info(
            `cloud-link: pushing source bytes (${pending.sourceText.length}) into ${pending.provider}`,
          );
          const probeRaw =
            pending.provider === "dropbox"
              ? createDropboxAdapter({
                  accessToken: pending.auth.accessToken,
                  refreshToken: pending.auth.refreshToken,
                  onAccessTokenRefreshed: (next) => {
                    setDropboxToken(userId, next);
                  },
                })
              : createGdriveAdapter(pending.accessToken);
          const probe = wrapWithActiveEncryption(probeRaw);
          await probe.save(
            pending.sourceText,
            pending.remoteSnapshot?.revision,
          );
        }
        log.info(
          `cloud-link: committing — flipping backend to ${pending.provider}`,
        );
        if (pending.provider === "dropbox") {
          commitDropboxLink(userId, pending.auth);
        } else {
          commitGdriveLink(userId, pending.accessToken);
        }
      } catch (err) {
        log.error(`cloud-link: ${pending.provider} link failed`, err);
      }
    },
    [
      auth,
      pendingCloudLink,
      commitDropboxLink,
      commitGdriveLink,
      wrapWithActiveEncryption,
    ],
  );

  const cancelCloudLink = useCallback(() => {
    setPendingCloudLink(null);
  }, []);

  const adapter = useMemo<StorageAdapter | null>(() => {
    if (auth.kind !== "signed-in") {
      log.info("adapter: null (not signed in)");
      return null;
    }
    const userId = auth.user.id;
    // Folder backend with the handle still being restored from IDB —
    // return null so the storage hook waits (same null-tolerated path
    // as the auth handshake). Without this gate the first render
    // would pick the browser fallback below and trigger an unwanted
    // load + replace before the folder handle lands.
    if (backend === "folder" && !folderHandleLoaded) {
      log.info("adapter: null (folder handle still loading)");
      return null;
    }
    let inner: StorageAdapter;
    let isCloud = false;
    if (backend === "dropbox" && dropboxToken) {
      log.info(
        `adapter: building dropbox (hasRefresh=${Boolean(dropboxRefreshTokenRef.current)})`,
      );
      inner = createDropboxAdapter({
        accessToken: dropboxToken,
        refreshToken: dropboxRefreshTokenRef.current,
        // Persist the silently-refreshed access token so the next
        // page load picks it up; deliberately do NOT touch React
        // state, since rebuilding the adapter mid-session would
        // discard our `lastSnapshot` and force a reload of the
        // user's data.
        onAccessTokenRefreshed: (next) => {
          log.info("dropbox: persisting refreshed access token");
          setDropboxToken(userId, next);
        },
      });
      isCloud = true;
    } else if (backend === "gdrive" && gdriveToken) {
      log.info("adapter: building gdrive");
      inner = createGdriveAdapter(gdriveToken);
      isCloud = true;
    } else if (backend === "folder" && folderHandle) {
      log.info("adapter: building folder");
      inner = createFolderAdapter({
        directoryHandle: folderHandle,
        onPermissionLost: () => {
          // The OS revoked access mid-session (rare, but possible
          // via site-settings while the tab is open). Drop the live
          // handle so the next render falls back to the browser
          // adapter, and surface the reconnect banner — the IDB
          // record is intentionally kept so the user can re-grant
          // with one click against the stored handle.
          log.warn("folder: permission lost during operation");
          setFolderHandle(null);
          setFolderReconnectNeeded(true);
        },
      });
    } else {
      log.info(
        `adapter: building browser (backend=${backend} dropboxToken=${Boolean(
          dropboxToken,
        )} gdriveToken=${Boolean(gdriveToken)} folderHandle=${Boolean(
          folderHandle,
        )})`,
      );
      // Default and reconnect-needed fallback. When `backend ===
      // "folder"` but no live handle is in state (permission lost,
      // or IDB had no record), this keeps the user editing locally
      // until they reconnect from Settings — better than locking
      // them out.
      inner = createLocalAdapter(userDataKey(userId));
    }
    // Wrap cloud backends with the offline-mirror so a session that
    // boots without network can still load the last-known bytes and
    // accept edits. The wrapper sits *under* `withEncryption` so it
    // sees and mirrors the same ciphertext the cloud holds, keeping
    // the on-disk threat model end-to-end. Gated on the per-user
    // `cloudOfflineMode` preference — when off, cloud sessions
    // behave the historical way (wait for the cloud, surface errors
    // on failure).
    if (isCloud && cloudOfflineMode) {
      log.info(`adapter: wrapping ${inner.id} with cloud-mirror`);
      inner = withCloudMirror(inner, {
        storageKey: cloudMirrorKey(userId),
      });
    }
    // Skip the encryption wrapper entirely when the user has opted
    // out — keeps `loadSync` available on local and writes plaintext
    // bytes to whichever inner backend is active (including the
    // cloud backends).
    if (encryption === "plaintext") {
      log.info(`adapter: encryption off — inner=${inner.id}`);
      return inner;
    }
    if (!passwordRef.current) {
      log.warn(
        `adapter: encryption on but no password held — load will fail with "password required" if the file is encrypted (inner=${inner.id})`,
      );
    } else {
      log.info(`adapter: wrapping ${inner.id} with encryption`);
    }
    return withEncryption(inner, passwordRef);
  }, [
    auth,
    backend,
    dropboxToken,
    gdriveToken,
    folderHandle,
    folderHandleLoaded,
    encryption,
    cloudOfflineMode,
  ]);

  const handleConnectDropbox = useCallback(() => {
    void startDropboxAuth();
  }, []);

  // Re-issue OAuth for the active cloud backend after an
  // `auth-error` status. Distinct from `handleConnectGdrive` /
  // `handleConnectDropbox`, which go through the
  // `pendingCloudLink` confirmation flow — that flow exists for
  // linking a fresh backend, not refreshing a token on a backend the
  // user is already on. Here both copies live in the same cloud, so
  // we just persist the new token and let `useUserDataStorage`
  // re-run its load on the rebuilt adapter.
  //
  // Throws on failure (popup blocked, user dismissed, network) so the
  // calling button / modal can show the message inline instead of
  // silently swallowing it.
  const handleReconnectCloud = useCallback(async (): Promise<void> => {
    if (auth.kind !== "signed-in") return;
    if (backend === "gdrive") {
      const userId = auth.user.id;
      log.info("reconnect(gdrive): launching GIS popup");
      const token = await startGdriveAuth();
      if (auth.kind !== "signed-in") return;
      setGdriveToken(userId, token);
      setGdriveTokenState(token);
      return;
    }
    if (backend === "dropbox") {
      // Dropbox uses URL-redirect OAuth; the existing flow handles
      // the return trip. The auto-refresh in `authedFetch` covers the
      // common case, so a Dropbox auth-error means the refresh token
      // is gone or revoked — a full redirect re-link is appropriate.
      // The promise resolves once the navigation has been kicked off
      // — the page unloads shortly after.
      await startDropboxAuth();
    }
  }, [auth, backend]);

  // Google Drive uses GIS token client — popup, not redirect — so the
  // probe-and-park-pendingCloudLink dance that Dropbox runs from the
  // URL-redirect handler happens inline here, awaiting the popup
  // result.
  //
  // Throws on OAuth failure (popup blocked, GIS script unreachable,
  // user dismissed) so the caller can surface the error inline. The
  // Settings storage tab catches and displays it next to the picker
  // — silently returning here meant the picker option flipped to
  // Google Drive but nothing visible happened, leaving the user
  // wondering whether the app got the click.
  const handleConnectGdrive = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    const userId = auth.user.id;
    const fromBackend = getBackend(userId);
    let token: string;
    try {
      log.info("oauth(gdrive): launching GIS popup");
      token = await startGdriveAuth();
    } catch (err) {
      log.error("oauth(gdrive): popup failed", err);
      throw err;
    }
    if (auth.kind !== "signed-in") {
      log.info("oauth(gdrive): aborted after token (signed out)");
      return;
    }
    log.info("oauth(gdrive): probing remote + source in parallel");
    const probe = createGdriveAdapter(token);
    const [remote, sourceText] = await Promise.all([
      probe.load().catch((err: unknown) => {
        log.error("oauth(gdrive): probe failed", err);
        return null;
      }),
      loadSourceText(userId, fromBackend),
    ]);
    if (auth.kind !== "signed-in") {
      log.info("oauth(gdrive): aborted after probe (signed out)");
      return;
    }
    log.info(
      `oauth(gdrive): probe done remoteHasBytes=${Boolean(remote)} sourceHasBytes=${Boolean(sourceText)} — opening confirmation`,
    );
    setPendingCloudLink({
      provider: "gdrive",
      accessToken: token,
      fromBackend,
      remoteSnapshot: remote,
      sourceText,
    });
  }, [auth, loadSourceText]);

  const handleSelectBrowser = useCallback(() => {
    if (auth.kind !== "signed-in") return;
    setBackend(auth.user.id, "browser");
    setBackendState("browser");
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
        log.error("dropbox disconnect: failed to mirror to local", err);
      }
    }
    clearDropboxToken(userId);
    clearDropboxRefreshToken(userId);
    setBackend(userId, "browser");
    // Dropping the cloud connection invalidates the cached cloud
    // bytes — leaving them around would let a future reconnect
    // surface a stale conflict against the new remote.
    clearCloudMirror(cloudMirrorKey(userId));
    setDropboxTokenState(null);
    dropboxRefreshTokenRef.current = null;
    setBackendState("browser");
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
        log.error("gdrive disconnect: failed to mirror to local", err);
      }
    }
    clearGdriveToken(userId);
    setBackend(userId, "browser");
    // Same as the Dropbox disconnect: drop the mirror so a future
    // reconnect doesn't trip over a stale local copy of the cloud.
    clearCloudMirror(cloudMirrorKey(userId));
    setGdriveTokenState(null);
    setBackendState("browser");
  }, [auth, gdriveToken, encryption]);

  // Restore the per-user folder handle from IndexedDB whenever the
  // signed-in user changes. We always reset `folderHandleLoaded` to
  // false up front so the `adapter` useMemo holds off on building a
  // browser-fallback adapter during the async probe — without that
  // gate, a folder-backed session would flash a fresh-budget render
  // on every reload.
  //
  // At boot we only `queryPermission` (no `requestPermission`) since
  // no user gesture is in scope. On "denied" / "prompt" we keep the
  // IDB record around so the Reconnect button in Settings can
  // re-grant in one click against the stored handle, and surface the
  // reconnect cue so the user knows their folder isn't live.
  useEffect(() => {
    if (auth.kind !== "signed-in") {
      setFolderHandle(null);
      setFolderHandleLoaded(true);
      setFolderReconnectNeeded(false);
      return;
    }
    const userId = auth.user.id;
    // Skip the probe when the user isn't on folder backend — the
    // adapter useMemo only consults `folderHandle` / `folderHandleLoaded`
    // when `backend === "folder"`, so probing IDB on every refresh for
    // every cloud / browser user just churns state and rebuilds the
    // adapter for nothing.
    if (getBackend(userId) !== "folder") {
      setFolderHandle(null);
      setFolderHandleLoaded(true);
      setFolderReconnectNeeded(false);
      return;
    }
    let cancelled = false;
    setFolderHandleLoaded(false);
    setFolderReconnectNeeded(false);
    void (async () => {
      const stored = await loadDirectoryHandle(userId);
      if (cancelled) return;
      if (!stored) {
        setFolderHandle(null);
        setFolderHandleLoaded(true);
        return;
      }
      const status = await ensurePermission(stored, "readwrite", false);
      if (cancelled) return;
      if (status === "granted") {
        setFolderHandle(stored);
        setFolderReconnectNeeded(false);
      } else {
        setFolderHandle(null);
        setFolderReconnectNeeded(true);
      }
      setFolderHandleLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  // Commit a freshly-picked folder as the active backend. Persists the
  // handle to IDB, mirrors any source-side bytes through the encrypting
  // wrapper if they need to land in the folder, then flips state.
  const commitFolderLink = useCallback(
    async (userId: string, handle: FileSystemDirectoryHandle) => {
      await saveDirectoryHandle(userId, handle);
      setBackend(userId, "folder");
      setFolderHandle(handle);
      setFolderHandleLoaded(true);
      setFolderReconnectNeeded(false);
      setBackendState("folder");
    },
    [],
  );

  // Pick a folder and probe both sides for an existing budget. Same
  // probe-and-confirm pattern as the cloud OAuth flow: if both the
  // folder and the current source already hold data, the dialog asks
  // the user which one to keep. Otherwise commits straight away.
  const handleConnectFolder = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    if (typeof window === "undefined" || !window.showDirectoryPicker) return;
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (err) {
      // AbortError = user cancelled the picker; nothing to do.
      if (err instanceof DOMException && err.name === "AbortError") return;
      log.error("folder picker failed", err);
      return;
    }
    const userId = auth.user.id;
    const fromBackend = getBackend(userId);
    const probeInner = createFolderAdapter({ directoryHandle: handle });
    const probe = wrapWithActiveEncryption(probeInner);
    const [remote, sourceText] = await Promise.all([
      probe.load().catch((err: unknown) => {
        log.error("folder probe failed during link", err);
        return null;
      }),
      loadSourceText(userId, fromBackend),
    ]);
    if (auth.kind !== "signed-in") return;
    if (remote === null && sourceText === null) {
      // Nothing on either side — just commit, no dialog needed.
      await commitFolderLink(userId, handle);
      return;
    }
    if (remote !== null && sourceText === null) {
      // Folder already has bytes, source is empty — adopt them silently
      // (matches the cloud-link "use cloud" branch with nothing to lose).
      await commitFolderLink(userId, handle);
      return;
    }
    if (remote === null && sourceText !== null) {
      // Folder is empty, source has bytes — push the source into the
      // folder before flipping so the folder's first read returns the
      // user's actual budget rather than nothing.
      try {
        await probe.save(sourceText);
      } catch (err) {
        log.error("folder seed failed during link", err);
      }
      await commitFolderLink(userId, handle);
      return;
    }
    // Both sides have data — ask the user which one wins.
    setPendingFolderLink({
      handle,
      fromBackend,
      remoteSnapshot: remote,
      sourceText,
    });
  }, [auth, commitFolderLink, loadSourceText, wrapWithActiveEncryption]);

  // Resolve the folder-link confirmation. Mirrors `resolveCloudLink`:
  // "use-source" pushes the parked source bytes into the folder
  // (threading the remote revision so the write lands as an update),
  // then commits; "use-cloud" — the folder's existing budget wins —
  // just commits.
  const resolveFolderLink = useCallback(
    async (action: "use-cloud" | "use-source"): Promise<void> => {
      const pending = pendingFolderLink;
      if (!pending || auth.kind !== "signed-in") return;
      setPendingFolderLink(null);
      const userId = auth.user.id;
      try {
        if (action === "use-source" && pending.sourceText !== null) {
          const probeInner = createFolderAdapter({
            directoryHandle: pending.handle,
          });
          const probe = wrapWithActiveEncryption(probeInner);
          await probe.save(
            pending.sourceText,
            pending.remoteSnapshot?.revision,
          );
        }
        await commitFolderLink(userId, pending.handle);
      } catch (err) {
        log.error("folder link failed", err);
      }
    },
    [auth, pendingFolderLink, commitFolderLink, wrapWithActiveEncryption],
  );

  const cancelFolderLink = useCallback(() => {
    setPendingFolderLink(null);
  }, []);

  // Re-grant permission against the already-stored handle. The
  // `requestPermission` call requires a user gesture, which is why
  // this lives in a click handler rather than the boot effect.
  const handleReconnectFolder = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    const userId = auth.user.id;
    const stored = await loadDirectoryHandle(userId);
    if (!stored) {
      // No stored handle to re-grant against — escalate to the full
      // picker flow instead.
      void handleConnectFolder();
      return;
    }
    const status = await ensurePermission(stored, "readwrite", true);
    if (status === "granted") {
      setFolderHandle(stored);
      setFolderReconnectNeeded(false);
    }
  }, [auth, handleConnectFolder]);

  // Mirror the folder's current bytes back into the browser backend
  // (same pattern as the Dropbox / GDrive disconnect), then clear the
  // handle from IDB and flip state. Best-effort: a stale browser copy
  // is a few-edit regression at worst, since `useUserDataStorage`
  // saves on debounce.
  const handleDisconnectFolder = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    const userId = auth.user.id;
    if (folderHandle) {
      try {
        const folderInner = createFolderAdapter({
          directoryHandle: folderHandle,
        });
        const folder =
          encryption === "plaintext"
            ? folderInner
            : withEncryption(folderInner, passwordRef);
        const snap = await folder.load();
        if (snap) {
          const browserInner = createLocalAdapter(userDataKey(userId));
          const browserAdapter =
            encryption === "plaintext"
              ? browserInner
              : withEncryption(browserInner, passwordRef);
          await browserAdapter.save(snap.text);
        }
      } catch (err) {
        log.error("folder disconnect: failed to mirror to browser", err);
      }
    }
    await clearDirectoryHandle(userId);
    setBackend(userId, "browser");
    setFolderHandle(null);
    setFolderReconnectNeeded(false);
    setBackendState("browser");
  }, [auth, folderHandle, encryption]);

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
        if (backend === "folder" && folderHandle)
          return createFolderAdapter({ directoryHandle: folderHandle });
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
        log.error("encryption toggle: failed to re-wrap bytes", err);
        return;
      }
      setEncryption(userId, next);
      setEncryptionState(next);
    },
    [auth, backend, dropboxToken, gdriveToken, folderHandle, encryption],
  );

  // Flip the per-user offline-mirror opt-in. Persisted to localStorage
  // and reflected in React state so the adapter `useMemo` above rebuilds
  // — turning the toggle off also drops the cached mirror bytes so the
  // user doesn't leave a stale copy behind on a shared device.
  const handleSetCloudOfflineMode = useCallback(
    (on: boolean) => {
      if (auth.kind !== "signed-in") return;
      const userId = auth.user.id;
      if (on) {
        log.info("cloud-offline: enabling for user");
        setCloudOfflineMode(userId, true);
      } else {
        log.info("cloud-offline: disabling for user — clearing mirror");
        clearCloudOfflineMode(userId);
        clearCloudMirror(cloudMirrorKey(userId));
      }
      setCloudOfflineModeState(on);
    },
    [auth],
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
    setBackendState("browser");
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
      // Mop up the per-user cloud mirror so a future account on the
      // same device can't accidentally resurrect this user's bytes
      // from a cached snapshot.
      clearCloudMirror(cloudMirrorKey(auth.user.id));
      clearCloudOfflineMode(auth.user.id);
      setUsers(remaining);
      persistRegistry(remaining, null);
      passwordRef.current = null;
      clearSession();
      setAuth({ kind: "signed-out", lastUsername: null });
    },
    [auth, users, persistRegistry],
  );

  if (auth.kind === "signed-out") {
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
  if (adapter === null) {
    // The adapter useMemo returns null while the folder handle is
    // being restored from IndexedDB. Show a quiet hold rather than
    // the AuthScreen — the user is signed in, just briefly waiting
    // on a permission probe that usually completes in milliseconds.
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-dvh items-center justify-center px-4 text-sm text-muted"
      >
        Restoring folder access…
      </div>
    );
  }

  // Real (non-guest) users on the device. Guest accounts never coexist
  // with real ones at steady state, but filtering keeps "Switch user"
  // honest mid-flow.
  const otherRealUsers = users.filter(
    (u) => !u.isDefault && u.id !== auth.user.id,
  );

  return (
    <>
      <BudgetView
        adapter={adapter}
        user={auth.user}
        password={auth.password}
        hasOtherUsers={otherRealUsers.length > 0}
        backend={backend}
        dropboxConnected={dropboxToken !== null}
        gdriveConnected={gdriveToken !== null}
        folderConnected={folderHandle !== null}
        folderAvailable={isFolderBackendAvailable()}
        folderReconnectNeeded={folderReconnectNeeded}
        encryption={encryption}
        cloudOfflineMode={cloudOfflineMode}
        getEncryptionPassword={() => passwordRef.current}
        currentDataRef={currentDataRef}
        onSignOut={handleSignOut}
        onSwitchUser={handleSwitchUser}
        onCreateAccount={handleStartCreateAccountFromMenu}
        onDeleteAccount={handleDeleteAccount}
        onConnectDropbox={handleConnectDropbox}
        onDisconnectDropbox={handleDisconnectDropbox}
        onConnectGdrive={handleConnectGdrive}
        onDisconnectGdrive={handleDisconnectGdrive}
        onReconnectCloud={handleReconnectCloud}
        onConnectFolder={handleConnectFolder}
        onReconnectFolder={handleReconnectFolder}
        onDisconnectFolder={handleDisconnectFolder}
        onSelectBrowser={handleSelectBrowser}
        onSetEncryption={handleSetEncryption}
        onSetCloudOfflineMode={handleSetCloudOfflineMode}
      />
      <CloudLinkDialog
        pending={pendingCloudLink}
        onResolve={resolveCloudLink}
        onCancel={cancelCloudLink}
      />
      <FolderLinkDialog
        pending={pendingFolderLink}
        onResolve={resolveFolderLink}
        onCancel={cancelFolderLink}
      />
    </>
  );
}

// Confirmation dialog after the user picks a directory. Mirrors
// `CloudLinkDialog`'s variant matrix but specialized to the folder
// flow: no provider branch since there's only one, no "your Dropbox"
// vs. "your Google Drive" wording, and the action labels reference
// "the folder" rather than a provider name.
function FolderLinkDialog({
  pending,
  onResolve,
  onCancel,
}: {
  pending: PendingFolderLink | null;
  onResolve: (action: "use-cloud" | "use-source") => void;
  onCancel: () => void;
}) {
  const t = useT();
  if (!pending) return null;
  const sourcePossessive =
    pending.fromBackend === "browser"
      ? t("cloudLink.sourceBrowser")
      : pending.fromBackend === "folder"
        ? t("cloudLink.sourceFolder")
        : pending.fromBackend === "dropbox"
          ? t("cloudLink.sourceDropbox")
          : t("cloudLink.sourceGdrive");
  const untouched =
    pending.fromBackend === "browser"
      ? t("cloudLink.untouchedBrowser")
      : pending.fromBackend === "folder"
        ? t("cloudLink.untouchedFolder")
        : pending.fromBackend === "dropbox"
          ? t("cloudLink.untouchedDropbox")
          : t("cloudLink.untouchedGdrive");
  // The only variant that surfaces here is "both sides have data" —
  // the connect handler short-circuits the other three cases
  // (commits straight away when one side is empty).
  return (
    <ConfirmDialog
      open
      title={t("cloudLink.folderAlreadyHas")}
      description={
        <>
          <p>{t("cloudLink.folderBothBody")}</p>
          <p className="mt-2 text-xs text-muted">
            {t("cloudLink.eitherWayKept", { untouched })}
          </p>
        </>
      }
      actions={[
        {
          label: t("cloudLink.useTheFolderVersion"),
          onSelect: () => onResolve("use-cloud"),
        },
        {
          label: t("cloudLink.replaceFolderWith", { source: sourcePossessive }),
          tone: "danger",
          onSelect: () => onResolve("use-source"),
        },
      ]}
      onCancel={onCancel}
    />
  );
}

// Surfaces the finished cloud link to the user. Always shows after a
// successful OAuth round-trip, so the switch is never silent — even
// the no-decision cases ("both sides empty, just confirm") get an
// explicit "Done" so the user knows the backend has flipped. When
// there is a choice to make — the source has data, the target has
// data, or both — the buttons spell out which side wins and which
// gets replaced. Wording shifts between "this device" and the source
// cloud name so a user migrating from one cloud backend to another
// sees an accurate prompt.
function CloudLinkDialog({
  pending,
  onResolve,
  onCancel,
}: {
  pending: PendingCloudLink | null;
  onResolve: (action: "use-cloud" | "use-source") => void;
  onCancel: () => void;
}) {
  const t = useT();
  if (!pending) return null;
  const targetName =
    pending.provider === "dropbox" ? "Dropbox" : "Google Drive";
  const sourcePossessive =
    pending.fromBackend === "browser"
      ? t("cloudLink.sourceBrowser")
      : pending.fromBackend === "folder"
        ? t("cloudLink.sourceLocalFolder")
        : pending.fromBackend === "dropbox"
          ? t("cloudLink.sourceDropbox")
          : t("cloudLink.sourceGdrive");
  const untouched =
    pending.fromBackend === "browser"
      ? t("cloudLink.untouchedBrowser")
      : pending.fromBackend === "folder"
        ? t("cloudLink.untouchedLocalFolder")
        : pending.fromBackend === "dropbox"
          ? t("cloudLink.untouchedDropbox")
          : t("cloudLink.untouchedGdrive");
  const hasSource = pending.sourceText !== null;
  const hasRemote = pending.remoteSnapshot !== null;

  // The dialog body shifts based on which sides hold a budget. Four
  // shapes total — kept inline so the variant matrix is visible at a
  // glance rather than scattered across helpers.
  if (hasSource && hasRemote) {
    return (
      <ConfirmDialog
        open
        title={t("cloudLink.cloudAlreadyHas", { name: targetName })}
        description={
          <>
            <p>{t("cloudLink.cloudBothBody", { name: targetName })}</p>
            <p className="mt-2 text-xs text-muted">
              {t("cloudLink.eitherWayKept", { untouched })}
            </p>
          </>
        }
        actions={[
          {
            label: t("cloudLink.useTheCloudVersion", { name: targetName }),
            onSelect: () => onResolve("use-cloud"),
          },
          {
            label: t("cloudLink.replaceCloudWith", {
              name: targetName,
              source: sourcePossessive,
            }),
            tone: "danger",
            onSelect: () => onResolve("use-source"),
          },
        ]}
        onCancel={onCancel}
      />
    );
  }
  if (hasSource && !hasRemote) {
    return (
      <ConfirmDialog
        open
        title={t("cloudLink.linkingCloud", { name: targetName })}
        description={
          <>
            <p>
              {t("cloudLink.emptyCloudBody", {
                name: targetName,
                source: sourcePossessive,
              })}
            </p>
            <p className="mt-2 text-xs text-muted">
              {t("cloudLink.untouchedKeptShort", { untouched })}
            </p>
          </>
        }
        actions={[
          {
            label: t("cloudLink.bringSourceOver", {
              source: sourcePossessive,
              name: targetName,
            }),
            onSelect: () => onResolve("use-source"),
          },
          {
            label: t("cloudLink.startFreshOn", { name: targetName }),
            onSelect: () => onResolve("use-cloud"),
          },
        ]}
        onCancel={onCancel}
      />
    );
  }
  if (!hasSource && hasRemote) {
    return (
      <ConfirmDialog
        open
        title={t("cloudLink.useExistingCloud", { name: targetName })}
        description={
          <p>{t("cloudLink.useExistingCloudBody", { name: targetName })}</p>
        }
        actions={[
          {
            label: t("cloudLink.switchTo", { name: targetName }),
            onSelect: () => onResolve("use-cloud"),
          },
        ]}
        onCancel={onCancel}
      />
    );
  }
  return (
    <ConfirmDialog
      open
      title={t("cloudLink.cloudLinked", { name: targetName })}
      description={
        <p>{t("cloudLink.cloudLinkedBody", { name: targetName })}</p>
      }
      actions={[
        {
          label: t("cloudLink.switchTo", { name: targetName }),
          onSelect: () => onResolve("use-cloud"),
        },
      ]}
      onCancel={onCancel}
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
  folderConnected: boolean;
  folderAvailable: boolean;
  folderReconnectNeeded: boolean;
  encryption: EncryptionMode;
  cloudOfflineMode: boolean;
  // Returns the active user's password — used by the export flow to
  // wrap downloaded files in the same envelope shape the storage
  // adapter uses.
  getEncryptionPassword: () => string | null;
  // App owns this ref and reads it from the cloud-link conflict path
  // when the user picks "replace with current budget"; BudgetView's
  // job is to keep it pointed at whatever `useUserDataStorage` is
  // showing on screen so the upload reflects the latest in-memory edits.
  currentDataRef: React.MutableRefObject<UserData | null>;
  onSignOut: () => void;
  onSwitchUser: () => void;
  onCreateAccount: () => void;
  onDeleteAccount: (password: string) => Promise<void>;
  onConnectDropbox: () => void;
  onDisconnectDropbox: () => void;
  onConnectGdrive: () => Promise<void>;
  onDisconnectGdrive: () => void;
  onReconnectCloud: () => Promise<void>;
  onConnectFolder: () => void;
  onReconnectFolder: () => void;
  onDisconnectFolder: () => void;
  onSelectBrowser: () => void;
  onSetEncryption: (mode: EncryptionMode) => void;
  onSetCloudOfflineMode: (on: boolean) => void;
};

function BudgetView({
  adapter,
  user,
  password,
  hasOtherUsers,
  backend,
  dropboxConnected,
  gdriveConnected,
  folderConnected,
  folderAvailable,
  folderReconnectNeeded,
  encryption,
  cloudOfflineMode,
  getEncryptionPassword,
  currentDataRef,
  onSignOut,
  onSwitchUser,
  onCreateAccount,
  onDeleteAccount,
  onConnectDropbox,
  onDisconnectDropbox,
  onConnectGdrive,
  onDisconnectGdrive,
  onReconnectCloud,
  onConnectFolder,
  onReconnectFolder,
  onDisconnectFolder,
  onSelectBrowser,
  onSetEncryption,
  onSetCloudOfflineMode,
}: BudgetViewProps) {
  const t = useT();
  const {
    data,
    dispatch,
    status,
    dirty,
    saveNow,
    resolveKeepLocal,
    resolveKeepRemote,
  } = useUserDataStorage(adapter, reducer, {
    beforeSerialize: userDataWithSavableRows,
  });
  // Mirror in-memory data into the App-owned ref so the cloud-link
  // conflict path can upload the latest budget. Updated on every render
  // because both data changes and ref-identity changes (after a sign-
  // out / sign-in round trip) need to land here.
  useEffect(() => {
    currentDataRef.current = data;
  }, [currentDataRef, data]);
  const [complexOpen, setComplexOpen] = useState(false);
  const [complexSeedDate, setComplexSeedDate] = useState("");
  // Pre-fill payload for the ComplexEntryModal. `null` keeps the modal's
  // existing blank-form behaviour for the budget add-row button; a
  // populated seed comes from the recurring-candidate promote flow.
  const [complexSeed, setComplexSeed] = useState<ComplexEntrySeed | null>(null);
  // Promote-flow context. When set, the ComplexEntryModal opens pre-
  // filled with the candidate's detected description / amount / cadence
  // and a submit dispatches `promoteRecurringCandidate` (instead of
  // `addRowsFromComplex`) so the candidate is consumed and the merchant
  // hint is recorded against the original bank text.
  const [recurringPromoteContext, setRecurringPromoteContext] =
    useState<RecurringPromoteContext | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<DeletePrompt | null>(null);
  const [editPrompt, setEditPrompt] = useState<EditPrompt | null>(null);
  // Generic row editor — opens on long-press or the pen action button.
  // Distinct from `editPrompt`, which drives `EditEntryModal` (the
  // recurring promote / series editor).
  const [editRowPrompt, setEditRowPrompt] = useState<EditRowPrompt | null>(
    null,
  );
  // Split-entry modal state. Opens when the scissors action button is
  // clicked. Cleared on save / cancel and self-clears when the row it
  // targets disappears (e.g. via an undo or a concurrent edit).
  const [splitPrompt, setSplitPrompt] = useState<SplitPrompt | null>(null);
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
  const [reconnectCloudOpen, setReconnectCloudOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [cloudReauthAutoOpen, setCloudReauthAutoOpenState] = useState(() =>
    getCloudReauthAutoOpen(),
  );
  const handleSetCloudReauthAutoOpen = useCallback((on: boolean) => {
    setCloudReauthAutoOpen(on);
    setCloudReauthAutoOpenState(on);
  }, []);
  // Auto-open the dedicated reconnect modal the moment a cloud
  // auth-error surfaces, so the user can reconnect without hunting
  // for the status pill. The `cloudReauthAutoOpen` device preference
  // flips this off for users who'd rather notice on their own.
  // Anchored on `status.kind` so it fires exactly once per error
  // transition — re-opens on every new auth-error, not on every
  // render while one sits there.
  useEffect(() => {
    if (status.kind !== "auth-error") return;
    if (!cloudReauthAutoOpen) return;
    setReconnectCloudOpen(true);
  }, [status.kind, cloudReauthAutoOpen]);
  // Once the storage hook moves out of `auth-error` (token refreshed,
  // user disconnected, backend swapped), drop the modal automatically
  // so it doesn't sit on top of the sheet after the user has solved
  // the problem somewhere else.
  useEffect(() => {
    if (status.kind !== "auth-error" && reconnectCloudOpen) {
      setReconnectCloudOpen(false);
    }
  }, [status.kind, reconnectCloudOpen]);
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
  // null = closed; otherwise the sheet queued for deletion. Rendered as a
  // ConfirmDialog on top of the SheetModal so the user has a chance to
  // back out before the dispatch fires.
  const [deleteSheetPrompt, setDeleteSheetPrompt] = useState<{
    sheetId: string;
    name: string;
  } | null>(null);
  // null = closed; { account: null } = create-account modal; otherwise edit.
  const [accountModal, setAccountModal] = useState<{
    account: Account | null;
  } | null>(null);
  // null = closed; otherwise the account queued for deletion. Rendered
  // as a ConfirmDialog on top of the AccountModal so an accidental tap
  // on the trash button doesn't wipe the account, its transactions, and
  // its history entries in one shot.
  const [deleteAccountPrompt, setDeleteAccountPrompt] = useState<{
    accountId: string;
    name: string;
  } | null>(null);
  // null = closed; otherwise the id of the account whose balance the
  // user is updating from the Accounts page. The modal looks the account
  // up by id each render so a concurrent rename / delete doesn't strand
  // a stale snapshot in component state.
  const [updateBalanceForId, setUpdateBalanceForId] = useState<string | null>(
    null,
  );
  // Account ids for the import-history and view-history modals.
  // Same null-or-id pattern as `updateBalanceForId` so a concurrent
  // delete / rename doesn't leave a stale snapshot in state.
  const [importHistoryForId, setImportHistoryForId] = useState<string | null>(
    null,
  );
  const [viewHistoryForId, setViewHistoryForId] = useState<string | null>(null);
  // Post-import reconciliation modal state. Null = closed. Populated
  // when an import produces candidate merges or orphans the user
  // should triage; cleared on apply / cancel.
  const [reconciliation, setReconciliation] =
    useState<ReconciliationState | null>(null);
  // null = closed; otherwise the id of the correction row queued for
  // deletion (set when the user clicks the divider line in the budget
  // view). The ConfirmDialog renders against this state to ask for
  // confirmation before dispatching `deleteRows`.
  const [correctionDeletePrompt, setCorrectionDeletePrompt] = useState<{
    sheetId: string;
    itemId: string;
    rowId: string;
    deltaText: string;
  } | null>(null);
  // null = closed; otherwise the request describes the mode (promote /
  // create / edit). The TransactionModal seeds itself from the request.
  const [transactionRequest, setTransactionRequest] =
    useState<TransactionModalRequest | null>(null);
  // null = closed; otherwise the history entry the user invoked the
  // pattern-rule modal from. Looked up by id each render so a
  // concurrent re-import / delete can't leave a stale entry snapshot
  // stranded in state; if the entry is gone the modal closes.
  const [matchRulePrompt, setMatchRulePrompt] = useState<{
    entryId: string;
  } | null>(null);
  // null = closed; otherwise the history entry the user invoked the
  // per-entry edit modal from (the pen button on a history row).
  // Resolved fresh each render so a concurrent re-import / delete
  // can't strand a stale snapshot in state.
  const [historyEditPrompt, setHistoryEditPrompt] = useState<{
    entryId: string;
  } | null>(null);
  // null = closed; otherwise the sheet the user is downloading. The
  // shape carries the resolved prefs so the modal can seed itself
  // from per-device defaults without re-reading localStorage.
  const [downloadPrompt, setDownloadPrompt] = useState<{
    sheetId: string;
    budgetPrefs: BudgetDownloadPrefs;
    accountsPrefs: AccountsDownloadPrefs;
  } | null>(null);

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

  // Usage count for each EntryType, summed across every budget in the
  // workspace. Feeds the TypePicker's "most used first" sort so the
  // dropdown floats popular labels to the top, like a country picker's
  // common-locales section. Walking every row on every render is cheap
  // because the workspace is small (a few thousand rows at most) and
  // `data` is referentially stable between edits.
  // Merged category / type lists exposed to every picker, renderer,
  // and resolver. Built-in `PRESET_CATEGORIES` / `PRESET_ENTRY_TYPES`
  // come first (minus the ones the user has hidden via Settings),
  // followed by the user-added entries on `data.categories` /
  // `data.types`. Computing them once here keeps the merge rules in
  // one place — pickers downstream stay unaware of the preset / user
  // split.
  const allCategoriesMerged = useMemo(() => allCategories(data), [data]);
  const allTypesMerged = useMemo(() => allTypes(data), [data]);

  const typeUsageById = useMemo<ReadonlyMap<string, number>>(() => {
    const map = new Map<string, number>();
    for (const sheet of data.sheets) {
      for (const item of sheet.items) {
        if (item.type !== "accountBudget") continue;
        for (const row of item.rows) {
          if (typeof row.typeId !== "string") continue;
          map.set(row.typeId, (map.get(row.typeId) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [data.sheets]);

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

  // Project the user's "Text size" preference onto the document root so
  // the body's `font-size: calc(... * var(--app-font-scale))` rule (and
  // every `rem`/`em` dimension downstream) picks up the multiplier.
  // Restored to the canonical 1 on sign-out so the auth screen always
  // renders at the default size.
  const fontScale = data.settings.fontScale;
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-font-scale",
      String(fontScale),
    );
    return () => {
      document.documentElement.style.removeProperty("--app-font-scale");
    };
  }, [fontScale]);

  // Theme / font / custom-theme — writes `data-theme`,
  // `--app-font-family`, and the inline colour / shape / motion vars
  // on `<html>` so the styles.css palette rules (and every Tailwind
  // utility resolved through `@theme inline`) follow the user's
  // Appearance picks. See src/hooks/useTheme.ts for the per-effect
  // contract.
  useTheme(data.settings);

  // Mirror the bucket's language preference into the plaintext
  // localStorage store and notify the top-level <LanguageProvider> in
  // main.tsx so the entire tree re-renders in the picked language.
  // The plaintext mirror lets the auth screen, the standalone routes,
  // and the loading shell start up in the right language before the
  // bucket loads (the bucket may be encrypted, so the canonical
  // setting isn't readable until after sign-in).
  const language = data.settings.language;
  useEffect(() => {
    writeLanguagePreference(language);
    document.documentElement.lang = bcp47(language);
    window.dispatchEvent(
      new CustomEvent<Lang>("budget:language", { detail: language }),
    );
  }, [language]);

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
      if (!col || (col.type !== "description" && col.type !== "amount")) {
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
  // Same guard for the generic edit-row modal: if the row vanishes
  // while the modal is open the user would be staring at a stale
  // snapshot, so close it.
  useEffect(() => {
    if (!editRowPrompt) return;
    const exists = activeItem.rows.some((r) => r.id === editRowPrompt.row.id);
    if (!exists) setEditRowPrompt(null);
  }, [editRowPrompt, activeItem.rows]);
  // Same guard for the split modal. History rows aren't in
  // `activeItem.rows` (they're synthesized from `UserData.history`), so
  // their existence is verified against the active account's history
  // entries instead.
  useEffect(() => {
    if (!splitPrompt) return;
    if (splitPrompt.row.historyEntryId) {
      const entries =
        (activeItem.accountId && data.history[activeItem.accountId]) || [];
      const exists = entries.some(
        (e) => e.id === splitPrompt.row.historyEntryId,
      );
      if (!exists) setSplitPrompt(null);
      return;
    }
    const exists = activeItem.rows.some((r) => r.id === splitPrompt.row.id);
    if (!exists) setSplitPrompt(null);
  }, [splitPrompt, activeItem.rows, activeItem.accountId, data.history]);
  const onAddRow = useCallback(
    (date: string) => dispatch({ type: "addRow", sheetId, itemId, date }),
    [dispatch, sheetId, itemId],
  );
  const onToggleRowTransfer = useCallback(
    (row: Row) =>
      dispatch({ type: "toggleRowTransfer", sheetId, itemId, rowId: row.id }),
    [dispatch, sheetId, itemId],
  );
  const onAddComplex = useCallback((date: string) => {
    setComplexSeedDate(date);
    setComplexSeed(null);
    setRecurringPromoteContext(null);
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
  const onEditRowRequest = useCallback((row: Row) => {
    // Synthesized rows (transaction / history) and balance-correction
    // rows have their own edit flows; the row component already
    // suppresses the long-press and the pen button on them, but guard
    // here too so a stray dispatch never opens the modal on a row it
    // can't meaningfully edit.
    if (row.transactionId || row.historyEntryId || row.isCorrection) return;
    setEditRowPrompt({ kind: "edit-row", row });
  }, []);
  const onSplitRequest = useCallback((row: Row) => {
    // Transactions have their own edit modal, correction rows are
    // display-only — splitting either of those is meaningless. History
    // rows are allowed: splitting a bank entry writes a `splits` array
    // on the underlying `HistoryEntry`, which the synthesizer fans out
    // into multiple rows on the next render.
    if (row.transactionId || row.isCorrection) return;
    setSplitPrompt({ kind: "split", row });
  }, []);
  const onMatchRuleRequest = useCallback((row: Row) => {
    // Only history rows render the button, but the prop type is the
    // generic Row shape so guard the marker explicitly.
    if (!row.historyEntryId) return;
    setMatchRulePrompt({ entryId: row.historyEntryId });
  }, []);
  const onEditHistoryRequest = useCallback((row: Row) => {
    if (!row.historyEntryId) return;
    setHistoryEditPrompt({ entryId: row.historyEntryId });
  }, []);
  const onUpdateHistoryEntry = useCallback(
    (
      accountId: string,
      entryId: string,
      patch: { userDescription?: string; userTypeId?: string | null },
    ) =>
      dispatch({
        type: "updateHistoryEntry",
        accountId,
        entryId,
        patch,
      }),
    [dispatch],
  );
  const onCorrectionDeleteRequest = useCallback(
    (row: Row) => {
      // Pre-format the signed delta so the prompt reads naturally even
      // after the row is gone (the dialog body keeps showing the text
      // until React unmounts it on close).
      const amountCol = findColumnByType(activeItem.columns, "amount");
      const amount =
        amountCol && typeof row.cells[amountCol.id] === "number"
          ? (row.cells[amountCol.id] as number)
          : 0;
      const sign = amount >= 0 ? "+" : "−";
      const deltaText = `${sign}${withCurrency(
        formatNumber(Math.abs(amount), data.settings),
        data.settings,
      )}`;
      setCorrectionDeletePrompt({
        sheetId,
        itemId: activeItem.id,
        rowId: row.id,
        deltaText,
      });
    },
    [activeItem, sheetId, data.settings],
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
  const onCreateCategory = useCallback(
    (draft: Omit<Category, "id">): Category => {
      const category: Category = { id: newId(), ...draft };
      dispatch({ type: "addCategory", category });
      return category;
    },
    [dispatch],
  );
  const onUpdateCategory = useCallback(
    (categoryId: string, patch: Partial<Omit<Category, "id">>) =>
      dispatch({ type: "updateCategory", categoryId, patch }),
    [dispatch],
  );
  const onDeleteCategory = useCallback(
    (categoryId: string) => dispatch({ type: "deleteCategory", categoryId }),
    [dispatch],
  );
  const onSetPresetCategoryHidden = useCallback(
    (presetId: string, hidden: boolean) =>
      dispatch({ type: "setPresetCategoryHidden", presetId, hidden }),
    [dispatch],
  );
  const onCreateType = useCallback(
    (draft: Omit<EntryType, "id">): EntryType => {
      const entryType: EntryType = { id: newId(), ...draft };
      dispatch({ type: "addType", entryType });
      return entryType;
    },
    [dispatch],
  );
  const onUpdateType = useCallback(
    (typeId: string, patch: Partial<Omit<EntryType, "id">>) =>
      dispatch({ type: "updateType", typeId, patch }),
    [dispatch],
  );
  const onDeleteType = useCallback(
    (typeId: string) => dispatch({ type: "deleteType", typeId }),
    [dispatch],
  );
  const onSetPresetTypeHidden = useCallback(
    (presetId: string, hidden: boolean) =>
      dispatch({ type: "setPresetTypeHidden", presetId, hidden }),
    [dispatch],
  );
  const onSaveSettings = useCallback(
    (settings: Settings) => dispatch({ type: "updateSettings", settings }),
    [dispatch],
  );

  // "What's new" popup gate. On the very first mount of the budget
  // view (per browser profile per user), the user's
  // `lastSeenChangelogVersion` is null — silently stamp the running
  // version so an existing user never sees release notes for software
  // they just installed. On subsequent mounts, open the modal only
  // when the persisted version is strictly older than APP_VERSION.
  // Effect intentionally runs once per mount; the closing handler
  // writes the running version back through the same `updateSettings`
  // action the rest of Settings uses, so the next mount won't re-open.
  const lastSeenChangelogVersion = data.settings.lastSeenChangelogVersion;
  const settingsRef = useRef(data.settings);
  useEffect(() => {
    settingsRef.current = data.settings;
  }, [data.settings]);
  useEffect(() => {
    if (lastSeenChangelogVersion === null) {
      dispatch({
        type: "updateSettings",
        settings: {
          ...settingsRef.current,
          lastSeenChangelogVersion: APP_VERSION,
        },
      });
      return;
    }
    if (cmpSemver(lastSeenChangelogVersion, APP_VERSION) < 0) {
      setChangelogOpen(true);
    }
    // Effect intentionally fires once per mount of the budget view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCloseChangelog = useCallback(() => {
    setChangelogOpen(false);
    dispatch({
      type: "updateSettings",
      settings: {
        ...settingsRef.current,
        lastSeenChangelogVersion: APP_VERSION,
      },
    });
  }, [dispatch]);

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
  const onOpenDownloadSheet = useCallback(
    (id: string) => {
      const target = data.sheets.find((s) => s.id === id);
      if (!target) return;
      setDownloadPrompt({
        sheetId: id,
        budgetPrefs: getBudgetDownloadPrefs(user.id),
        accountsPrefs: getAccountsDownloadPrefs(user.id),
      });
    },
    [data.sheets, user.id],
  );
  const onCloseDownload = useCallback(() => setDownloadPrompt(null), []);
  const onConfirmDownload = useCallback(
    (config: DownloadConfig) => {
      if (!downloadPrompt) return;
      const target = data.sheets.find((s) => s.id === downloadPrompt.sheetId);
      if (!target) {
        setDownloadPrompt(null);
        return;
      }
      const stamp = todayStamp();
      const baseSlug = slugifyFilename(target.name);
      if (config.kind === "budget") {
        const budgetItem = target.items.find(
          (it): it is AccountBudget => it.type === "accountBudget",
        );
        if (budgetItem) {
          const accountsById = new Map<string, string>();
          for (const a of data.accounts) accountsById.set(a.id, a.name);
          const opening = budgetItem.accountId
            ? (data.accounts.find((a) => a.id === budgetItem.accountId)
                ?.openingBalance ?? 0)
            : 0;
          const history = budgetItem.accountId
            ? (data.history[budgetItem.accountId] ?? [])
            : [];
          const rows = buildBudgetExportRows({
            item: budgetItem,
            openingBalance: opening,
            history,
            transactions: data.transactions,
            accountsById,
            types: allTypesMerged,
            categories: allCategoriesMerged,
            merchantHints: data.merchantHints,
            matchRules: data.matchRules,
            includeHistory: config.includeHistory,
            includeFuture: config.includeFuture,
          });
          const table = exportRowsToTable(rows, {
            date: t("sheet.date"),
            type: t("sheet.type"),
            category: t("sheet.category"),
            description: t("sheet.description"),
            amount: t("sheet.amount"),
            balance: t("sheet.balance"),
          });
          if (config.format === "csv") {
            const csv = rowsToCsv(table);
            triggerDownload(csv, `${baseSlug}-${stamp}.csv`, CSV_MIME_TYPE);
          } else {
            const bytes = buildXlsx([{ name: target.name, rows: table }]);
            triggerDownload(bytes, `${baseSlug}-${stamp}.xlsx`, XLSX_MIME_TYPE);
          }
          setBudgetDownloadPrefs(user.id, {
            format: config.format,
            includeHistory: config.includeHistory,
          });
        }
      } else {
        const payload = buildAccountsExport({
          accounts: data.accounts,
          transactions: data.transactions,
          selectedAccountIds: config.selectedAccountIds,
          accountInfo: config.accountInfo,
          includeTransactions: config.includeTransactions,
        });
        // The selected list only carries the accounts the user kept
        // ticked, but we still want to remember every account's per-
        // row decision so a re-open with a new account doesn't
        // forget the older toggles.
        const accountSelected: Record<string, boolean> = {};
        for (const a of data.accounts) {
          accountSelected[a.id] = config.selectedAccountIds.includes(a.id);
        }
        // The TransactionsExportEntry list (when present) is
        // gated per-account by `accountTransactions` — drop the
        // entries whose endpoints are toggled off so a per-account
        // exclude actually removes them from the JSON.
        if (payload.transactions) {
          const allowed = new Set<string>();
          for (const id of config.selectedAccountIds) {
            if (config.accountTransactions[id] ?? true) allowed.add(id);
          }
          payload.transactions = payload.transactions.filter(
            (tx) =>
              allowed.has(tx.fromAccountId) || allowed.has(tx.toAccountId),
          );
        }
        const text = serializeAccountsExport(payload);
        triggerDownload(text, `accounts-${stamp}.json`, JSON_MIME_TYPE);
        setAccountsDownloadPrefs(user.id, {
          accountInfo: config.accountInfo,
          accountTransactions: config.accountTransactions,
          accountSelected,
          includeTransactions: config.includeTransactions,
        });
      }
      setDownloadPrompt(null);
    },
    [
      downloadPrompt,
      data.sheets,
      data.accounts,
      data.transactions,
      data.history,
      data.merchantHints,
      data.matchRules,
      allTypesMerged,
      allCategoriesMerged,
      user.id,
      t,
    ],
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
    setDeleteSheetPrompt({
      sheetId: sheetModal.sheet.id,
      name: sheetModal.sheet.name,
    });
  }, [sheetModal]);
  const deleteSheetActions: ConfirmAction[] = useMemo(() => {
    if (!deleteSheetPrompt) return [];
    const target = deleteSheetPrompt;
    return [
      {
        label: t("app.deleteSheet"),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteSheet", sheetId: target.sheetId });
          setDeleteSheetPrompt(null);
          setSheetModal(null);
        },
      },
    ];
  }, [deleteSheetPrompt, dispatch, t]);

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
    setDeleteAccountPrompt({
      accountId: accountModal.account.id,
      name: accountModal.account.name,
    });
  }, [accountModal]);
  const deleteAccountActions: ConfirmAction[] = useMemo(() => {
    if (!deleteAccountPrompt) return [];
    const target = deleteAccountPrompt;
    return [
      {
        label: t("app.deleteAccount"),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteAccount", accountId: target.accountId });
          setDeleteAccountPrompt(null);
          setAccountModal(null);
        },
      },
    ];
  }, [deleteAccountPrompt, dispatch, t]);

  // Bank-history import / viewer flows. The Accounts page surfaces a
  // per-row Upload button (always enabled) and a History viewer
  // button (enabled when entries exist). Both are scoped to the
  // clicked account so the import flow never has to ask "which
  // account is this for?".
  const onOpenImportHistory = useCallback((accountId: string) => {
    setImportHistoryForId(accountId);
  }, []);
  const onOpenViewHistory = useCallback((accountId: string) => {
    setViewHistoryForId(accountId);
  }, []);
  const importHistoryAccount = useMemo(
    () =>
      importHistoryForId
        ? (data.accounts.find((a) => a.id === importHistoryForId) ?? null)
        : null,
    [importHistoryForId, data.accounts],
  );
  const viewHistoryAccount = useMemo(
    () =>
      viewHistoryForId
        ? (data.accounts.find((a) => a.id === viewHistoryForId) ?? null)
        : null,
    [viewHistoryForId, data.accounts],
  );
  const onConfirmImportHistory = useCallback(
    (parsed: ParsedBankFile, filename: string) => {
      if (!importHistoryAccount) return;
      const accountId = importHistoryAccount.id;
      const now = Date.now();
      // Snapshot pre-import state so we can compute the matcher view
      // against the same world the user just confirmed against.
      const preImportData = data;
      const existingHistory = preImportData.history[accountId] ?? [];
      const { merged, addedIds } = mergeHistory(
        existingHistory,
        parsed.entries,
        now,
      );
      const newEntries = merged.filter((e) => addedIds.has(e.id));

      // Walk every account-budget that tracks this account; the
      // matcher works per (rows, columns) tuple so each item runs
      // independently but contributes to the same candidate pool.
      const rowsForAccount: Array<{
        sheetId: string;
        itemId: string;
        rows: Row[];
        columns: Column[];
      }> = [];
      for (const sheet of preImportData.sheets) {
        for (const item of sheet.items) {
          if (item.type !== "accountBudget") continue;
          if (item.accountId !== accountId) continue;
          rowsForAccount.push({
            sheetId: sheet.id,
            itemId: item.id,
            rows: item.rows,
            columns: item.columns,
          });
        }
      }

      // Auto-rule-driven matches (mirrors the reducer's silent pass)
      // so we exclude those rows from the user-facing candidate set.
      const autoMatchedRowIds = new Set<string>();
      for (const { rows, columns } of rowsForAccount) {
        const auto = findRuleDrivenCandidates(
          preImportData.seriesMatchRules,
          newEntries,
          rows,
          columns,
        );
        for (const m of auto) autoMatchedRowIds.add(m.rowId);
      }

      // Coverage snapshot: months covered by history before vs.
      // after this import. Orphan detection scopes to the diff.
      const beforeCovered =
        rowsForAccount.length > 0
          ? coveredMonths(
              existingHistory,
              rowsForAccount.flatMap((r) => r.rows),
              rowsForAccount[0].columns,
            )
          : new Set<string>();
      // Apply silent auto-deletions before computing post-coverage
      // so the rule's actions don't accidentally suppress coverage.
      const afterRowsForAccount = rowsForAccount.map((r) => ({
        ...r,
        rows: r.rows.filter((row) => !autoMatchedRowIds.has(row.id)),
      }));
      const afterCovered =
        afterRowsForAccount.length > 0
          ? coveredMonths(
              merged,
              afterRowsForAccount.flatMap((r) => r.rows),
              afterRowsForAccount[0].columns,
            )
          : new Set<string>();
      const newlyCovered = coverageDelta(beforeCovered, afterCovered);

      const allCandidates: MatchCandidate[] = [];
      const allOrphans: OrphanRow[] = [];
      for (const { rows, columns } of afterRowsForAccount) {
        const candidates = findCandidates(newEntries, rows, columns).filter(
          (c) => !autoMatchedRowIds.has(c.rowId),
        );
        for (const c of candidates) allCandidates.push(c);
        const claimedIds = new Set(candidates.map((c) => c.rowId));
        const orphans = findOrphans(rows, columns, newlyCovered, claimedIds);
        for (const o of orphans) allOrphans.push(o);
      }

      dispatch({
        type: "importBankHistory",
        accountId,
        bankParserId: parsed.bankParserId,
        bankClearing: parsed.bankClearing,
        bankAccountNumber: parsed.bankAccountNumber,
        filename,
        entries: parsed.entries,
        now,
      });
      setImportHistoryForId(null);

      if (allCandidates.length > 0 || allOrphans.length > 0) {
        const paydayDay = detectPaydayDayOfMonth(
          preImportData,
          preImportData.settings.startOfMonth,
        );
        setReconciliation({
          accountId,
          preImportData,
          newEntries,
          candidates: allCandidates,
          orphans: allOrphans,
          paydayDay,
        });
      }
    },
    [data, dispatch, importHistoryAccount],
  );

  const onApplyReconciliation = useCallback(
    (decisions: ReconciliationApply) => {
      if (
        decisions.mergedRowIds.length === 0 &&
        decisions.seriesRules.length === 0 &&
        decisions.orphans.length === 0
      ) {
        setReconciliation(null);
        return;
      }
      dispatch({
        type: "applyReconciliation",
        mergedRowIds: decisions.mergedRowIds,
        seriesRules: decisions.seriesRules,
        orphans: decisions.orphans,
      });
      setReconciliation(null);
    },
    [dispatch],
  );

  // Balance-correction flow. The Accounts page surfaces a clickable
  // balance per account; clicking opens UpdateBalanceModal, which lets
  // the user assert a new balance and confirms a correction row will
  // be added on today's date.
  const onOpenUpdateBalance = useCallback((accountId: string) => {
    setUpdateBalanceForId(accountId);
  }, []);
  const updateBalanceAccount = useMemo(
    () =>
      updateBalanceForId
        ? (data.accounts.find((a) => a.id === updateBalanceForId) ?? null)
        : null,
    [updateBalanceForId, data.accounts],
  );
  const updateBalanceCurrent = useMemo(
    () =>
      updateBalanceAccount ? accountBalance(data, updateBalanceAccount.id) : 0,
    [data, updateBalanceAccount],
  );
  const updateBalanceHasBudget = useMemo(() => {
    if (!updateBalanceAccount) return false;
    return data.sheets.some((s) =>
      s.items.some(
        (it) =>
          it.type === "accountBudget" &&
          it.accountId === updateBalanceAccount.id,
      ),
    );
  }, [updateBalanceAccount, data.sheets]);
  const updateBalanceDate = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const onConfirmUpdateBalance = useCallback(
    (newBalance: number) => {
      if (!updateBalanceAccount) return;
      const delta = newBalance - updateBalanceCurrent;
      if (delta === 0) {
        setUpdateBalanceForId(null);
        return;
      }
      dispatch({
        type: "correctAccountBalance",
        accountId: updateBalanceAccount.id,
        date: updateBalanceDate,
        amount: delta,
      });
      setUpdateBalanceForId(null);
    },
    [dispatch, updateBalanceAccount, updateBalanceCurrent, updateBalanceDate],
  );

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
          typeId: tx.typeId ?? null,
          completed: tx.completed ?? false,
        });
        return;
      }
      const dateCol = findColumnByType(activeBudget.columns, "date");
      const descCol = findColumnByType(activeBudget.columns, "description");
      const amountCol = findColumnByType(activeBudget.columns, "amount");
      const rawDate = dateCol ? row.cells[dateCol.id] : null;
      const rawDesc = descCol ? row.cells[descCol.id] : null;
      const rawAmount = amountCol ? row.cells[amountCol.id] : null;
      const amount = typeof rawAmount === "number" ? rawAmount : 0;
      setTransactionRequest({
        kind: "promote",
        row,
        selfAccountId: activeBudget.accountId,
        seedDate: typeof rawDate === "string" ? rawDate : "",
        seedDescription: typeof rawDesc === "string" ? rawDesc : "",
        seedAmount: amount,
        outgoing: amount < 0,
        seedTypeId: row.typeId ?? null,
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
        typeId: tx.typeId ?? null,
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
        ...(draft.typeId !== null && { typeId: draft.typeId }),
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
        ...(draft.typeId !== null && { typeId: draft.typeId }),
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
          typeId: draft.typeId,
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
      if (recurringPromoteContext) {
        dispatch({
          type: "promoteRecurringCandidate",
          sheetId,
          itemId,
          key: recurringPromoteContext.key,
          sourceDescription: recurringPromoteContext.sourceDescription,
          description: draft.description,
          amount: draft.amount,
          typeId: draft.typeId,
          dates: draft.dates,
          now: Date.now(),
        });
      } else {
        dispatch({ type: "addRowsFromComplex", sheetId, itemId, draft });
      }
      setComplexOpen(false);
      setComplexSeed(null);
      setRecurringPromoteContext(null);
    },
    [dispatch, sheetId, itemId, recurringPromoteContext],
  );
  const onConvertToRecurring = useCallback(
    (rowId: string, futureDates: string[], typeId: string | null) => {
      dispatch({
        type: "convertToRecurring",
        sheetId,
        itemId,
        rowId,
        futureDates,
        typeId,
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
  const onSplitSubmit = useCallback(
    (rowId: string, splits: SplitSubmission[], remainderAmount: number) => {
      const row = splitPrompt?.row;
      if (!row) {
        setSplitPrompt(null);
        return;
      }
      if (row.historyEntryId && activeItem.accountId) {
        // History rows can't be replaced inline — the entry is the
        // bank's authoritative record and its amount must be preserved.
        // Fold any remainder into a final split that keeps the entry's
        // raw bank description so the on-screen presentation still
        // mirrors what the bank reported. The splits' signed amounts
        // sum exactly to `entry.amount` after this fold.
        const entries = data.history[activeItem.accountId] ?? [];
        const entry = entries.find((e) => e.id === row.historyEntryId);
        if (!entry) {
          setSplitPrompt(null);
          return;
        }
        const fullSplits: HistoryEntrySplit[] = splits.map((s) => ({
          description: s.description,
          amount: s.amount,
          typeId: s.typeId,
        }));
        if (remainderAmount !== 0) {
          fullSplits.push({
            description: entry.description,
            amount: remainderAmount,
            typeId: null,
          });
        }
        dispatch({
          type: "splitHistoryEntry",
          accountId: activeItem.accountId,
          entryId: row.historyEntryId,
          splits: fullSplits,
        });
        setSplitPrompt(null);
        return;
      }
      dispatch({
        type: "splitRow",
        sheetId,
        itemId,
        rowId,
        splits,
        remainderAmount,
      });
      setSplitPrompt(null);
    },
    [
      dispatch,
      sheetId,
      itemId,
      splitPrompt,
      activeItem.accountId,
      data.history,
    ],
  );
  // Drop a history entry's persisted split decomposition. The
  // reducer's `splitHistoryEntry` action treats an empty splits
  // array as "clear the field", so the synthesizer falls back to
  // rendering a single row for the bank entry on the next pass.
  // Only history rows can be reverted — regular row splits create
  // independent rows that no longer share an id linking them back
  // to the original.
  const onSplitRevert = useCallback(() => {
    const row = splitPrompt?.row;
    if (!row?.historyEntryId || !activeItem.accountId) {
      setSplitPrompt(null);
      return;
    }
    dispatch({
      type: "splitHistoryEntry",
      accountId: activeItem.accountId,
      entryId: row.historyEntryId,
      splits: [],
    });
    setSplitPrompt(null);
  }, [dispatch, splitPrompt, activeItem.accountId]);
  const onSaveEditRow = useCallback(
    (rowId: string, patch: EditRowPatch, scope: EditRowScope) => {
      // Description / amount / category / type are series-wide fields —
      // `editSeries` with a `just-this` scope is the same as a single-
      // row write, so the same dispatch covers both the one-off and
      // recurring cases uniformly. Date and completed are inherently
      // per-occurrence, so they always land on the anchor row via
      // `updateCell` regardless of scope.
      dispatch({
        type: "editSeries",
        sheetId,
        itemId,
        rowId,
        patch: {
          description: patch.description,
          amount: patch.amount,
          typeId: patch.typeId,
        },
        scope,
      });
      const dateCol = findColumnByType(activeItem.columns, "date");
      if (dateCol) {
        dispatch({
          type: "updateCell",
          sheetId,
          itemId,
          rowId,
          columnId: dateCol.id,
          value: patch.date,
        });
      }
      const completedCol = findColumnByType(activeItem.columns, "completed");
      if (completedCol) {
        dispatch({
          type: "updateCell",
          sheetId,
          itemId,
          rowId,
          columnId: completedCol.id,
          value: patch.completed,
        });
      }
      setEditRowPrompt(null);
    },
    [activeItem.columns, dispatch, sheetId, itemId],
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
  // Same defaulting for the generic edit-row modal's scope picker.
  const editRowLastSeriesDate = useMemo<string | null>(() => {
    const row = editRowPrompt?.row;
    if (!row?.seriesId || !dateCol) return null;
    const dates = activeItem.rows
      .filter((r) => r.seriesId === row.seriesId)
      .map((r) => r.cells[dateCol.id])
      .filter((d): d is string => typeof d === "string");
    return dates.length > 0 ? (dates.sort().at(-1) ?? null) : null;
  }, [editRowPrompt, activeItem.rows, dateCol]);

  // Look up the bank entry behind a history-row split prompt so the
  // modal can pre-fill any existing splits and use the entry's
  // authoritative amount instead of whatever individual split-row
  // amount is currently in the cells map.
  const splitHistoryEntry = useMemo<HistoryEntry | null>(() => {
    const row = splitPrompt?.row;
    if (!row?.historyEntryId || !activeItem.accountId) return null;
    const entries = data.history[activeItem.accountId] ?? [];
    return entries.find((e) => e.id === row.historyEntryId) ?? null;
  }, [splitPrompt, activeItem.accountId, data.history]);
  const splitInitialSplits = useMemo<SplitSubmission[] | undefined>(() => {
    if (!splitHistoryEntry?.splits || splitHistoryEntry.splits.length === 0) {
      return undefined;
    }
    return splitHistoryEntry.splits.map((s) => ({
      description: s.description,
      amount: s.amount,
      typeId: s.typeId ?? null,
    }));
  }, [splitHistoryEntry]);
  const splitAuthoritativeAmount = splitHistoryEntry?.amount;
  const splitAuthoritativeDescription = splitHistoryEntry?.description;

  // Resolve the seed entry for the pattern-rule modal from
  // `matchRulePrompt.entryId`. Looked up fresh each render so a
  // concurrent delete / re-import doesn't strand a stale snapshot.
  const matchRuleSeedEntry = useMemo<HistoryEntry | null>(() => {
    if (!matchRulePrompt) return null;
    const accountId = activeItem.accountId;
    if (!accountId) return null;
    const entries = data.history[accountId] ?? [];
    return entries.find((e) => e.id === matchRulePrompt.entryId) ?? null;
  }, [matchRulePrompt, activeItem.accountId, data.history]);

  // Every history entry on the active account, fed into the rule
  // modal's live preview so the user sees what their pattern matches
  // before they save it.
  const matchRuleAllEntries = useMemo<readonly HistoryEntry[]>(() => {
    const accountId = activeItem.accountId;
    if (!accountId) return [];
    return data.history[accountId] ?? [];
  }, [activeItem.accountId, data.history]);

  // Resolve the entry for the per-entry edit modal from
  // `historyEditPrompt.entryId`. Looked up fresh each render so a
  // concurrent delete / re-import doesn't strand a stale snapshot.
  const historyEditEntry = useMemo<HistoryEntry | null>(() => {
    if (!historyEditPrompt) return null;
    const accountId = activeItem.accountId;
    if (!accountId) return null;
    const entries = data.history[accountId] ?? [];
    return entries.find((e) => e.id === historyEditPrompt.entryId) ?? null;
  }, [historyEditPrompt, activeItem.accountId, data.history]);

  const onSubmitHistoryEdit = useCallback(
    (patch: {
      userDescription: string;
      userTypeId: string | null;
      isTransfer: boolean;
    }) => {
      const accountId = activeItem.accountId;
      if (!accountId || !historyEditPrompt) return;
      dispatch({
        type: "updateHistoryEntry",
        accountId,
        entryId: historyEditPrompt.entryId,
        patch,
      });
      setHistoryEditPrompt(null);
    },
    [dispatch, activeItem.accountId, historyEditPrompt],
  );

  const onSubmitMatchRule = useCallback(
    (draft: MatchRuleDraft) => {
      const rule: MatchRule = {
        id: newId(),
        pattern: draft.pattern,
      };
      if (draft.description) rule.description = draft.description;
      if (draft.typeId) rule.typeId = draft.typeId;
      if (draft.amountSign !== "any") rule.amountSign = draft.amountSign;
      if (draft.transferFilter !== "any")
        rule.transferFilter = draft.transferFilter;
      if (draft.amountMin !== undefined) rule.amountMin = draft.amountMin;
      if (draft.amountMax !== undefined) rule.amountMax = draft.amountMax;
      dispatch({ type: "createMatchRule", rule });
      setMatchRulePrompt(null);
    },
    [dispatch],
  );

  // Pre-fill values for the history-row promote modal. Looks the
  // active history entry up by id (the synthesized row carries only
  // the overlaid description), normalises its raw bank text, and
  // hands the matching merchant hint's labels back to the modal so a
  // returning user sees their last choices rather than blanks.
  const editHistoryHintPrefill = useMemo<HistoryPromotePrefill | null>(() => {
    const row = editPrompt?.row;
    if (!row?.historyEntryId) return null;
    const accountId = activeItem.accountId;
    if (!accountId) return null;
    const entries = data.history[accountId] ?? [];
    const entry = entries.find((e) => e.id === row.historyEntryId);
    if (!entry) return null;
    const key = normaliseDescription(entry.description);
    const hint = data.merchantHints[key];
    if (!hint) return null;
    return {
      description: hint.description ?? null,
      typeId: hint.typeId ?? null,
    };
  }, [editPrompt, activeItem.accountId, data.history, data.merchantHints]);

  // Bank-history entries on the active account that share the
  // promote-target row's normalised description. Surfaced in the
  // EditEntryModal so the user sees which past entries will adopt
  // the typed label / type via the merchant-hint overlay. Skipped
  // for history rows (their promote flow has its own backfill via
  // the merchant-hint key the modal already writes) and for series
  // rows (the modal is in edit-series mode, not promote).
  const editHistoryMatches = useMemo<HistoryMatchPreview[] | null>(() => {
    const row = editPrompt?.row;
    if (!row || row.historyEntryId || row.seriesId) return null;
    const accountId = activeItem.accountId;
    if (!accountId) return null;
    const descId = findColumnByType(activeItem.columns, "description")?.id;
    if (!descId) return null;
    const rawDesc = row.cells[descId];
    if (typeof rawDesc !== "string" || rawDesc.trim() === "") return null;
    const targetKey = normaliseDescription(rawDesc);
    if (targetKey.length < 3) return null;
    const entries = data.history[accountId] ?? [];
    const matches: HistoryMatchPreview[] = [];
    for (const e of entries) {
      if (e.hidden) continue;
      if (e.collapsedIntoTransactionId) continue;
      if (normaliseDescription(e.description) !== targetKey) continue;
      matches.push({
        id: e.id,
        date: e.date,
        description: e.description,
        amount: e.amount,
      });
    }
    matches.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return matches;
  }, [editPrompt, activeItem.accountId, activeItem.columns, data.history]);

  const deleteActions: ConfirmAction[] = useMemo(() => {
    if (!deletePrompt) return [];
    const row = deletePrompt.row;
    if (!row.seriesId || !dateCol) {
      return [
        {
          label: t("app.deleteThisRow"),
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
        label: t("app.justThisOne"),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteRows", sheetId, itemId, rowIds: [row.id] });
          setDeletePrompt(null);
        },
      },
      {
        label: t("app.thisAndAllFuture", { n: futureIds.length }),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteRows", sheetId, itemId, rowIds: futureIds });
          setDeletePrompt(null);
        },
      },
    ];
  }, [deletePrompt, activeItem.rows, dateCol, dispatch, sheetId, itemId, t]);

  const bulkDeleteActions: ConfirmAction[] = useMemo(() => {
    if (!bulkDeletePrompt) return [];
    const ids = bulkDeletePrompt.rowIds;
    return [
      {
        label:
          ids.length === 1
            ? t("app.deleteRowOne", { n: ids.length })
            : t("app.deleteRows", { n: ids.length }),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteRows", sheetId, itemId, rowIds: ids });
          setBulkDeletePrompt(null);
          onCancelSelect();
        },
      },
    ];
  }, [bulkDeletePrompt, dispatch, sheetId, itemId, onCancelSelect, t]);

  const correctionDeleteActions: ConfirmAction[] = useMemo(() => {
    if (!correctionDeletePrompt) return [];
    const target = correctionDeletePrompt;
    return [
      {
        label: t("app.removeCorrection"),
        tone: "danger",
        onSelect: () => {
          dispatch({
            type: "deleteRows",
            sheetId: target.sheetId,
            itemId: target.itemId,
            rowIds: [target.rowId],
          });
          setCorrectionDeletePrompt(null);
        },
      },
    ];
  }, [correctionDeletePrompt, dispatch, t]);

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

  // Recurring-candidate promote / dismiss. Promote opens the complex-
  // entry modal pre-seeded with the detected description, amount, and
  // cadence so the user can adjust before committing — submit then
  // dispatches `promoteRecurringCandidate`, which mints the series
  // rows, records a merchant hint against the candidate's bank text,
  // and consumes the candidate by adding its key to
  // `recurringDismissals` (so the panel drops it). Dismiss persists
  // the key directly without minting anything.
  const onPromoteRecurringCandidate = useCallback(
    (
      candidate: RecurringCandidate,
      rule: RecurrenceRule,
      _dates: string[],
      typeId: string | null,
    ) => {
      if (!activeBudget) return;
      const shifted = shiftRuleStartToFuture(rule, todayIso());
      setRecurringPromoteContext({
        key: candidate.key,
        sourceDescription: candidate.description,
      });
      setComplexSeedDate(shifted.kind === "once" ? shifted.date : todayIso());
      setComplexSeed({
        description: candidate.description,
        amount: candidate.suggestedAmount,
        typeId,
        rule: shifted,
      });
      setComplexOpen(true);
    },
    [activeBudget],
  );
  const onDismissRecurringCandidate = useCallback(
    (key: string) => {
      dispatch({ type: "dismissRecurringCandidate", key });
    },
    [dispatch],
  );
  const onDismissAllRecurringCandidates = useCallback(
    (keys: readonly string[]) => {
      dispatch({ type: "dismissRecurringCandidates", keys });
    },
    [dispatch],
  );

  // Promote a single history entry the user clicked on into a real
  // recurring series. Routes through the same future-row minting as
  // the recurring-candidate panel but also stamps the merchant hint
  // with the user-typed description and typeId so past entries
  // sharing the merchant key adopt the label on the next render.
  const onPromoteHistory = useCallback(
    (
      historyEntryId: string,
      sourceDescription: string,
      promotion: {
        description: string;
        amount: number;
        typeId: string | null;
        dates: string[];
      },
    ) => {
      if (!activeBudget) return;
      if (promotion.dates.length === 0) return;
      dispatch({
        type: "promoteHistoryToRecurring",
        sheetId,
        itemId: activeBudget.id,
        sourceDescription,
        description: promotion.description,
        amount: promotion.amount,
        typeId: promotion.typeId,
        dates: promotion.dates,
        now: Date.now(),
      });
      setEditPrompt(null);
      // Silences the unused parameter warning while keeping the id in
      // the API surface for future use (e.g. selectively hiding the
      // source row or recording the promotion against its id).
      void historyEntryId;
    },
    [dispatch, sheetId, activeBudget],
  );

  // Transfer-collapse modal handlers. Open is driven by the user
  // (a button on the Accounts page) and auto-opens after an import
  // when new candidates are detected — see the effect below.
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  // Snapshot of the candidate count at the previous import so the
  // auto-open trigger only fires when a fresh import actually
  // introduced new pairs (not every render, not after a dismissal).
  const previousImportCountRef = useRef<number>(
    Object.values(data.historyImports).reduce(
      (acc, list) => acc + list.length,
      0,
    ),
  );
  useEffect(() => {
    const totalImports = Object.values(data.historyImports).reduce(
      (acc, list) => acc + list.length,
      0,
    );
    if (totalImports <= previousImportCountRef.current) {
      previousImportCountRef.current = totalImports;
      return;
    }
    previousImportCountRef.current = totalImports;
    const dismissed = new Set(data.transferCollapseDismissals);
    const candidates = detectTransferCandidates({
      history: data.history,
      dismissedPairKeys: dismissed,
    });
    if (candidates.length > 0) setTransferModalOpen(true);
  }, [data.historyImports, data.history, data.transferCollapseDismissals]);
  const onCollapseTransferPair = useCallback(
    (candidate: TransferCandidate) => {
      dispatch({
        type: "collapseTransferPair",
        fromAccountId: candidate.fromAccountId,
        toAccountId: candidate.toAccountId,
        fromEntryId: candidate.fromEntry.id,
        toEntryId: candidate.toEntry.id,
        date: candidate.date,
        description: candidate.fromEntry.description,
        amount: candidate.amount,
      });
    },
    [dispatch],
  );
  const onDismissTransferPair = useCallback(
    (pairKey: string) => {
      dispatch({ type: "dismissTransferPair", pairKey });
    },
    [dispatch],
  );
  const onOpenTransferCollapse = useCallback(() => {
    setTransferModalOpen(true);
  }, []);

  // Settings clear-all handlers for the merchant-hint memory and the
  // two dismissal allowlists. Each dispatches a single action; the
  // reducer no-ops when the collection is already empty.
  const onClearMerchantHints = useCallback(
    () => dispatch({ type: "clearMerchantHints" }),
    [dispatch],
  );
  const onClearRecurringDismissals = useCallback(
    () => dispatch({ type: "clearRecurringDismissals" }),
    [dispatch],
  );
  const onClearTransferDismissals = useCallback(
    () => dispatch({ type: "clearTransferDismissals" }),
    [dispatch],
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
    // No outer bottom padding: iOS 26 Safari's Liquid Glass address bar
    // is translucent and samples page pixels for its tint, so the sheet
    // is allowed to extend behind it. `<main>` owns the bottom padding
    // — large enough that the AddRowButton at the foot of the last
    // month clears both the safe-area band and the floating SheetTabs
    // pill instead of ending its scroll under either.
    <div className="mx-auto flex min-h-dvh max-w-full flex-col px-1 md:px-5">
      {/* `data-modal-background` is the toggle target for the modal
          lifecycle hook in src/utils/scroll-lock.ts — any open modal
          flips `inert` on every match, freezing focus and pointer
          events on the chrome behind the backdrop. `display: contents`
          keeps the flex column layout unchanged. */}
      <div className="contents" data-modal-background>
        <header className="sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-page-bg px-2 pt-3 pb-3 md:mb-6 md:gap-x-4 md:gap-y-3 md:px-0 md:pt-4 md:pb-4">
          <button
            type="button"
            onClick={onScrollToToday}
            aria-label={t("app.scrollToToday")}
            title={t("app.scrollToToday")}
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
            <span className="text-base font-bold tracking-wide text-fg-bright">
              budget
            </span>
          </button>
          <div className="ml-auto inline-flex items-center gap-2">
            {backend === "dropbox" || backend === "gdrive" ? (
              <SyncStatus
                providerName={
                  backend === "dropbox" ? "Dropbox" : "Google Drive"
                }
                status={status}
                dirty={dirty}
                onSave={saveNow}
                onOpenDetails={() => setSyncDetailsOpen(true)}
              />
            ) : (
              <SaveStateButton
                dirty={dirty}
                saving={status.kind === "saving"}
                onSave={saveNow}
              />
            )}
            <button
              type="button"
              onClick={onToggleSelectMode}
              aria-pressed={selectMode}
              aria-label={
                selectMode ? t("app.exitSelectMode") : t("app.selectRows")
              }
              title={selectMode ? t("app.cancelShort") : t("app.selectShort")}
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
              aria-label={t("app.openSettings")}
              title={t("app.settings")}
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
        <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-[calc(5rem+env(safe-area-inset-bottom))]">
          {status.kind === "loading" ? (
            <BudgetLoading />
          ) : activeSheet.type === "accounts" ? (
            <AccountsSheetView
              sheet={activeSheet}
              data={data}
              settings={data.settings}
              onCreateAccount={onOpenCreateAccount}
              onEditAccount={onOpenEditAccount}
              onUpdateBalance={onOpenUpdateBalance}
              onCreateTransaction={onOpenCreateTransaction}
              onEditTransaction={onOpenEditTransaction}
              onImportHistory={onOpenImportHistory}
              onViewHistory={onOpenViewHistory}
              onFindTransfers={onOpenTransferCollapse}
              onEditSheet={onOpenEditSheet}
              onDownloadSheet={onOpenDownloadSheet}
            />
          ) : (
            <>
              <RecurringCandidatesPanel
                history={
                  activeItem.accountId
                    ? (data.history[activeItem.accountId] ?? [])
                    : []
                }
                dismissedKeys={data.recurringDismissals}
                merchantHints={data.merchantHints}
                types={allTypesMerged}
                settings={data.settings}
                onPromote={onPromoteRecurringCandidate}
                onDismiss={onDismissRecurringCandidate}
                onDismissAll={onDismissAllRecurringCandidates}
              />
              <SheetView
                sheet={activeSheet}
                item={activeItem}
                data={data}
                types={allTypesMerged}
                categories={allCategoriesMerged}
                typeUsageById={typeUsageById}
                onCreateType={onCreateType}
                accounts={data.accounts}
                transactions={data.transactions}
                history={
                  activeItem.accountId
                    ? (data.history[activeItem.accountId] ?? [])
                    : []
                }
                merchantHints={data.merchantHints}
                matchRules={data.matchRules}
                openingBalance={
                  activeItem.accountId
                    ? (data.accounts.find((a) => a.id === activeItem.accountId)
                        ?.openingBalance ?? 0)
                    : 0
                }
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
                onEditRowRequest={onEditRowRequest}
                onSplitRequest={onSplitRequest}
                onTransactionRequest={onTransactionRequest}
                onToggleRowTransfer={onToggleRowTransfer}
                onMatchRuleRequest={onMatchRuleRequest}
                onEditHistoryRequest={onEditHistoryRequest}
                onUpdateHistoryEntry={onUpdateHistoryEntry}
                onCorrectionDeleteRequest={onCorrectionDeleteRequest}
                onReorderColumns={onReorderColumns}
                onToggleSelect={onToggleSelect}
                onToggleSelectMonth={onToggleSelectMonth}
                onEditSheet={onOpenEditSheet}
                onDownloadSheet={onOpenDownloadSheet}
              />
            </>
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
      </div>
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
      {downloadPrompt !== null &&
        (() => {
          const target = data.sheets.find(
            (s) => s.id === downloadPrompt.sheetId,
          );
          if (!target) return null;
          if (target.type === "accounts") {
            return (
              <DownloadModal
                open
                kind="accounts"
                accounts={data.accounts}
                initial={downloadPrompt.accountsPrefs}
                onClose={onCloseDownload}
                onSubmit={onConfirmDownload}
              />
            );
          }
          const budgetItem = target.items.find(
            (it): it is AccountBudget => it.type === "accountBudget",
          );
          const accountId = budgetItem?.accountId ?? null;
          const hasHistory = accountId
            ? (data.history[accountId]?.length ?? 0) > 0
            : false;
          return (
            <DownloadModal
              open
              kind="budget"
              initial={downloadPrompt.budgetPrefs}
              hasHistory={hasHistory}
              sheetName={target.name}
              onClose={onCloseDownload}
              onSubmit={onConfirmDownload}
            />
          );
        })()}
      <AccountModal
        open={accountModal !== null}
        account={accountModal?.account ?? null}
        onClose={() => setAccountModal(null)}
        onSave={onSaveAccount}
        onDelete={onDeleteFinancialAccount}
      />
      <UpdateBalanceModal
        open={updateBalanceAccount !== null}
        account={updateBalanceAccount}
        currentBalance={updateBalanceCurrent}
        settings={data.settings}
        date={updateBalanceDate}
        canRecord={updateBalanceHasBudget}
        onConfirm={onConfirmUpdateBalance}
        onCancel={() => setUpdateBalanceForId(null)}
      />
      <ImportHistoryModal
        open={importHistoryAccount !== null}
        account={importHistoryAccount}
        existing={
          importHistoryAccount
            ? (data.history[importHistoryAccount.id] ?? [])
            : []
        }
        settings={data.settings}
        onCancel={() => setImportHistoryForId(null)}
        onConfirm={onConfirmImportHistory}
      />
      <ReconciliationModal
        open={reconciliation !== null}
        onClose={() => setReconciliation(null)}
        onApply={onApplyReconciliation}
        accountId={reconciliation?.accountId ?? ""}
        preImportData={reconciliation?.preImportData ?? data}
        newEntries={reconciliation?.newEntries ?? []}
        candidates={reconciliation?.candidates ?? []}
        orphans={reconciliation?.orphans ?? []}
        paydayDay={reconciliation?.paydayDay ?? data.settings.startOfMonth}
        settings={data.settings}
      />
      <HistoryModal
        open={viewHistoryAccount !== null}
        account={viewHistoryAccount}
        entries={
          viewHistoryAccount ? (data.history[viewHistoryAccount.id] ?? []) : []
        }
        imports={
          viewHistoryAccount
            ? (data.historyImports[viewHistoryAccount.id] ?? [])
            : []
        }
        settings={data.settings}
        onCancel={() => setViewHistoryForId(null)}
      />
      <TransferCollapseModal
        open={transferModalOpen}
        history={data.history}
        accounts={data.accounts}
        dismissedPairKeys={data.transferCollapseDismissals}
        settings={data.settings}
        onClose={() => setTransferModalOpen(false)}
        onCollapse={onCollapseTransferPair}
        onDismiss={onDismissTransferPair}
      />
      <TransactionModal
        open={transactionRequest !== null}
        request={transactionRequest}
        accounts={data.accounts}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        onClose={() => setTransactionRequest(null)}
        onPromote={onPromoteTransaction}
        onCreate={onCreateTransaction}
        onEdit={onEditTransactionSave}
        onDelete={onDeleteTransactionFromModal}
        onCreateType={onCreateType}
      />
      <ComplexEntryModal
        open={complexOpen}
        initialDate={complexSeedDate}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        sheets={data.sheets}
        currentSheetId={activeSheet.id}
        seed={complexSeed}
        title={
          recurringPromoteContext ? t("complex.promoteCandidate") : undefined
        }
        submitVerb={
          recurringPromoteContext ? t("complex.promoteVerb") : undefined
        }
        onClose={() => {
          setComplexOpen(false);
          setComplexSeed(null);
          setRecurringPromoteContext(null);
        }}
        onCreate={onComplexSubmit}
        onCreateType={onCreateType}
      />
      <EditEntryModal
        open={editPrompt !== null}
        row={editPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        lastSeriesDate={editLastSeriesDate}
        historyHintPrefill={editHistoryHintPrefill}
        historyMatches={editHistoryMatches ?? undefined}
        onClose={() => setEditPrompt(null)}
        onConvertToRecurring={onConvertToRecurring}
        onEditSeries={onEditSeries}
        onPromoteHistory={onPromoteHistory}
        onCreateType={onCreateType}
      />
      <EditRowModal
        open={editRowPrompt !== null}
        row={editRowPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        lastSeriesDate={editRowLastSeriesDate}
        onClose={() => setEditRowPrompt(null)}
        onSave={onSaveEditRow}
        onCreateType={onCreateType}
      />
      <SplitEntryModal
        open={splitPrompt !== null}
        row={splitPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        initialSplits={splitInitialSplits}
        authoritativeAmount={splitAuthoritativeAmount}
        authoritativeDescription={splitAuthoritativeDescription}
        onClose={() => setSplitPrompt(null)}
        onSplit={onSplitSubmit}
        onRevert={onSplitRevert}
        onCreateType={onCreateType}
      />
      <MatchRuleModal
        open={matchRulePrompt !== null && matchRuleSeedEntry !== null}
        seedEntry={matchRuleSeedEntry}
        allEntries={matchRuleAllEntries}
        existing={null}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        onClose={() => setMatchRulePrompt(null)}
        onSubmit={onSubmitMatchRule}
        onCreateType={onCreateType}
      />
      <HistoryEntryEditModal
        open={historyEditPrompt !== null && historyEditEntry !== null}
        entry={historyEditEntry}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        onClose={() => setHistoryEditPrompt(null)}
        onSubmit={onSubmitHistoryEdit}
        onCreateType={onCreateType}
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
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        onClose={() => setBulkEditOpen(false)}
        onApplyPatch={onApplyBulkPatch}
        onApplyRecurring={onApplyBulkRecurring}
        onCreateType={onCreateType}
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
          deletePrompt?.row.seriesId
            ? t("confirm.deleteRecurring")
            : t("confirm.deleteRow")
        }
        description={
          deletePrompt?.row.seriesId
            ? t("confirm.deleteRecurringHint")
            : t("confirm.deleteRowHint")
        }
        actions={deleteActions}
        onCancel={() => setDeletePrompt(null)}
      />
      <ConfirmDialog
        open={bulkDeletePrompt !== null}
        title={t("app.deleteSelected")}
        description={
          (bulkDeletePrompt?.rowIds.length ?? 0) === 1
            ? t("confirm.deleteSelectedHintOne", {
                n: bulkDeletePrompt?.rowIds.length ?? 0,
              })
            : t("confirm.deleteSelectedHintOther", {
                n: bulkDeletePrompt?.rowIds.length ?? 0,
              })
        }
        actions={bulkDeleteActions}
        onCancel={() => setBulkDeletePrompt(null)}
      />
      <ConfirmDialog
        open={deleteSheetPrompt !== null}
        title={t("app.deleteSheet")}
        description={
          deleteSheetPrompt
            ? t("confirm.deleteSheetHint", { name: deleteSheetPrompt.name })
            : null
        }
        actions={deleteSheetActions}
        onCancel={() => setDeleteSheetPrompt(null)}
      />
      <ConfirmDialog
        open={deleteAccountPrompt !== null}
        title={t("app.deleteAccount")}
        description={
          deleteAccountPrompt
            ? t("confirm.deleteAccountHint", { name: deleteAccountPrompt.name })
            : null
        }
        actions={deleteAccountActions}
        onCancel={() => setDeleteAccountPrompt(null)}
      />
      <ConfirmDialog
        open={correctionDeletePrompt !== null}
        title={t("app.removeBalanceCorrection")}
        description={
          correctionDeletePrompt
            ? t("confirm.correctionRemoveHint", {
                delta: correctionDeletePrompt.deltaText,
              })
            : ""
        }
        actions={correctionDeleteActions}
        onCancel={() => setCorrectionDeletePrompt(null)}
      />
      <SyncDetailsModal
        open={syncDetailsOpen}
        backend={backend}
        status={status}
        dirty={dirty}
        onSaveNow={saveNow}
        onReconnect={
          backend === "dropbox" || backend === "gdrive"
            ? onReconnectCloud
            : null
        }
        onClose={() => setSyncDetailsOpen(false)}
      />
      <ReconnectCloudModal
        open={reconnectCloudOpen}
        backend={backend}
        onConfirm={onReconnectCloud}
        onClose={() => setReconnectCloudOpen(false)}
      />
      <ConflictResolutionModal
        open={status.kind === "conflict"}
        providerName={
          backend === "dropbox"
            ? "Dropbox"
            : backend === "gdrive"
              ? "Google Drive"
              : t("settings.storage.cloudConnect")
        }
        local={status.kind === "conflict" ? status.local : data}
        remote={status.kind === "conflict" ? status.remote : data}
        onKeepLocal={resolveKeepLocal}
        onKeepRemote={resolveKeepRemote}
      />
      <SettingsModal
        open={settingsOpen}
        settings={data.settings}
        backend={backend}
        dropboxConnected={dropboxConnected}
        gdriveConnected={gdriveConnected}
        folderConnected={folderConnected}
        folderAvailable={folderAvailable}
        folderReconnectNeeded={folderReconnectNeeded}
        encryption={encryption}
        cloudOfflineMode={cloudOfflineMode}
        isGuest={isGuest}
        merchantHintCount={Object.keys(data.merchantHints).length}
        recurringDismissalCount={data.recurringDismissals.length}
        transferDismissalCount={data.transferCollapseDismissals.length}
        data={data}
        onImport={onImport}
        adapter={adapter}
        getEncryptionPassword={getEncryptionPassword}
        onClose={() => setSettingsOpen(false)}
        onSave={onSaveSettings}
        onConnectDropbox={onConnectDropbox}
        onDisconnectDropbox={onDisconnectDropbox}
        onConnectGdrive={onConnectGdrive}
        onDisconnectGdrive={onDisconnectGdrive}
        onConnectFolder={onConnectFolder}
        onReconnectFolder={onReconnectFolder}
        onDisconnectFolder={onDisconnectFolder}
        onSelectBrowser={onSelectBrowser}
        onSetEncryption={onSetEncryption}
        onSetCloudOfflineMode={onSetCloudOfflineMode}
        cloudReauthAutoOpen={cloudReauthAutoOpen}
        onSetCloudReauthAutoOpen={handleSetCloudReauthAutoOpen}
        onClearMerchantHints={onClearMerchantHints}
        onClearRecurringDismissals={onClearRecurringDismissals}
        onClearTransferDismissals={onClearTransferDismissals}
        onCreateCategory={onCreateCategory}
        onUpdateCategory={onUpdateCategory}
        onDeleteCategory={onDeleteCategory}
        onSetPresetCategoryHidden={onSetPresetCategoryHidden}
        onCreateType={onCreateType}
        onUpdateType={onUpdateType}
        onDeleteType={onDeleteType}
        onSetPresetTypeHidden={onSetPresetTypeHidden}
      />
      <ChangelogModal
        open={changelogOpen}
        onClose={onCloseChangelog}
        since={lastSeenChangelogVersion}
      />
      <ConfirmDialog
        open={warningSecondsLeft !== null}
        title={t("app.aboutToSignOut")}
        description={
          warningSecondsLeft !== null
            ? warningSecondsLeft === 1
              ? t("confirm.signOutWarningOne", { n: warningSecondsLeft })
              : t("confirm.signOutWarningOther", { n: warningSecondsLeft })
            : null
        }
        actions={[{ label: t("confirm.stayActive"), onSelect: onStaySignedIn }]}
        hideCancel
        onCancel={onStaySignedIn}
      />
    </div>
  );
}
