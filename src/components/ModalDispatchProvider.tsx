import { useCallback, useMemo, useRef, type ReactNode } from "react";

import {
  ModalDispatchContext,
  applyModalCommand,
  mergeHandlerSlices,
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
  const registerHandlers = useCallback((getter: SliceGetter) => {
    slicesRef.current.add(getter);
    return () => {
      slicesRef.current.delete(getter);
    };
  }, []);

  // Stable across renders: the merge happens at dispatch time against the
  // refs, so a column reorder (which mints a fresh base slice) no longer
  // changes `dispatch`'s identity and re-renders the memoized chrome / rows.
  const dispatch = useCallback<ModalDispatch>((command) => {
    const getters: PartialModalCommandHandlers[] = [];
    for (const get of slicesRef.current) getters.push(get());
    const merged = mergeHandlerSlices(baseRef.current, getters);
    applyModalCommand(command, merged as ModalCommandHandlers);
  }, []);

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
