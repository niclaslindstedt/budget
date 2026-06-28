import { useCallback, useMemo, useState } from "react";
import { Check, CopyCheck, Layers } from "lucide-react";

import {
  duplicateRemovals,
  findDuplicateImports,
  type DuplicateGroup,
} from "../../data/accounts/duplicates";
import { unlock } from "../../data/achievements";
import type { Account, Settings, UserData } from "../../data/types";
import type { Action } from "../../data/reducer";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatShortDate } from "../../utils/format";
import { indexById } from "../../utils/indexById";
import { tintBorder, tintFill } from "../../utils/tint";
import { useToast } from "../../hooks";
import { Button } from "../form";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  data: UserData;
  settings: Settings;
  dispatch: (action: Action) => void;
};

// Sentinel owner selection meaning "these aren't really the same
// transaction — keep every copy". Distinct from any real account id.
const KEEP_ALL = "__keep_all__";

export function AccountDuplicatesModal({
  open,
  onClose,
  data,
  settings,
  dispatch,
}: Props) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  // Per-group owner override, keyed by the signature-stable group id.
  // Absent ⇒ fall back to the group's suggested owner. KEEP_ALL ⇒ the
  // user declared it a false positive.
  const [owners, setOwners] = useState<Record<string, string>>({});
  // Groups the user resolved as "keep all" this session — hidden from
  // the list since no data changed to make them drop out naturally.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const accountsById = useMemo(() => indexById(data.accounts), [data.accounts]);

  const groups = useMemo(
    () => findDuplicateImports(data).filter((g) => !dismissed.has(g.id)),
    [data, dismissed],
  );

  const ownerFor = useCallback(
    (group: DuplicateGroup): string =>
      owners[group.id] ?? group.suggestedOwnerId,
    [owners],
  );

  const resolveGroups = useCallback(
    (toResolve: readonly DuplicateGroup[]) => {
      const removals: { accountId: string; entryId: string }[] = [];
      const keptIds: string[] = [];
      for (const group of toResolve) {
        const owner = ownerFor(group);
        if (owner === KEEP_ALL) {
          keptIds.push(group.id);
          continue;
        }
        removals.push(...duplicateRemovals(group, owner));
      }
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
      if (keptIds.length > 0) {
        setDismissed((prev) => {
          const next = new Set(prev);
          for (const id of keptIds) next.add(id);
          return next;
        });
      }
    },
    [dispatch, ownerFor, t, toast],
  );

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="find-duplicates-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<Layers size={14} aria-hidden focusable={false} />}
        title={t("duplicates.title")}
        onClose={onClose}
      />
      <Modal.Body>
        <p className="mb-3 text-sm text-muted">{t("duplicates.intro")}</p>

        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-bold tracking-wider uppercase text-muted">
            {groups.length === 1
              ? t("duplicates.countOne", { n: groups.length })
              : t("duplicates.countOther", { n: groups.length })}
          </h3>
          {groups.length > 0 && (
            <button
              type="button"
              onClick={() => resolveGroups(groups)}
              aria-label={t("duplicates.acceptAllAria")}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded border border-accent bg-accent/10 px-2 py-1 text-xs font-bold text-accent hover:bg-accent/20"
            >
              <CopyCheck size={12} aria-hidden focusable={false} />
              {t("duplicates.acceptAll")}
            </button>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="rounded border border-line bg-surface-2 px-3 py-6 text-center">
            <p className="text-sm text-fg">{t("duplicates.empty")}</p>
            <p className="mt-1 text-xs text-muted">
              {t("duplicates.emptyHint")}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map((group) => (
              <DuplicateCard
                key={group.id}
                group={group}
                accountsById={accountsById}
                settings={settings}
                lang={lang}
                selectedOwner={ownerFor(group)}
                onSelectOwner={(owner) =>
                  setOwners((prev) => ({ ...prev, [group.id]: owner }))
                }
                onResolve={() => resolveGroups([group])}
                t={t}
              />
            ))}
          </ul>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onClose}>
          {t("common.close")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

type CardProps = {
  group: DuplicateGroup;
  accountsById: Map<string, Account>;
  settings: Settings;
  lang: ReturnType<typeof useLang>;
  selectedOwner: string;
  onSelectOwner: (owner: string) => void;
  onResolve: () => void;
  t: ReturnType<typeof useT>;
};

function DuplicateCard({
  group,
  accountsById,
  settings,
  lang,
  selectedOwner,
  onSelectOwner,
  onResolve,
  t,
}: CardProps) {
  return (
    <li className="rounded border border-line bg-surface-2">
      <header className="flex flex-wrap items-baseline gap-2 border-b border-line bg-surface-3 px-3 py-1.5">
        <span className="font-mono text-xs text-muted">
          {formatShortDate(group.date, settings.shortDateFormat, lang)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-fg">
          {group.description || "—"}
        </span>
        <span
          className={`shrink-0 font-mono tabular-nums text-sm ${
            group.amount < 0 ? "text-negative" : "text-positive"
          }`}
        >
          {formatBalance(group.amount, settings)}
        </span>
      </header>

      <div
        role="radiogroup"
        aria-label={t("duplicates.ownerLabel")}
        className="divide-y divide-line"
      >
        {group.accounts.map((acc) => {
          const account = accountsById.get(acc.accountId);
          const selected = selectedOwner === acc.accountId;
          return (
            <button
              key={acc.accountId}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelectOwner(acc.accountId)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                selected ? "bg-accent/10" : "hover:bg-surface-3"
              }`}
            >
              <OwnerRadio selected={selected} />
              {account ? (
                <AccountChip account={account} />
              ) : (
                <span className="text-sm text-fg">{acc.accountId}</span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={selectedOwner === KEEP_ALL}
          onClick={() => onSelectOwner(KEEP_ALL)}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
            selectedOwner === KEEP_ALL ? "bg-accent/10" : "hover:bg-surface-3"
          }`}
        >
          <OwnerRadio selected={selectedOwner === KEEP_ALL} />
          <span className="text-sm text-muted">{t("duplicates.keepAll")}</span>
        </button>
      </div>

      <footer className="flex items-center justify-end border-t border-line bg-surface-3 px-3 py-1.5">
        <Button
          variant="primary"
          onClick={onResolve}
          aria-label={t("duplicates.resolveAria")}
        >
          <span className="inline-flex items-center gap-1">
            <CopyCheck size={14} aria-hidden focusable={false} />
            {t("duplicates.resolve")}
          </span>
        </Button>
      </footer>
    </li>
  );
}

// The selection dot in front of each owner choice — filled accent with a
// check when picked, hollow outline otherwise.
function OwnerRadio({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
        selected ? "border-accent bg-accent text-page-bg" : "border-line"
      }`}
    >
      {selected && <Check size={11} focusable={false} />}
    </span>
  );
}

// Compact account pill — mirrors `AccountRow`'s own chip (glyph + name,
// tinted by the account colour when set) rather than `EntityChip`, whose
// colour / icon are required and assume a hex token.
function AccountChip({ account }: { account: Account }) {
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-xs font-medium text-fg"
      style={
        account.color
          ? {
              color: account.color,
              backgroundColor: tintFill(account.color),
              borderColor: tintBorder(account.color),
            }
          : undefined
      }
    >
      <CategoryIconGlyph name={account.glyph ?? "landmark"} size={12} />
      <span className="truncate">{account.name}</span>
    </span>
  );
}
