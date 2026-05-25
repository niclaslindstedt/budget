import type { LucideIcon } from "lucide-react";
import {
  Check,
  ChevronDown,
  Compass,
  Lock as LockIcon,
  Sprout,
  Trophy,
  Wand2,
  Workflow,
} from "lucide-react";

import {
  ACHIEVEMENTS,
  type Achievement,
  type AchievementTier,
  TIER_POINTS,
} from "../data/achievements";
import { useT, type MessageKey, type TFunction } from "../i18n";
import { Modal } from "./Modal";

// Live, in-app view of the achievement catalog. Mounted from
// AppShell and opened via the empty (outline) header star — same
// surface the filled star uses to open the unlock toast, but for
// browsing the whole list instead of just the new ones. Reads
// `data.settings.achievements` straight from React state (passed in
// from AppShell's `useUserDataStorage`), so there's no localStorage
// scraping and the modal stays correct under any storage backend
// (cloud, encrypted, folder, mirror) — the previous standalone
// `/achievements` page sat outside the React tree and could only
// read plaintext local buckets.

type UnlockedMap = Record<string, number>;

const TIER_ORDER: readonly AchievementTier[] = [
  "beginner",
  "intermediate",
  "pro",
  "expert",
];

const TIER_GLYPH: Record<AchievementTier, LucideIcon> = {
  beginner: Sprout,
  intermediate: Compass,
  pro: Workflow,
  expert: Wand2,
};

type Props = {
  open: boolean;
  onClose: () => void;
  unlocked: UnlockedMap;
};

export function AchievementsModal({ open, onClose, unlocked }: Props) {
  const t = useT();

  const totalPoints = Object.keys(unlocked).reduce((sum, id) => {
    const ach = ACHIEVEMENTS.find((a) => a.id === id);
    return ach ? sum + TIER_POINTS[ach.tier] : sum;
  }, 0);
  const maxPoints = ACHIEVEMENTS.reduce(
    (sum, a) => sum + TIER_POINTS[a.tier],
    0,
  );
  const unlockedCount = Object.keys(unlocked).filter((id) =>
    ACHIEVEMENTS.some((a) => a.id === id),
  ).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="achievements-modal-title"
      size="max-w-2xl"
    >
      <Modal.Header
        title={t("achievements.modal.title")}
        icon={<Trophy size={14} aria-hidden focusable={false} />}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-8 text-sm leading-relaxed">
          <header className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border border-flag bg-flag/15 text-flag">
              <Trophy
                size={20}
                aria-hidden
                focusable={false}
                fill="currentColor"
              />
            </span>
            <p className="flex-1 text-xs text-muted">
              {t("achievements.modal.counter", {
                unlocked: unlockedCount,
                total: ACHIEVEMENTS.length,
                earned: totalPoints,
                max: maxPoints,
              })}
            </p>
          </header>

          <p>{t("achievements.modal.intro")}</p>

          {TIER_ORDER.map((tier) => (
            <TierSection
              key={tier}
              tier={tier}
              t={t}
              unlocked={unlocked}
              achievements={ACHIEVEMENTS.filter((a) => a.tier === tier)}
            />
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded border border-accent bg-accent/15 px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
        >
          {t("achievements.modal.close")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

function TierSection({
  tier,
  achievements,
  unlocked,
  t,
}: {
  tier: AchievementTier;
  achievements: readonly Achievement[];
  unlocked: UnlockedMap;
  t: TFunction;
}) {
  const Icon = TIER_GLYPH[tier];
  const points = TIER_POINTS[tier];
  const tierMax = achievements.length * points;
  const tierEarned =
    achievements.filter((a) => unlocked[a.id] !== undefined).length * points;
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line bg-surface-2 text-pipe">
          <Icon size={18} aria-hidden focusable={false} />
        </span>
        <div className="flex flex-col">
          <h3 className="text-base font-bold tracking-wide text-fg-bright">
            {t(`achievements.modal.tier.${tier}.title` as MessageKey)}{" "}
            <span className="text-xs font-normal text-muted">
              {t("achievements.modal.tierPoints", {
                earned: tierEarned,
                max: tierMax,
              })}
            </span>
          </h3>
          <p className="text-xs text-muted">
            {t(`achievements.modal.tier.${tier}.subtitle` as MessageKey)}
          </p>
        </div>
      </header>
      <div className="flex flex-col gap-2">
        {achievements.map((ach) => (
          <AchievementRow
            key={ach.id}
            achievement={ach}
            unlockedAt={unlocked[ach.id]}
            t={t}
          />
        ))}
      </div>
      <blockquote className="mt-2 border-l-2 border-pipe bg-surface-2 px-3 py-2 text-xs text-fg">
        <span className="font-bold text-fg-bright">
          {t("achievements.modal.tierMasteredWhen")}
        </span>{" "}
        {t(`achievements.modal.tier.${tier}.graduation` as MessageKey)}
      </blockquote>
    </section>
  );
}

function AchievementRow({
  achievement,
  unlockedAt,
  t,
}: {
  achievement: Achievement;
  unlockedAt: number | undefined;
  t: TFunction;
}) {
  const Icon = achievement.glyph;
  const isUnlocked = unlockedAt !== undefined;
  const points = TIER_POINTS[achievement.tier];
  const name = t(`achievements.catalog.${achievement.id}.name` as MessageKey);
  const condition = t(
    `achievements.catalog.${achievement.id}.condition` as MessageKey,
  );
  const learnMore = achievement.hasLearnMore
    ? t(`achievements.catalog.${achievement.id}.learnMore` as MessageKey)
    : null;
  return (
    <details
      className={
        isUnlocked
          ? "group rounded border border-line bg-surface px-3 py-2 open:bg-surface-2"
          : "group rounded border border-line bg-surface/60 px-3 py-2 open:bg-surface-2"
      }
    >
      <summary className="flex cursor-pointer list-none items-start gap-2">
        <span
          className={
            isUnlocked
              ? "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-flag bg-flag/15 text-flag"
              : "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-surface-2 text-muted"
          }
          aria-label={isUnlocked ? undefined : t("achievements.modal.locked")}
        >
          {isUnlocked ? (
            <Icon size={14} aria-hidden focusable={false} />
          ) : (
            <LockIcon size={12} aria-hidden focusable={false} />
          )}
        </span>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={
                isUnlocked
                  ? "text-sm font-bold text-fg-bright"
                  : "text-sm font-bold text-muted"
              }
            >
              {name}
            </span>
            <span className="text-xs text-meta">+{points}</span>
            {isUnlocked && (
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <Check size={12} aria-hidden focusable={false} />
              </span>
            )}
          </div>
          <p className={isUnlocked ? "text-xs text-fg" : "text-xs text-muted"}>
            {condition}
          </p>
          {learnMore ? (
            <span className="ml-0 inline-flex items-center gap-1 text-xs text-link group-open:hidden">
              {t("achievements.modal.learnMore")}
              <ChevronDown size={12} aria-hidden focusable={false} />
            </span>
          ) : null}
        </div>
      </summary>
      {learnMore ? (
        <div className="ml-8 mt-2 text-muted">{learnMore}</div>
      ) : null}
    </details>
  );
}
