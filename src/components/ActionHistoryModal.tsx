import { useEffect, useMemo, useRef } from "react";
import { CornerDownRight, History } from "lucide-react";

import { useLang, useT } from "../i18n";
import { bcp47, type Lang } from "../i18n/locale";
import type { ActionHistoryEntry } from "../storage/useUserDataStorage";
import { formatActionLabel } from "./action-history-label";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  entries: readonly ActionHistoryEntry[];
  currentIndex: number;
  onJump: (index: number) => void;
};

// Lists every state the budget has been in since the last load, with
// the dispatched action's type and timestamp. Newest first so the
// user lands on the most recent activity the way they'd scan a log.
// Entries past `currentIndex` are "future" — they show greyed but
// remain clickable so the user can redo into them. They stay around
// until a new mutating action is dispatched, which truncates them.
export function ActionHistoryModal({
  open,
  onClose,
  entries,
  currentIndex,
  onJump,
}: Props) {
  const t = useT();
  const lang = useLang();
  const timeFormatter = useMemo(() => formatterFor(lang), [lang]);

  // Auto-scroll the current entry into view when the modal opens —
  // long timelines might push it off-screen otherwise.
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      "[data-history-current='true']",
    );
    node?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [open]);

  // Render newest-first (highest index at the top). Past entries
  // (index < currentIndex) come below the current row; future entries
  // (index > currentIndex) sit above it, greyed but clickable.
  const ordered = useMemo(() => {
    return entries.map((entry, index) => ({ entry, index })).reverse();
  }, [entries]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="action-history-modal-title"
      centered
    >
      <Modal.Header
        icon={<History size={14} aria-hidden focusable={false} />}
        title={t("actionHistory.title")}
        onClose={onClose}
      />
      <Modal.Body noPadding>
        <ol ref={listRef} className="flex flex-col">
          {ordered.map(({ entry, index }) => {
            const isCurrent = index === currentIndex;
            const isFuture = index > currentIndex;
            const label = formatActionLabel(t, entry.actionType, entry.subject);
            const timeText = timeFormatter.format(new Date(entry.timestamp));
            const baseClass =
              "flex w-full cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 text-left text-sm transition-colors sm:px-4";
            const stateClass = isCurrent
              ? "bg-surface-2 text-fg-bright"
              : isFuture
                ? "text-muted opacity-50 hover:bg-surface-2 hover:opacity-75"
                : "text-fg hover:bg-surface-2";
            const tooltip = isCurrent
              ? t("actionHistory.current")
              : isFuture
                ? t("actionHistory.jumpForward")
                : t("actionHistory.jumpBack");
            return (
              <li key={index}>
                <button
                  type="button"
                  data-history-current={isCurrent ? "true" : undefined}
                  onClick={() => onJump(index)}
                  disabled={isCurrent}
                  aria-current={isCurrent ? "true" : undefined}
                  aria-label={`${label} — ${timeText}`}
                  title={tooltip}
                  className={`${baseClass} ${stateClass} disabled:cursor-default`}
                >
                  <span
                    aria-hidden
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${
                      isCurrent ? "text-accent" : "text-muted"
                    }`}
                  >
                    {isCurrent ? (
                      <CornerDownRight size={14} focusable={false} />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <span className="flex-1 truncate">{label}</span>
                  <span
                    className={`shrink-0 font-mono text-xs ${
                      isCurrent ? "text-meta" : "text-muted"
                    }`}
                  >
                    {timeText}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded bg-accent px-3 py-1.5 text-sm font-medium text-page-bg hover:opacity-90"
        >
          {t("common.close")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

const timeFormatterCache = new Map<Lang, Intl.DateTimeFormat>();

function formatterFor(lang: Lang): Intl.DateTimeFormat {
  let f = timeFormatterCache.get(lang);
  if (!f) {
    f = new Intl.DateTimeFormat(bcp47(lang), {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    timeFormatterCache.set(lang, f);
  }
  return f;
}
