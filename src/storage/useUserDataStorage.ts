import {
  type Dispatch,
  type Reducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { UserData } from "../data/types";
import { createLogger } from "../utils/logger";
import {
  AuthError,
  ConflictError,
  type Snapshot,
  type StorageAdapter,
} from "./adapter";
import { serializeUserData } from "./file";
import { freshUserData, readUserDataFromText } from "./local";

const log = createLogger("storage-hook");

// Orchestrates a `StorageAdapter` against a React reducer. The
// reducer keeps its existing shape — pure `(state, action) => state`
// — and this hook owns the side-effects: initial load, debounced
// save, conflict surfacing, and (when the adapter supports it)
// reaction to remote changes pushed by other devices.

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "conflict"; remote: UserData }
  | { kind: "error"; message: string }
  // The cloud backend rejected the request with a 401 after any silent
  // refresh has already been tried. The UI shows a Reconnect button
  // instead of a Try-again that would fail the same way.
  | { kind: "auth-error"; message: string };

export type UserDataStorageOptions = {
  // Pre-serialize transform applied to the in-memory state before the
  // auto-save effect writes it. Used to strip transient state (e.g.
  // half-filled rows) so storage always reflects a clean snapshot.
  // `saveNow` deliberately bypasses this — a user clicking the save
  // button is asking for the in-memory state as-is.
  beforeSerialize?: (data: UserData) => UserData;
};

export type UserDataStorage<Action> = {
  data: UserData;
  dispatch: Dispatch<Action>;
  status: SaveStatus;
  // True when the in-memory state differs from the last bytes written
  // to storage. With a `beforeSerialize` filter active, this also
  // captures rows the auto-save deliberately omits (e.g. half-filled
  // rows), so callers can prompt before unload and light up an
  // explicit-save affordance.
  dirty: boolean;
  // Save the current in-memory state as-is — skipping any
  // `beforeSerialize` filter and the debounce timer.
  saveNow: () => void;
};

export function useUserDataStorage<Action>(
  adapter: StorageAdapter,
  reducer: Reducer<UserData, Action>,
  { beforeSerialize }: UserDataStorageOptions = {},
): UserDataStorage<Action> {
  // Synchronous fast path: if the adapter can hand back data before
  // the first paint (localStorage can; cloud cannot), seed the
  // reducer with the real state right away. Otherwise we start
  // empty and the async load below replaces it.
  const initial = useState<{ data: UserData; status: SaveStatus }>(() => {
    const snap = adapter.loadSync?.() ?? null;
    if (snap) {
      return {
        data: readUserDataFromText(snap.text),
        status: { kind: "idle" },
      };
    }
    return {
      data: freshUserData(),
      status: adapter.loadSync ? { kind: "idle" } : { kind: "loading" },
    };
  });

  const [data, setData] = useState<UserData>(initial[0].data);
  const [status, setStatus] = useState<SaveStatus>(initial[0].status);
  // Last bytes successfully written to (or loaded from) storage.
  // Drives the `dirty` flag below.
  const [lastSavedText, setLastSavedText] = useState<string | null>(() => {
    const snap = adapter.loadSync?.() ?? null;
    return snap?.text ?? null;
  });

  // Track the last snapshot we either loaded or successfully saved.
  // The revision flows back into the next save so a remote that
  // moved underneath us is detected as a conflict instead of being
  // silently overwritten.
  const lastSnapshot = useRef<Snapshot | null>(adapter.loadSync?.() ?? null);

  // The save effect should not fire when state changes are caused
  // by loads (initial fetch or remote watch) — those already match
  // the stored bytes and a save round-trip would just churn the
  // revision token. We guard with a ref that the loader flips.
  const skipNextSave = useRef<boolean>(false);

  // Async adapters (e.g. the encrypting wrapper) can't hand back
  // data before the first paint, so the reducer is briefly seeded
  // with `freshUserData()`. Without this gate, the auto-save effect
  // races the in-flight `adapter.load()` — a `setTimeout(0)` fires
  // well before PBKDF2 + AES-GCM decryption completes, and writes
  // the empty starter state over the user's real bytes. The flag
  // stays false until the load resolves (or the synchronous fast
  // path filled state from `loadSync`).
  const hasLoadedRef = useRef<boolean>(adapter.loadSync !== undefined);

  // Stash `beforeSerialize` in a ref so the save effect closes over
  // the latest transform without re-running every time the caller
  // passes an inline function.
  const beforeSerializeRef = useRef(beforeSerialize);
  beforeSerializeRef.current = beforeSerialize;

  // Handle to the pending debounced save, so `saveNow` can cancel
  // it before issuing its own immediate write.
  const pendingTimerRef = useRef<number | null>(null);

  const dispatch: Dispatch<Action> = useCallback(
    (action) => {
      setData((prev) => reducer(prev, action));
    },
    [reducer],
  );

  // Shared write path used by both the debounced auto-save and the
  // explicit `saveNow`. Owns status reporting, conflict surfacing,
  // and the lastSnapshot bookkeeping in one place. The
  // `isStale` predicate lets a debounced caller bail out if the
  // effect was cleaned up while the request was in flight.
  const performSave = useCallback(
    async (text: string, isStale: () => boolean): Promise<void> => {
      if (isStale()) {
        log.info(`save skipped (stale before start) [${adapter.id}]`);
        return;
      }
      setStatus({ kind: "saving" });
      log.info(
        `save start [${adapter.id}] bytes=${text.length} baseRev=${
          lastSnapshot.current?.revision ?? "<none>"
        }`,
      );
      const start = performance.now();
      try {
        const next = await adapter.save(text, lastSnapshot.current?.revision);
        const ms = (performance.now() - start).toFixed(0);
        if (isStale()) {
          log.info(`save ok but stale (${ms}ms) [${adapter.id}]`);
          return;
        }
        lastSnapshot.current = next;
        setLastSavedText(next.text);
        setStatus({ kind: "saved", at: Date.now() });
        log.info(
          `save ok (${ms}ms) [${adapter.id}] newRev=${next.revision ?? "<none>"}`,
        );
      } catch (err) {
        const ms = (performance.now() - start).toFixed(0);
        if (isStale()) {
          log.info(`save failed but stale (${ms}ms) [${adapter.id}]`, err);
          return;
        }
        if (err instanceof ConflictError) {
          log.warn(
            `save conflict (${ms}ms) [${adapter.id}] remoteRev=${
              err.remote.revision ?? "<none>"
            }`,
          );
          const remote = readUserDataFromText(err.remote.text);
          lastSnapshot.current = err.remote;
          setStatus({ kind: "conflict", remote });
          return;
        }
        if (err instanceof AuthError) {
          log.warn(`save auth failed (${ms}ms) [${adapter.id}]`, err);
          setStatus({ kind: "auth-error", message: err.message });
          return;
        }
        log.error(`save failed (${ms}ms) [${adapter.id}]`, err);
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [adapter],
  );

  // Async load. Skipped when `loadSync` already handed us data.
  useEffect(() => {
    if (adapter.loadSync) {
      // When the previous adapter was async (no `loadSync`) and its
      // in-flight load got cancelled by this adapter swap, `hasLoadedRef`
      // is still false and state is the empty `freshUserData()` seeded
      // by the `useState` initializer with status:"loading". Run the
      // sync load now so the swap actually populates state — otherwise
      // the spinner never clears.
      if (!hasLoadedRef.current) {
        const snap = adapter.loadSync();
        log.info(
          `adapter mount [${adapter.id}] sync — recovering from cancelled async load ${
            snap
              ? `bytes=${snap.text.length} rev=${snap.revision ?? "<none>"}`
              : "<empty>"
          }`,
        );
        lastSnapshot.current = snap;
        skipNextSave.current = true;
        hasLoadedRef.current = true;
        setData(snap ? readUserDataFromText(snap.text) : freshUserData());
        setLastSavedText(snap?.text ?? null);
        setStatus({ kind: "idle" });
        return;
      }
      log.info(`adapter mount [${adapter.id}] sync — load skipped`);
      return;
    }
    let cancelled = false;
    setStatus({ kind: "loading" });
    log.info(`adapter mount [${adapter.id}] async — load start`);
    const start = performance.now();
    adapter
      .load()
      .then((snap) => {
        const ms = (performance.now() - start).toFixed(0);
        if (cancelled) {
          log.info(`load ok (${ms}ms) [${adapter.id}] but cancelled`);
          return;
        }
        log.info(
          `load ok (${ms}ms) [${adapter.id}] ${
            snap
              ? `bytes=${snap.text.length} rev=${snap.revision ?? "<none>"}`
              : "<empty>"
          }`,
        );
        lastSnapshot.current = snap;
        skipNextSave.current = true;
        hasLoadedRef.current = true;
        setData(snap ? readUserDataFromText(snap.text) : freshUserData());
        setLastSavedText(snap?.text ?? null);
        setStatus({ kind: "idle" });
      })
      .catch((err: unknown) => {
        const ms = (performance.now() - start).toFixed(0);
        if (cancelled) {
          log.info(`load failed (${ms}ms) [${adapter.id}] but cancelled`, err);
          return;
        }
        if (err instanceof AuthError) {
          log.warn(`load auth failed (${ms}ms) [${adapter.id}]`, err);
          setStatus({ kind: "auth-error", message: err.message });
          return;
        }
        log.error(`load failed (${ms}ms) [${adapter.id}]`, err);
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
      log.info(`adapter unmount [${adapter.id}] (in-flight load cancelled)`);
    };
  }, [adapter]);

  // Debounced save. Each state change schedules a write; subsequent
  // changes inside the debounce window replace the pending write.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const delay = adapter.saveDebounceMs ?? 0;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      pendingTimerRef.current = null;
      void runSave();
    }, delay);
    pendingTimerRef.current = timer;

    async function runSave() {
      if (cancelled) return;
      const transform = beforeSerializeRef.current;
      const text = serializeUserData(transform ? transform(data) : data);
      await performSave(text, () => cancelled);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (pendingTimerRef.current === timer) pendingTimerRef.current = null;
    };
  }, [adapter, data, performSave]);

  // Save the current in-memory state verbatim. Used by the explicit
  // "save" button — bypasses `beforeSerialize` so the user can persist
  // half-filled rows when they ask for it.
  const saveNow = useCallback(() => {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    const text = serializeUserData(data);
    void performSave(text, () => false);
  }, [data, performSave]);

  // Remote-change subscription. Cloud adapters call this when
  // another device pushes; local adapters typically don't supply it.
  useEffect(() => {
    if (!adapter.watch) return;
    log.info(`watch subscribe [${adapter.id}]`);
    const unsubscribe = adapter.watch((snap) => {
      log.info(
        `watch fired [${adapter.id}] bytes=${snap.text.length} rev=${
          snap.revision ?? "<none>"
        }`,
      );
      lastSnapshot.current = snap;
      skipNextSave.current = true;
      hasLoadedRef.current = true;
      setData(readUserDataFromText(snap.text));
      setLastSavedText(snap.text);
      setStatus({ kind: "idle" });
    });
    return () => {
      log.info(`watch unsubscribe [${adapter.id}]`);
      unsubscribe();
    };
  }, [adapter]);

  const currentText = useMemo(() => serializeUserData(data), [data]);
  const dirty = lastSavedText !== null && currentText !== lastSavedText;

  return { data, dispatch, status, dirty, saveNow };
}
