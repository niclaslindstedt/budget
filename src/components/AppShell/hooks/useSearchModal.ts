import { useMemo, useRef, useState } from "react";

import { buildSearchIndex, type SearchEntry } from "../../../data/search";
import type { UserData } from "../../../data/types";

const EMPTY_INDEX: SearchEntry[] = [];

type ScrollToRowRequest = {
  sheetId: string;
  rowId: string;
  iso: string;
  tick: number;
};

type Params = {
  data: UserData;
};

type Result = {
  // Transfer-search modal state. `searchOpen` toggles visibility;
  // `searchQuery` survives modal close so the user can reopen the
  // search with their last query already filled in (session-only —
  // never persisted to localStorage).
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  // Memoised search index against the whole `data` reference so it
  // rebuilds on every persisted edit but stays stable between renders
  // when nothing changed. `runSearch` filters this on every keystroke
  // inside the modal.
  searchIndex: SearchEntry[];
  // One-shot request from the search modal: "scroll to this row,
  // pulse it briefly". The tick bumps on every pick so the effect
  // re-fires even when the user picks the same row twice. `null` =
  // idle. BudgetPage reads it via prop and ignores requests for other
  // sheets (the parent dispatches `selectSheet` first; the new
  // BudgetPage mounts with the request already set).
  scrollToRowRequest: ScrollToRowRequest | null;
  setScrollToRowRequest: (
    next:
      | ScrollToRowRequest
      | null
      | ((prev: ScrollToRowRequest | null) => ScrollToRowRequest | null),
  ) => void;
};

export function useSearchModal({ data }: Params): Result {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [scrollToRowRequest, setScrollToRowRequest] =
    useState<ScrollToRowRequest | null>(null);
  // Lazy: the search index is a flattened projection of every sheet's
  // rows plus synthesized transfer + history rows for every account.
  // Building it on every `data` change paid that cost on every reducer
  // dispatch — keystrokes in budget cells, toast queue churn, modal
  // opens — even though the index is only read inside
  // `TransferSearchModal`. Gate the build on `searchOpen` so the cost
  // moves to the moment the user actually opens search. While the modal
  // stays open, the memo re-runs on every `data` change (so a row edit
  // made in another tab or via undo while search is open still
  // refreshes the results). Cache the most recent build behind a ref
  // so reopening the modal without any intervening data change reuses
  // the prior index instantly — re-opens are the common case.
  const cacheRef = useRef<{ data: UserData; index: SearchEntry[] } | null>(
    null,
  );
  const searchIndex = useMemo<SearchEntry[]>(() => {
    if (!searchOpen) return cacheRef.current?.index ?? EMPTY_INDEX;
    const cached = cacheRef.current;
    if (cached && cached.data === data) return cached.index;
    const fresh = buildSearchIndex(data);
    cacheRef.current = { data, index: fresh };
    return fresh;
  }, [searchOpen, data]);
  return {
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchIndex,
    scrollToRowRequest,
    setScrollToRowRequest,
  };
}
