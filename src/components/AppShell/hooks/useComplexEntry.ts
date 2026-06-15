import { useCallback, useState } from "react";

import type {
  ComplexEntryDraft,
  ComplexEntrySeed,
} from "../../budget/BudgetComplexEntryModal";
import type { Action } from "../../../data/reducer";
import {
  type RecurrenceRule,
  shiftRuleStartToFuture,
} from "../../../data/recurrence";
import type { RecurringCandidate } from "../../../data/budget/recurring-detection";
import type { AccountBudget } from "../../../data/types";
import { todayIso } from "../../../utils/date";
import type { RecurringPromoteContext } from "../types";

type Params = {
  activeBudget: AccountBudget | null;
  sheetId: string;
  itemId: string;
  dispatch: (action: Action) => void;
  // Closes the BudgetEditEntryModal after a successful history-row promotion
  // so the user lands back on the budget page with the new series in
  // view.
  closeEditPrompt: () => void;
};

type Result = {
  // BudgetComplexEntryModal state
  complexOpen: boolean;
  setComplexOpen: (open: boolean) => void;
  complexSeedDate: string;
  // Pre-fill payload for the BudgetComplexEntryModal. `null` keeps the
  // modal's existing blank-form behaviour for the budget add-row
  // button; a populated seed comes from the recurring-candidate
  // promote flow.
  complexSeed: ComplexEntrySeed | null;
  setComplexSeed: (next: ComplexEntrySeed | null) => void;
  // Promote-flow context. When set, the BudgetComplexEntryModal's submit
  // dispatches `promoteRecurringCandidate` (instead of
  // `addRowsFromComplex`) so the candidate is consumed and the
  // merchant hint is recorded against the original bank text.
  recurringPromoteContext: RecurringPromoteContext | null;
  setRecurringPromoteContext: (next: RecurringPromoteContext | null) => void;

  onAddComplex: (date: string) => void;
  onComplexSubmit: (draft: ComplexEntryDraft) => void;
  onPromoteRecurringCandidate: (
    candidate: RecurringCandidate,
    rule: RecurrenceRule,
    dates: string[],
    typeId: string | null,
    companyId: string | null,
  ) => void;
  onDismissRecurringCandidate: (key: string) => void;
  onDismissAllRecurringCandidates: (keys: readonly string[]) => void;
  onPromoteHistory: (
    historyEntryId: string,
    sourceDescription: string,
    promotion: {
      description: string;
      amount: number;
      typeId: string | null;
      companyId: string | null;
      dates: string[];
      applyToHistoric: boolean;
      excludedHistoryEntryIds: readonly string[];
    },
  ) => void;
};

// BudgetComplexEntryModal + recurring-candidate promote / dismiss + history-
// row promote. All three flows seed the same modal via `complexSeed`
// and `recurringPromoteContext`; submit dispatches either
// `addRowsFromComplex` (plain add) or `promoteRecurringCandidate`
// (consume the candidate key) depending on whether
// `recurringPromoteContext` is set.
export function useComplexEntry({
  activeBudget,
  sheetId,
  itemId,
  dispatch,
  closeEditPrompt,
}: Params): Result {
  const [complexOpen, setComplexOpen] = useState(false);
  const [complexSeedDate, setComplexSeedDate] = useState("");
  const [complexSeed, setComplexSeed] = useState<ComplexEntrySeed | null>(null);
  const [recurringPromoteContext, setRecurringPromoteContext] =
    useState<RecurringPromoteContext | null>(null);

  const onAddComplex = useCallback((date: string) => {
    setComplexSeedDate(date);
    setComplexSeed(null);
    setRecurringPromoteContext(null);
    setComplexOpen(true);
  }, []);

  const onComplexSubmit = useCallback(
    (draft: ComplexEntryDraft) => {
      if (recurringPromoteContext) {
        dispatch({
          type: "promoteRecurringCandidate",
          sheetId,
          itemId,
          key: recurringPromoteContext.key,
          sourceDescription: recurringPromoteContext.sourceDescription,
          draft,
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

  // Promote opens the complex-entry modal pre-seeded with the detected
  // description, amount, and cadence so the user can adjust before
  // committing — submit then dispatches `promoteRecurringCandidate`,
  // which mints the series rows, records a merchant hint against the
  // candidate's bank text, and consumes the candidate by adding its
  // key to `recurringDismissals` (so the panel drops it).
  const onPromoteRecurringCandidate = useCallback(
    (
      candidate: RecurringCandidate,
      rule: RecurrenceRule,
      _dates: string[],
      typeId: string | null,
      companyId: string | null,
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
        companyId,
        isTransfer: false,
        rule: shifted,
      });
      setComplexOpen(true);
    },
    [activeBudget],
  );

  // Dismiss persists the key directly without minting anything.
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
      _historyEntryId: string,
      sourceDescription: string,
      promotion: {
        description: string;
        amount: number;
        typeId: string | null;
        companyId: string | null;
        dates: string[];
        applyToHistoric: boolean;
        excludedHistoryEntryIds: readonly string[];
      },
    ) => {
      if (!activeBudget) return;
      if (promotion.dates.length === 0) return;
      // Note: the source historyEntryId is currently unused here —
      // kept on the API surface for future use (e.g. selectively
      // hiding the source row or recording the promotion against
      // its id).
      void _historyEntryId;
      dispatch({
        type: "promoteHistoryToRecurring",
        sheetId,
        itemId: activeBudget.id,
        sourceDescription,
        description: promotion.description,
        amount: promotion.amount,
        typeId: promotion.typeId,
        companyId: promotion.companyId,
        dates: promotion.dates,
        applyToHistoric: promotion.applyToHistoric,
        accountId: activeBudget.accountId,
        excludedHistoryEntryIds: promotion.excludedHistoryEntryIds,
        now: Date.now(),
      });
      closeEditPrompt();
    },
    [dispatch, sheetId, activeBudget, closeEditPrompt],
  );

  return {
    complexOpen,
    setComplexOpen,
    complexSeedDate,
    complexSeed,
    setComplexSeed,
    recurringPromoteContext,
    setRecurringPromoteContext,
    onAddComplex,
    onComplexSubmit,
    onPromoteRecurringCandidate,
    onDismissRecurringCandidate,
    onDismissAllRecurringCandidates,
    onPromoteHistory,
  };
}
