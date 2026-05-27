import { useCallback, useMemo, useState } from "react";

import type {
  MatchRuleDraft,
  MatchRuleSeed,
} from "../../budget/BudgetMatchRuleModal";
import { findMatchingRule, ruleMatchesEntry } from "../../../data/match-rules";
import {
  countRowsAffectedByReapply,
  reapplyPatternsToAllSheets,
} from "../../../data/budget/pattern-apply";
import type { Action } from "../../../data/reducer";
import { findColumnByType, newId } from "../../../data/sheet";
import type {
  AccountBudget,
  HistoryEntry,
  MatchRule,
  Row,
  UserData,
} from "../../../data/types";
import { useT } from "../../../i18n";
import type { useToast } from "../../../hooks";
import { createLogger } from "../../../utils/logger";
import type { MatchRulePrompt } from "../types";

const log = createLogger("match-rules");

type Params = {
  data: UserData;
  activeItem: AccountBudget;
  dispatch: (action: Action) => void;
  toast: ReturnType<typeof useToast>;
};

type Result = {
  matchRulePrompt: MatchRulePrompt | null;
  setMatchRulePrompt: (next: MatchRulePrompt | null) => void;
  matchRuleSeed: MatchRuleSeed | null;
  matchRuleExisting: MatchRule | null;
  matchRuleAllEntries: readonly HistoryEntry[];
  onMatchRuleRequest: (row: Row) => void;
  onSubmitMatchRule: (draft: MatchRuleDraft) => void;
  onDeleteMatchRule: () => void;
  onEditMatchRule: (ruleId: string) => void;
  onMoveMatchRule: (ruleId: string, direction: "up" | "down") => void;
  onReapplyMatchRules: () => void;
};

// Pattern-rule modal entry-points (`onMatchRuleRequest` from a row,
// `onEditMatchRule` from the Settings → Patterns tab), seed / existing
// memos that drive the modal's initial state, and the submit /
// delete / move / reapply dispatches. The "save once" branch in
// `onSubmitMatchRule` mirrors the modal's saveRule checkbox: applies
// the rule's labels once and throws the rule away when the box is
// unchecked.
export function useMatchRuleUi({
  data,
  activeItem,
  dispatch,
  toast,
}: Params): Result {
  const t = useT();
  const [matchRulePrompt, setMatchRulePrompt] =
    useState<MatchRulePrompt | null>(null);

  const onMatchRuleRequest = useCallback((row: Row) => {
    // Synthesized transfer / correction rows have no editable
    // description for a rule to key off; the menu hides the item on
    // them but guard the entry path too so a stray dispatch is a no-op.
    if (row.transferId || row.isCorrection) return;
    if (row.historyEntryId) {
      log.info(`open modal entryId=${row.historyEntryId}`);
      setMatchRulePrompt({ kind: "history", entryId: row.historyEntryId });
      return;
    }
    log.info(`open modal rowId=${row.id}`);
    setMatchRulePrompt({ kind: "row", row });
  }, []);

  // Resolve the seed for the pattern-rule modal from the active
  // prompt. History-row prompts look the entry up against the active
  // account's history so a concurrent re-import / delete closes the
  // modal cleanly. Budget-row prompts read date / description / amount
  // out of the row itself (no lookup needed) and tag the seed `kind:
  // "row"` so the modal switches to the date-stripping derivation
  // when seeding the pattern. Edit prompts have no seed — the modal
  // shows the existing rule's fields.
  const matchRuleSeed = useMemo<MatchRuleSeed | null>(() => {
    if (!matchRulePrompt) return null;
    if (matchRulePrompt.kind === "edit") return null;
    if (matchRulePrompt.kind === "history") {
      const accountId = activeItem.accountId;
      if (!accountId) return null;
      const entries = data.history[accountId] ?? [];
      const entry = entries.find((e) => e.id === matchRulePrompt.entryId);
      if (!entry) return null;
      return {
        id: entry.id,
        description: entry.description,
        amount: entry.amount,
      };
    }
    const row = matchRulePrompt.row;
    const descCol = findColumnByType(activeItem.columns, "description");
    const amountCol = findColumnByType(activeItem.columns, "amount");
    const description =
      descCol && typeof row.cells[descCol.id] === "string"
        ? (row.cells[descCol.id] as string)
        : "";
    const amount =
      amountCol && typeof row.cells[amountCol.id] === "number"
        ? (row.cells[amountCol.id] as number)
        : 0;
    return { id: row.id, description, amount };
  }, [matchRulePrompt, activeItem, data.history]);

  // The rule the modal is editing, when the prompt came from Settings.
  // Looked up by id so a concurrent rule delete drops the prompt.
  const matchRuleExisting = useMemo<MatchRule | null>(() => {
    if (matchRulePrompt?.kind !== "edit") return null;
    return data.matchRules.find((r) => r.id === matchRulePrompt.ruleId) ?? null;
  }, [matchRulePrompt, data.matchRules]);

  // Every history entry on the active account, fed into the rule
  // modal's live preview so the user sees what their pattern matches
  // before they save it. Empty when the active sheet has no account
  // attached (the rule still saves; the preview just shows zero rows).
  const matchRuleAllEntries = useMemo<readonly HistoryEntry[]>(() => {
    const accountId = activeItem.accountId;
    if (!accountId) return [];
    return data.history[accountId] ?? [];
  }, [activeItem.accountId, data.history]);

  const onSubmitMatchRule = useCallback(
    (draft: MatchRuleDraft) => {
      const existingId =
        matchRulePrompt?.kind === "edit" ? matchRulePrompt.ruleId : null;
      const rule: MatchRule = {
        id: existingId ?? newId(),
        pattern: draft.pattern,
      };
      if (draft.description) rule.description = draft.description;
      if (draft.typeId) rule.typeId = draft.typeId;
      if (draft.companyId) rule.companyId = draft.companyId;
      if (draft.amountSign !== "any") rule.amountSign = draft.amountSign;
      if (draft.transferFilter !== "any")
        rule.transferFilter = draft.transferFilter;
      if (draft.amountMin !== undefined) rule.amountMin = draft.amountMin;
      if (draft.amountMax !== undefined) rule.amountMax = draft.amountMax;
      // "Save pattern" unchecked → apply the rule's labels once and
      // throw the rule away. The BudgetMatchRuleModal already coerces edits
      // to saveRule=true so an existing rule can never be downgraded
      // to a one-shot sweep here.
      if (!existingId && !draft.saveRule) {
        log.info(
          `dispatch applyMatchRuleOnce id=${rule.id} ` +
            `pattern=${JSON.stringify(rule.pattern)} ` +
            `typeId=${rule.typeId ?? "(none)"} ` +
            `description=${rule.description ? JSON.stringify(rule.description) : "(none)"} ` +
            `amountSign=${rule.amountSign ?? "any"} ` +
            `transferFilter=${rule.transferFilter ?? "any"} ` +
            `amountMin=${rule.amountMin ?? "(none)"} ` +
            `amountMax=${rule.amountMax ?? "(none)"}`,
        );
        dispatch({ type: "applyMatchRuleOnce", rule });
        setMatchRulePrompt(null);
        return;
      }
      // Predict the overlay outcome BEFORE dispatch so the trace shows
      // both the rule shape that's being persisted AND how many history
      // entries the new rule would actually win against the existing
      // ruleset (rules earlier in the array shadow later ones, so a
      // preview that matches N entries can land zero new overlays when
      // an existing catch-all already claims them).
      const accountId = activeItem.accountId;
      const entries = accountId ? (data.history[accountId] ?? []) : [];
      const nextRules = existingId
        ? data.matchRules.map((r) => (r.id === existingId ? rule : r))
        : [...data.matchRules, rule];
      let wouldOverlay = 0;
      let newRuleWins = 0;
      for (const entry of entries) {
        if (entry.hidden) continue;
        const matched = findMatchingRule(nextRules, entry);
        if (!matched) continue;
        wouldOverlay += 1;
        if (matched.id === rule.id) newRuleWins += 1;
      }
      const ruleOnlyMatches = entries.filter(
        (e) => !e.hidden && ruleMatchesEntry(rule, e),
      ).length;
      log.info(
        `dispatch ${existingId ? "updateMatchRule" : "createMatchRule"} ` +
          `id=${rule.id} pattern=${JSON.stringify(rule.pattern)} ` +
          `typeId=${rule.typeId ?? "(none)"} ` +
          `description=${rule.description ? JSON.stringify(rule.description) : "(none)"} ` +
          `amountSign=${rule.amountSign ?? "any"} ` +
          `transferFilter=${rule.transferFilter ?? "any"} ` +
          `amountMin=${rule.amountMin ?? "(none)"} ` +
          `amountMax=${rule.amountMax ?? "(none)"} ` +
          `accountId=${accountId ?? "(none)"} ` +
          `historyEntries=${entries.length} ` +
          `ruleOnlyMatches=${ruleOnlyMatches} ` +
          `newRuleWins=${newRuleWins} ` +
          `overlaidAfter=${wouldOverlay} ` +
          `existingRules=${data.matchRules.length}`,
      );
      dispatch(
        existingId
          ? { type: "updateMatchRule", rule }
          : { type: "createMatchRule", rule },
      );
      setMatchRulePrompt(null);
    },
    [
      dispatch,
      data.history,
      data.matchRules,
      activeItem.accountId,
      matchRulePrompt,
    ],
  );

  const onDeleteMatchRule = useCallback(() => {
    if (matchRulePrompt?.kind !== "edit") return;
    const ruleId = matchRulePrompt.ruleId;
    log.info(`dispatch deleteMatchRule id=${ruleId}`);
    dispatch({ type: "deleteMatchRule", ruleId });
    setMatchRulePrompt(null);
  }, [dispatch, matchRulePrompt]);

  const onEditMatchRule = useCallback((ruleId: string) => {
    log.info(`open modal edit ruleId=${ruleId}`);
    setMatchRulePrompt({ kind: "edit", ruleId });
  }, []);

  const onMoveMatchRule = useCallback(
    (ruleId: string, direction: "up" | "down") => {
      log.info(`dispatch moveMatchRule id=${ruleId} direction=${direction}`);
      dispatch({ type: "moveMatchRule", ruleId, direction });
    },
    [dispatch],
  );

  // "Reapply all" button in the Patterns settings tab. Simulates the
  // walk ahead of dispatch so the success toast can quote the actual
  // number of rows that moved — a 0-row reapply still surfaces a
  // toast (success kind, "no changes" copy) so the user gets feedback
  // that the button did its job.
  const onReapplyMatchRules = useCallback(() => {
    const next = reapplyPatternsToAllSheets(data.sheets, data.matchRules);
    const changed = countRowsAffectedByReapply(data.sheets, next);
    log.info(
      `dispatch reapplyMatchRules rules=${data.matchRules.length} ` +
        `rowsChanged=${changed}`,
    );
    dispatch({ type: "reapplyMatchRules" });
    toast.push({
      kind: "success",
      message:
        changed === 0
          ? t("settings.patterns.reapplyNoop")
          : changed === 1
            ? t("settings.patterns.reapplyOne")
            : t("settings.patterns.reapplyOther", { n: changed }),
    });
  }, [dispatch, data.sheets, data.matchRules, toast, t]);

  return {
    matchRulePrompt,
    setMatchRulePrompt,
    matchRuleSeed,
    matchRuleExisting,
    matchRuleAllEntries,
    onMatchRuleRequest,
    onSubmitMatchRule,
    onDeleteMatchRule,
    onEditMatchRule,
    onMoveMatchRule,
    onReapplyMatchRules,
  };
}
