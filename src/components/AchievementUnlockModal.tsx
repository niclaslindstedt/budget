import { Trophy, X } from "lucide-react";

import { ACHIEVEMENT_BY_ID, TIER_POINTS } from "../data/achievements";
import { useT, type MessageKey } from "../i18n";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  unseenIds: readonly string[];
  onClose: () => void;
};

// Pops up when the user clicks the filled yellow star in the
// header. Lists every unlock the user hasn't acknowledged yet, in
// the order they were queued. Closing the modal — via the X, the
// backdrop, or the "Awesome!" button — calls `onClose`, which is
// expected to dispatch `clearUnseenAchievements` so the star
// empties out.
//
// `centered` + `scrollableBody={false}` per the Modal conventions
// in AGENTS.md: the body has no text inputs (no soft-keyboard
// concern) and is short enough not to want a sticky footer.
export function AchievementUnlockModal({ open, unseenIds, onClose }: Props) {
  const t = useT();
  const items = unseenIds
    .map((id) => ACHIEVEMENT_BY_ID.get(id))
    .filter((a): a is NonNullable<typeof a> => a !== undefined);
  if (items.length === 0) return null;
  const title =
    items.length === 1
      ? t("achievements.unlockModal.titleOne")
      : t("achievements.unlockModal.titleOther", { n: String(items.length) });

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="achievement-unlock-title"
      size="max-w-md"
      scrollableBody={false}
      centered
    >
      <header className="flex items-center gap-2 border-b border-line bg-surface-3 px-4 py-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-flag/20 text-flag">
          <Trophy size={16} aria-hidden focusable={false} fill="currentColor" />
        </span>
        <h2
          id="achievement-unlock-title"
          className="flex-1 text-sm font-bold tracking-wide text-fg-bright"
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X size={18} aria-hidden focusable={false} />
        </button>
      </header>
      <div className="flex max-h-[60svh] flex-col gap-2 overflow-y-auto px-4 py-3">
        {items.map((ach) => {
          const Icon = ach.glyph;
          const name = t(`achievements.catalog.${ach.id}.name` as MessageKey);
          const condition = t(
            `achievements.catalog.${ach.id}.condition` as MessageKey,
          );
          return (
            <article
              key={ach.id}
              className="flex items-start gap-3 rounded border border-line bg-surface-2 px-3 py-2"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-flag bg-flag/15 text-flag">
                <Icon size={18} aria-hidden focusable={false} />
              </span>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-fg-bright">
                    {name}
                  </span>
                  <span className="text-xs text-meta">
                    +{TIER_POINTS[ach.tier]}
                  </span>
                </div>
                <p className="text-xs text-muted">{condition}</p>
              </div>
            </article>
          );
        })}
      </div>
      <footer className="flex shrink-0 items-center justify-end border-t border-line bg-surface-3 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded border border-accent bg-accent/15 px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
        >
          {t("achievements.unlockModal.dismiss")}
        </button>
      </footer>
    </Modal>
  );
}
