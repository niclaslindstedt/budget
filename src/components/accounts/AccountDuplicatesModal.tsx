import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  CopyCheck,
  Layers,
} from "lucide-react";

import {
  duplicateRemovals,
  duplicateSessionRemovals,
  duplicateSessions,
  findDuplicateImports,
  historyContext,
  ignoreRulesForGroup,
  type DuplicateGroup,
} from "../../data/accounts/duplicates";
import { unlock } from "../../data/achievements";
import type {
  Account,
  HistoryEntry,
  Settings,
  UserData,
} from "../../data/types";
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
  // Per-group opt-in to "remove the rest of that import" — when set, the
  // matched copies drag their whole import session out with them. Keyed by
  // the group id; absent / false ⇒ remove only the matched copies.
  const [expandSession, setExpandSession] = useState<Record<string, boolean>>(
    {},
  );

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
        removals.push(
          ...(expandSession[group.id]
            ? duplicateSessionRemovals(group, owner, data.history)
            : duplicateRemovals(group, owner)),
        );
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
    [data.history, dispatch, expandSession, ownerFor, t, toast],
  );

  // Mark a group "not a duplicate, ever": persist {description, amount}
  // ignore rules so the finder skips this charge on every future import,
  // then drop it from the list this session.
  const ignoreGroup = useCallback(
    (group: DuplicateGroup) => {
      dispatch({
        type: "ignoreDuplicates",
        ignores: ignoreRulesForGroup(group),
      });
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(group.id);
        return next;
      });
      toast.push({ kind: "success", message: t("duplicates.ignored") });
    },
    [dispatch, t, toast],
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
                history={data.history}
                settings={settings}
                lang={lang}
                selectedOwner={ownerFor(group)}
                onSelectOwner={(owner) =>
                  setOwners((prev) => ({ ...prev, [group.id]: owner }))
                }
                expandSession={expandSession[group.id] ?? false}
                onToggleExpandSession={(next) =>
                  setExpandSession((prev) => ({ ...prev, [group.id]: next }))
                }
                onResolve={() => resolveGroups([group])}
                onIgnore={() => ignoreGroup(group)}
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
  history: Record<string, HistoryEntry[]>;
  settings: Settings;
  lang: ReturnType<typeof useLang>;
  selectedOwner: string;
  onSelectOwner: (owner: string) => void;
  expandSession: boolean;
  onToggleExpandSession: (next: boolean) => void;
  onResolve: () => void;
  onIgnore: () => void;
  t: ReturnType<typeof useT>;
};

function DuplicateCard({
  group,
  accountsById,
  history,
  settings,
  lang,
  selectedOwner,
  onSelectOwner,
  expandSession,
  onToggleExpandSession,
  onResolve,
  onIgnore,
  t,
}: CardProps) {
  const [expanded, setExpanded] = useState(false);
  // Extra entries the chosen owner's resolution would sweep out with the
  // rest of each mis-imported session — only when a non-owner copy carries
  // an import backref and that session left more rows than the group
  // matched. KEEP_ALL deletes nothing, so it never expands.
  const sessionExtra = useMemo(() => {
    if (selectedOwner === KEEP_ALL) return 0;
    return duplicateSessions(group, selectedOwner, history).reduce(
      (sum, s) => sum + (s.total - s.matched),
      0,
    );
  }, [group, selectedOwner, history]);
  return (
    <li className="rounded border border-line bg-surface-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? t("duplicates.hideContextAria")
            : t("duplicates.showContextAria")
        }
        className="flex w-full flex-wrap items-baseline gap-2 border-b border-line bg-surface-3 px-3 py-1.5 text-left hover:bg-surface-2"
      >
        {expanded ? (
          <ChevronDown
            size={12}
            className="shrink-0 self-center text-muted"
            aria-hidden
            focusable={false}
          />
        ) : (
          <ChevronRight
            size={12}
            className="shrink-0 self-center text-muted"
            aria-hidden
            focusable={false}
          />
        )}
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
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 border-b border-line bg-surface px-3 py-2">
          {group.accounts.map((acc) => (
            <ContextPanel
              key={acc.accountId}
              account={accountsById.get(acc.accountId)}
              accountId={acc.accountId}
              entries={history[acc.accountId] ?? []}
              targetId={acc.entries[0]?.id ?? ""}
              fits={acc.fits}
              settings={settings}
              lang={lang}
              t={t}
            />
          ))}
        </div>
      )}

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

      {sessionExtra > 0 && (
        <label className="flex cursor-pointer items-start gap-2 border-b border-line bg-surface px-3 py-1.5 text-xs text-muted hover:text-fg">
          <input
            type="checkbox"
            checked={expandSession}
            onChange={(e) => onToggleExpandSession(e.target.checked)}
            className="mt-0.5 shrink-0 accent-accent"
          />
          <span>
            {sessionExtra === 1
              ? t("duplicates.removeSessionOne", { n: sessionExtra })
              : t("duplicates.removeSessionOther", { n: sessionExtra })}
          </span>
        </label>
      )}

      <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-3 px-3 py-1.5">
        <button
          type="button"
          onClick={onIgnore}
          aria-label={t("duplicates.ignoreAria")}
          className="inline-flex cursor-pointer items-center gap-1 rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-danger hover:text-danger"
        >
          <Ban size={12} aria-hidden focusable={false} />
          {t("duplicates.ignore")}
        </button>
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

// The matched transaction plus the bank rows immediately before and
// after it on this account, with balances — so the user can see at a
// glance whether the running balance flows cleanly through the matched
// row (it belongs here) or jumps over it (a foreign mis-import). Newest
// first (descending), matching the bank-history viewer. When the finder
// has judged this account's copy off-chain (`fits === false`), the
// matched row's balance is flagged red — that is the figure that doesn't
// reconcile. This is the manual counterpart to the balance-continuity
// heuristic the finder uses to pre-select the owner.
function ContextPanel({
  account,
  accountId,
  entries,
  targetId,
  fits,
  settings,
  lang,
  t,
}: {
  account: Account | undefined;
  accountId: string;
  entries: HistoryEntry[];
  targetId: string;
  fits: boolean | null;
  settings: Settings;
  lang: ReturnType<typeof useLang>;
  t: ReturnType<typeof useT>;
}) {
  const ctx = historyContext(entries, targetId);
  return (
    <div className="flex flex-col gap-1">
      {account ? (
        <AccountChip account={account} />
      ) : (
        <span className="text-xs text-muted">{accountId}</span>
      )}
      {ctx === null ? (
        <p className="px-1 text-xs text-muted">{t("duplicates.contextNone")}</p>
      ) : (
        <div className="divide-y divide-line rounded border border-line">
          {ctx.after && (
            <ContextRow entry={ctx.after} settings={settings} lang={lang} />
          )}
          <ContextRow
            entry={ctx.target}
            settings={settings}
            lang={lang}
            highlight
            highlightLabel={t("duplicates.contextThisEntry")}
            balanceError={fits === false}
            balanceErrorLabel={t("duplicates.balanceError")}
          />
          {ctx.before && (
            <ContextRow entry={ctx.before} settings={settings} lang={lang} />
          )}
        </div>
      )}
    </div>
  );
}

// One bank-history row in the context panel: date, description, signed
// amount, and the running balance the bank reported after it. The
// matched transaction is highlighted with an accent strip so it stands
// out between its neighbours; `balanceError` renders its balance as a red
// warning pill when that figure doesn't sit on the account's chain.
function ContextRow({
  entry,
  settings,
  lang,
  highlight,
  highlightLabel,
  balanceError,
  balanceErrorLabel,
}: {
  entry: HistoryEntry;
  settings: Settings;
  lang: ReturnType<typeof useLang>;
  highlight?: boolean;
  highlightLabel?: string;
  balanceError?: boolean;
  balanceErrorLabel?: string;
}) {
  const hasBalance = typeof entry.balance === "number";
  return (
    <div
      aria-label={highlight ? highlightLabel : undefined}
      className={`flex items-baseline gap-2 px-2 py-1 text-xs ${
        highlight ? "border-l-2 border-l-accent bg-accent/10" : ""
      }`}
    >
      <span className="shrink-0 font-mono text-muted">
        {formatShortDate(entry.date, settings.shortDateFormat, lang)}
      </span>
      <span className="min-w-0 flex-1 truncate text-fg">
        {entry.description || "—"}
      </span>
      <span
        className={`shrink-0 font-mono tabular-nums ${
          entry.amount < 0 ? "text-negative" : "text-positive"
        }`}
      >
        {formatBalance(entry.amount, settings)}
      </span>
      {balanceError && hasBalance ? (
        <span className="flex w-24 shrink-0 justify-end">
          <span
            aria-label={balanceErrorLabel}
            className="inline-flex items-center gap-1 rounded-full border border-danger bg-danger/10 px-1.5 font-mono tabular-nums text-danger"
          >
            <AlertTriangle size={10} aria-hidden focusable={false} />
            {formatBalance(entry.balance as number, settings)}
          </span>
        </span>
      ) : (
        <span className="w-24 shrink-0 text-right font-mono tabular-nums text-muted">
          {typeof entry.balance === "number"
            ? formatBalance(entry.balance, settings)
            : "—"}
        </span>
      )}
    </div>
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
