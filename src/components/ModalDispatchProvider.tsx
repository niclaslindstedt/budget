import { useCallback, useMemo, useRef, type ReactNode } from "react";

import {
  ModalDispatchContext,
  applyModalCommand,
  mergeHandlerSlices,
  modalCommandTarget,
  type ModalCommand,
  type ModalCommandHandlers,
  type ModalDispatch,
  type ModalDispatchContextValue,
  type PartialModalCommandHandlers,
  type SliceGetter,
} from "./modal-dispatch";

type ModalDispatchProviderProps = {
  // The base handler slice. AppShell supplies the handlers whose state it
  // still owns; as that state moves into the modal hosts, hosts register
  // their own slices via `useRegisterModalHandlers` and this base shrinks.
  handlers?: PartialModalCommandHandlers;
  children: ReactNode;
};

export function ModalDispatchProvider({
  handlers,
  children,
}: ModalDispatchProviderProps) {
  // The base slice closures change every render (they close over fresh
  // state). Mirror the latest into a ref so the stable `dispatch` reads
  // current closures without re-subscribing consumers on every render —
  // a click is what reads the ref, long after the render that set it.
  const baseRef = useRef<PartialModalCommandHandlers>(handlers ?? {});
  baseRef.current = handlers ?? {};

  const slicesRef = useRef<Set<SliceGetter>>(new Set());

  // A command dispatched before the host that owns its handler has
  // mounted (its slice is registered in a mount effect, and the modal
  // hosts are code-split so a host's chunk may still be loading when the
  // chrome paints). We hold the latest such command here and replay it
  // the moment a newly-registered slice supplies the missing handler, so
  // a click on "Settings" during that window opens the modal once the
  // chunk lands instead of being silently dropped. Latest-wins: a second
  // command before the flush overwrites the first, which matches modal
  // semantics (you only ever want the last-requested modal open).
  const pendingRef = useRef<ModalCommand | null>(null);

  // Try to run a command against the currently-registered handlers.
  // Returns false (without invoking anything) when the target handler
  // isn't registered yet, so the caller can decide to hold it. Reads the
  // refs, so its identity stays stable across renders.
  const tryApply = useCallback((command: ModalCommand): boolean => {
    const getters: PartialModalCommandHandlers[] = [];
    for (const get of slicesRef.current) getters.push(get());
    const merged = mergeHandlerSlices(baseRef.current, getters);
    if (typeof merged[modalCommandTarget(command)] !== "function") return false;
    applyModalCommand(command, merged as ModalCommandHandlers);
    return true;
  }, []);

  const registerHandlers = useCallback(
    (getter: SliceGetter) => {
      slicesRef.current.add(getter);
      // This slice may carry the handler a just-dispatched command was
      // waiting on — replay it now that the host has mounted.
      if (pendingRef.current && tryApply(pendingRef.current)) {
        pendingRef.current = null;
      }
      return () => {
        slicesRef.current.delete(getter);
      };
    },
    [tryApply],
  );

  // Stable across renders: the merge happens at dispatch time against the
  // refs, so a column reorder (which mints a fresh base slice) no longer
  // changes `dispatch`'s identity and re-renders the memoized chrome / rows.
  const dispatch = useCallback<ModalDispatch>(
    (command) => {
      if (!tryApply(command)) pendingRef.current = command;
    },
    [tryApply],
  );

  const value = useMemo<ModalDispatchContextValue>(
    () => ({ dispatch, registerHandlers }),
    [dispatch, registerHandlers],
  );

  return (
    <ModalDispatchContext.Provider value={value}>
      {children}
    </ModalDispatchContext.Provider>
  );
}
