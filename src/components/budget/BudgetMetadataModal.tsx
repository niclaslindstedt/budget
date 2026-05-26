import { useCallback, useEffect, useMemo, useState } from "react";
import { Tags } from "lucide-react";

import { resolveEntryLabels } from "../../data/sheet";
import { bcp47, type Lang } from "../../i18n/locale";
import { useLang, useT } from "../../i18n";
import type {
  Category,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Settings,
} from "../../data/types";
import { formatBalance, formatShortDate } from "../../utils/format";
import { Button, ClearableTextInput } from "../form";
import { Modal } from "../Modal";
import { TypePicker } from "../TypePicker";

// "Metadata mode" — a focused walk through the history entries that
// still need a custom description or a type. Reached from the budget
// page's `…` menu. One entry at a time, biggest absolute amount first,
// newest month first. Mirror-image of `FindConflictsModal`'s
// step-through cleanup pattern but scoped to per-entry annotation
// rather than de-duplication.
//
// "Needs metadata" is `resolveEntryLabels` (the same resolver the
// synthesized history row reads) returning either no type at all OR
// description equal to the raw bank text — i.e. nothing has been said
// about this entry by an override, a match rule, or a merchant hint.
// Entries that the budget UI already hides (`hidden`,
// `collapsedIntoTransferId`, `isTransfer`) are excluded, as are
// entries with `splits` because the single-row picker doesn't apply.

type Props = {
  open: boolean;
  onClose: () => void;
  // Account whose history is being walked. `null` (unlinked budget)
  // disables the mode — there's nothing to annotate.
  accountId: string | null;
  // Bank-imported entries for `accountId`. Same set the budget page
  // already receives as a prop.
  entries: readonly HistoryEntry[];
  merchantHints: Readonly<Record<string, MerchantHint>>;
  matchRules: readonly MatchRule[];
  types: readonly EntryType[];
  categories: readonly Category[];
  settings: Settings;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onUpdateHistoryEntry: (
    accountId: string,
    entryId: string,
    patch: { userDescription?: string; userTypeId?: string | null },
  ) => void;
};

const monthFormatCache = new Map<Lang, Intl.DateTimeFormat>();

function monthFormatFor(lang: Lang): Intl.DateTimeFormat {
  let fmt = monthFormatCache.get(lang);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(bcp47(lang), {
      month: "long",
      year: "numeric",
    });
    monthFormatCache.set(lang, fmt);
  }
  return fmt;
}

function formatMonthKey(key: string, lang: Lang): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return monthFormatFor(lang).format(new Date(y, m - 1, 1));
}

function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

function entryNeedsMetadata(
  entry: HistoryEntry,
  hints: Readonly<Record<string, MerchantHint>>,
  rules: readonly MatchRule[],
): boolean {
  if (entry.hidden) return false;
  if (entry.collapsedIntoTransferId) return false;
  if (entry.isTransfer) return false;
  if (entry.splits && entry.splits.length > 0) return false;
  const resolved = resolveEntryLabels(entry, hints, rules);
  return resolved.typeId === null || resolved.description === entry.description;
}

export function BudgetMetadataModal({
  open,
  onClose,
  accountId,
  entries,
  merchantHints,
  matchRules,
  types,
  categories,
  settings,
  onCreateType,
  onCreateCategory,
  onUpdateHistoryEntry,
}: Props) {
  const t = useT();
  const lang = useLang();
  // Session-only skip set — closing the modal clears it. Persisting
  // would mean "never ask again", which is not the intent: skipping
  // is just "not now, ask later".
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!open) setSkipped(new Set());
  }, [open]);

  // Queue is derived from props every render — saving an entry makes
  // it resolve and fall out naturally on the next render.
  const queue = useMemo(() => {
    const filtered = entries.filter(
      (e) =>
        !skipped.has(e.id) && entryNeedsMetadata(e, merchantHints, matchRules),
    );
    filtered.sort((a, b) => {
      const monthA = monthKeyOf(a.date);
      const monthB = monthKeyOf(b.date);
      if (monthA !== monthB) return monthB.localeCompare(monthA);
      const absDiff = Math.abs(b.amount) - Math.abs(a.amount);
      if (absDiff !== 0) return absDiff;
      return a.id.localeCompare(b.id);
    });
    return filtered;
  }, [entries, merchantHints, matchRules, skipped]);

  const current = queue[0] ?? null;
  const currentMonth = current ? monthKeyOf(current.date) : null;
  const monthRemaining = currentMonth
    ? queue.filter((e) => monthKeyOf(e.date) === currentMonth).length
    : 0;
  const monthTotal = useMemo(() => {
    if (!currentMonth) return 0;
    let n = 0;
    for (const e of entries) {
      if (monthKeyOf(e.date) !== currentMonth) continue;
      if (entryNeedsMetadata(e, merchantHints, matchRules)) n += 1;
    }
    return n;
  }, [entries, merchantHints, matchRules, currentMonth]);
  const monthIndex = monthTotal > 0 ? monthTotal - monthRemaining + 1 : 0;

  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);

  // Reset the form when the current entry changes — either because the
  // user saved/skipped, or because the modal just opened on a fresh
  // first entry.
  useEffect(() => {
    setDescription("");
    setTypeId(null);
  }, [current?.id]);

  const handleSkip = useCallback(() => {
    if (!current) return;
    setSkipped((prev) => {
      const next = new Set(prev);
      next.add(current.id);
      return next;
    });
  }, [current]);

  const handleSave = useCallback(() => {
    if (!current || !accountId) return;
    const trimmed = description.trim();
    const patch: { userDescription?: string; userTypeId?: string | null } = {};
    if (trimmed !== "") patch.userDescription = trimmed;
    if (typeId !== null) patch.userTypeId = typeId;
    if (patch.userDescription === undefined && patch.userTypeId === undefined) {
      return;
    }
    onUpdateHistoryEntry(accountId, current.id, patch);
  }, [accountId, current, description, typeId, onUpdateHistoryEntry]);

  const canSave =
    !!accountId && !!current && (typeId !== null || description.trim() !== "");

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="metadata-mode-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<Tags size={14} aria-hidden focusable={false} />}
        title={t("metadata.title")}
        onClose={onClose}
      />
      <Modal.Body>
        {current === null ? (
          <div className="rounded border border-line bg-surface-2 px-3 py-6 text-center">
            <p className="text-sm text-fg">{t("metadata.allCaught")}</p>
            <p className="mt-1 text-xs text-muted">
              {t("metadata.allCaughtHint")}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
              {t("metadata.progress", {
                month: formatMonthKey(currentMonth ?? "", lang),
                index: monthIndex,
                total: monthTotal,
              })}
            </p>
            <fieldset className="mb-4 flex flex-col gap-1.5 rounded border border-line bg-surface-3 p-3">
              <legend className="px-1 text-xs text-muted">
                {t("metadata.fromBank")}
              </legend>
              <div className="flex flex-wrap items-baseline gap-2 text-xs">
                <span className="font-mono text-muted">
                  {formatShortDate(
                    current.date,
                    settings.shortDateFormat,
                    lang,
                  )}
                </span>
                <span
                  className={`font-mono tabular-nums ${
                    current.amount < 0 ? "text-negative" : "text-positive"
                  }`}
                >
                  {formatBalance(current.amount, settings)}
                </span>
              </div>
              <p className="font-mono text-sm break-words whitespace-pre-wrap text-fg">
                {current.description || "—"}
              </p>
            </fieldset>
            <div className="grid gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("metadata.typeLabel")}
                </span>
                <TypePicker
                  variant="field"
                  types={types}
                  categories={categories}
                  selectedId={typeId}
                  onSelect={setTypeId}
                  onCreate={onCreateType}
                  onCreateCategory={onCreateCategory}
                  amountSign={current.amount < 0 ? "negative" : "positive"}
                />
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("metadata.descriptionLabel")}
                </span>
                <ClearableTextInput
                  value={description}
                  onValueChange={setDescription}
                  placeholder={
                    current.description || t("metadata.descriptionPlaceholder")
                  }
                  className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                />
                <span className="text-xs text-muted">
                  {t("metadata.descriptionHint")}
                </span>
              </label>
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {current === null ? (
          <Button variant="primary" onClick={onClose}>
            {t("common.close")}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleSkip}>
              {t("metadata.skip")}
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={!canSave}>
              {t("metadata.save")}
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
