import { useCallback, useMemo, useState } from "react";

import { unlock as unlockAchievement } from "../../../data/achievements";
import { coverTotal, generateCoverMessage } from "../../../data/cover-transfer";
import { newId } from "../../../data/sheet";
import type {
  CoveredExpense,
  HistoryEntry,
  Transfer,
  UserData,
} from "../../../data/types";
import { todayIso } from "../../../utils/date";

// Everything the create-cover-transfer modal needs, resolved from the
// selected imported entries: the covered refs, the resolved entries (for the
// list + total), the account they live on (the transfer's `to` side), and
// their summed magnitude (the amount to move).
export type CoverPrompt = {
  covered: CoveredExpense[];
  coveredEntries: HistoryEntry[];
  toAccountId: string;
  total: number;
};

type Params = {
  data: UserData;
  dispatch: (action: {
    type: "createCoverTransfer";
    transfer: Transfer;
  }) => void;
};

export type CoverTransferFlow = {
  coverPrompt: CoverPrompt | null;
  closeCover: () => void;
  // The cover transfer whose read-only info modal is open, or null.
  coverInfoId: string | null;
  closeCoverInfo: () => void;
  // Open the create modal for the given imported entry ids, resolved against
  // the account that owns them.
  openCover: (entryIds: string[], accountId: string | null) => void;
  // Open the read-only info modal for an existing cover transfer.
  openCoverInfo: (transferId: string) => void;
  // Mint the cover transfer from the modal's two inputs (the rest is derived
  // from `coverPrompt`), persist it, and hand off to the info modal.
  onCreateCover: (fromAccountId: string, motivation: string) => void;
};

export function useCoverTransferFlow({
  data,
  dispatch,
}: Params): CoverTransferFlow {
  const [coverPrompt, setCoverPrompt] = useState<CoverPrompt | null>(null);
  const [coverInfoId, setCoverInfoId] = useState<string | null>(null);

  const openCover = useCallback(
    (entryIds: string[], accountId: string | null) => {
      if (!accountId) return;
      const entries = data.history[accountId] ?? [];
      const byId = new Map(entries.map((e) => [e.id, e]));
      const seen = new Set<string>();
      const coveredEntries: HistoryEntry[] = [];
      const covered: CoveredExpense[] = [];
      for (const entryId of entryIds) {
        if (seen.has(entryId)) continue;
        const entry = byId.get(entryId);
        if (!entry) continue;
        seen.add(entryId);
        coveredEntries.push(entry);
        covered.push({ accountId, entryId });
      }
      if (coveredEntries.length === 0) return;
      setCoverPrompt({
        covered,
        coveredEntries,
        toAccountId: accountId,
        total: coverTotal(coveredEntries),
      });
    },
    [data.history],
  );

  const closeCover = useCallback(() => setCoverPrompt(null), []);
  const openCoverInfo = useCallback(
    (transferId: string) => setCoverInfoId(transferId),
    [],
  );
  const closeCoverInfo = useCallback(() => setCoverInfoId(null), []);

  const onCreateCover = useCallback(
    (fromAccountId: string, motivation: string) => {
      if (!coverPrompt) return;
      const id = newId();
      const message = generateCoverMessage(id);
      const trimmed = motivation.trim();
      const transfer: Transfer = {
        id,
        date: todayIso(),
        description: trimmed || message,
        amount: coverPrompt.total,
        fromAccountId,
        toAccountId: coverPrompt.toAccountId,
        completed: false,
        cover: {
          motivation: trimmed,
          message,
          covered: coverPrompt.covered,
        },
      };
      dispatch({ type: "createCoverTransfer", transfer });
      unlockAchievement("coverYourTracks");
      setCoverPrompt(null);
      setCoverInfoId(id);
    },
    [coverPrompt, dispatch],
  );

  return useMemo(
    () => ({
      coverPrompt,
      closeCover,
      coverInfoId,
      closeCoverInfo,
      openCover,
      openCoverInfo,
      onCreateCover,
    }),
    [
      coverPrompt,
      closeCover,
      coverInfoId,
      closeCoverInfo,
      openCover,
      openCoverInfo,
      onCreateCover,
    ],
  );
}
