import { useMemo, useState } from "react";

import { buildSearchIndex, type SearchEntry } from "../../../data/search";
import type { UserData } from "../../../data/types";

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
  const searchIndex = useMemo<SearchEntry[]>(
    () => buildSearchIndex(data),
    [data],
  );
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
