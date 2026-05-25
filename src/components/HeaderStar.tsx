import { Star } from "lucide-react";

import { useT } from "../i18n";

type Props = {
  unseenCount: number;
  onOpenList: () => void;
  onOpenUnlockModal: () => void;
};

// Slots into the header flex row to the left of SaveStateButton /
// SyncStatus. Two visual modes:
//
// - **Empty (outline)** — the user has no pending unlocks. Click
//   navigates to the achievements list page (the rebranded
//   `/system` page).
// - **Filled (yellow)** — one or more achievements have unlocked
//   since the user last opened the unlock modal. Click opens the
//   modal, which on close dispatches `clearUnseenAchievements` and
//   the star returns to its empty state.
//
// Styled to match `SaveStateButton` / `SyncStatus` so the header
// chrome stays uniform: 36 × 36 button, 18-pixel icon, border that
// echoes the accent or muted tone of its sibling buttons.
export function HeaderStar({
  unseenCount,
  onOpenList,
  onOpenUnlockModal,
}: Props) {
  const t = useT();
  const filled = unseenCount > 0;
  const label = filled
    ? unseenCount === 1
      ? t("achievements.star.unseenOne")
      : t("achievements.star.unseenOther", { n: String(unseenCount) })
    : t("achievements.star.openList");
  return (
    <button
      type="button"
      onClick={filled ? onOpenUnlockModal : onOpenList}
      aria-label={label}
      title={label}
      className={
        filled
          ? "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-flag bg-flag/15 text-flag hover:bg-flag/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          : "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-line bg-transparent text-muted hover:border-fg hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
      }
    >
      <Star
        size={18}
        aria-hidden
        focusable={false}
        fill={filled ? "currentColor" : "none"}
      />
    </button>
  );
}
