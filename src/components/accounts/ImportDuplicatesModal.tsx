import { useMemo, useState } from "react";
import { Check, CopyCheck, Layers } from "lucide-react";

import {
  duplicateBatchOwners,
  duplicateBatchRemovals,
  suggestBatchOwner,
  type DuplicateGroup,
} from "../../data/accounts/duplicates";
import { unlock } from "../../data/achievements";
import type { Settings, UserData } from "../../data/types";
import type { Action } from "../../data/reducer";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatShortDate } from "../../utils/format";
import { indexById } from "../../utils/indexById";
import { useToast } from "../../hooks";
import { Button } from "../form";
import { Modal } from "../Modal";
import { AccountChip, OwnerRadio } from "./AccountDuplicatesModal";

type Props = {
  open: boolean;
  onClose: () => void;
  // The cross-account duplicate groups this import created.
  groups: DuplicateGroup[];
  // The strongest-signal owner (the account holding exactly these rows
  // over the import's date range), pre-selected when present. `null` ⇒
  // fall back to the per-batch balance suggestion.
  suggestedOwner: string | null;
  data: UserData;
  settings: Settings;
  dispatch: (action: Action) => void;
};

// Sentinel owner selection meaning "keep every copy, don't resolve".
const SKIP = "__skip__";

// Import-time single-owner duplicate picker. Unlike the menu-opened
// `AccountDuplicatesModal` — which resolves each group independently — the
// import case is almost always one statement that overlaps a single other
// account, so the user picks ONE true owner for the whole batch and every
// detected duplicate consolidates there: owner = the account just imported
// into keeps its new rows and the older copies elsewhere are removed; owner
// = an existing account removes the just-imported copies. Both routes go
// through the same `resolveDuplicateImports`.
export function ImportDuplicatesModal({
  open,
  onClose,
  groups,
  suggestedOwner,
  data,
  settings,
  dispatch,
}: Props) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const accountsById = useMemo(() => indexById(data.accounts), [data.accounts]);
  const owners = useMemo(() => duplicateBatchOwners(groups), [groups]);
  // Default to the exclusive-range owner when one exists (the strongest
  // signal); else the account whose balances reconcile in the most groups;
  // else Skip — mirrors the per-group "default Skip" rule.
  const [selected, setSelected] = useState<string>(
    () => suggestedOwner ?? suggestBatchOwner(groups) ?? SKIP,
  );

  if (!open) return null;

  const onResolve = () => {
    if (selected !== SKIP) {
      const removals = duplicateBatchRemovals(groups, selected);
      if (removals.length > 0) {
        dispatch({ type: "resolveDuplicateImports", removals });
        unlock("duplicateSleuth");
        toast.push({
          kind: "success",
          message:
            removals.length === 1
              ? t("duplicates.resolvedOne")
              : t("duplicates.resolvedOther", { n: removals.length }),
        });
      }
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="import-duplicates-title"
      size="max-w-lg"
      centered
    >
      <Modal.Header
        icon={<Layers size={14} aria-hidden focusable={false} />}
        title={t("duplicates.importTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <p className="mb-3 text-sm text-muted">{t("duplicates.importIntro")}</p>

        <h3 className="mb-1 text-xs font-bold tracking-wider uppercase text-muted">
          {groups.length === 1
            ? t("duplicates.countOne", { n: groups.length })
            : t("duplicates.countOther", { n: groups.length })}
        </h3>
        <ul className="mb-4 max-h-48 divide-y divide-line overflow-y-auto rounded border border-line bg-surface-2">
          {groups.map((group) => (
            <li
              key={group.id}
              className="flex items-baseline gap-2 px-2 py-1 text-xs"
            >
              <span className="shrink-0 font-mono text-muted">
                {formatShortDate(group.date, settings.shortDateFormat, lang)}
              </span>
              <span className="min-w-0 flex-1 truncate text-fg">
                {group.description || "—"}
              </span>
              <span
                className={`shrink-0 font-mono tabular-nums ${
                  group.amount < 0 ? "text-negative" : "text-positive"
                }`}
              >
                {formatBalance(group.amount, settings)}
              </span>
            </li>
          ))}
        </ul>

        <h3 className="mb-1 text-xs font-bold tracking-wider uppercase text-muted">
          {t("duplicates.ownerLabel")}
        </h3>
        <div
          role="radiogroup"
          aria-label={t("duplicates.ownerLabel")}
          className="divide-y divide-line rounded border border-line"
        >
          {owners.map((opt) => {
            const account = accountsById.get(opt.accountId);
            const isSel = selected === opt.accountId;
            return (
              <button
                key={opt.accountId}
                type="button"
                role="radio"
                aria-checked={isSel}
                onClick={() => setSelected(opt.accountId)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                  isSel ? "bg-accent/10" : "hover:bg-surface-3"
                }`}
              >
                <OwnerRadio selected={isSel} />
                {account ? (
                  <AccountChip account={account} />
                ) : (
                  <span className="text-sm text-fg">{opt.accountId}</span>
                )}
                {opt.fitCount > 0 && (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-success">
                    <Check size={11} aria-hidden focusable={false} />
                    {t("duplicates.importFits")}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={selected === SKIP}
            onClick={() => setSelected(SKIP)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
              selected === SKIP ? "bg-accent/10" : "hover:bg-surface-3"
            }`}
          >
            <OwnerRadio selected={selected === SKIP} />
            <span className="text-sm text-muted">{t("duplicates.skip")}</span>
          </button>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
        <Button variant="primary" withIcon onClick={onResolve}>
          <CopyCheck size={14} aria-hidden focusable={false} />
          {t("duplicates.resolve")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
