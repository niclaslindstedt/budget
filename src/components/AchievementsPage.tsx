import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
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

// Last meaningful change to the page's chrome / catalog presentation
// below. The catalog itself lives in `src/data/achievements/catalog.ts`
// and tracks freshness through git; this date moves only when the
// shell or layout changes meaningfully.
const LAST_UPDATED = "2026-05-22";

type UnlockedMap = Record<string, number>;

type TierKey = AchievementTier;

const TIER_ORDER: readonly TierKey[] = [
  "beginner",
  "intermediate",
  "pro",
  "expert",
];

const TIER_META: Record<
  TierKey,
  { glyph: LucideIcon; title: string; subtitle: string; graduation: string }
> = {
  beginner: {
    glyph: Sprout,
    title: "Beginner",
    subtitle: "You just opened the app. What do you do?",
    graduation:
      "Rows go in, they're labelled, you trust they're saved, and you can find your way around without thinking.",
  },
  intermediate: {
    glyph: Compass,
    title: "Intermediate",
    subtitle: "You want this to reflect your real finances.",
    graduation:
      "Every sheet maps to a real account, recurring entries cover your fixed costs, and your categories match how you actually think about spending.",
  },
  pro: {
    glyph: Workflow,
    title: "Pro",
    subtitle: "Stop typing things the bank already knows.",
    graduation:
      "New bank exports import in seconds and label themselves, your data is encrypted on a cloud you control, and you've stopped keeping a separate manual copy on the side.",
  },
  expert: {
    glyph: Wand2,
    title: "Expert",
    subtitle: "Bend the app to your exact situation.",
    graduation: "The app does what you want, not what its defaults assumed.",
  },
};

// The achievements page reads the user's unlocked map from
// `localStorage` lazily on mount. The runtime renders the page
// outside the App tree (it's a separate path served as its own
// HTML entrypoint, see `src/main.tsx`), so it doesn't have access
// to the React-managed `useUserDataStorage` state. Reading the raw
// bytes is enough — we just need the unlock map and the
// timestamps, no mutation. Encrypted-at-rest buckets show as fully
// locked, which is fine: those users can still see the catalog
// while signed out.
function readUnlockedFromStorage(): UnlockedMap {
  if (typeof window === "undefined") return {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith("budget.")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const settings = extractSettings(parsed);
        if (settings && typeof settings.achievements === "object") {
          const map = settings.achievements as Record<string, unknown>;
          const out: UnlockedMap = {};
          for (const [id, ts] of Object.entries(map)) {
            if (typeof ts === "number" && Number.isFinite(ts) && ts > 0) {
              out[id] = ts;
            }
          }
          if (Object.keys(out).length > 0) return out;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // localStorage unavailable.
  }
  return {};
}

function extractSettings(parsed: unknown): { achievements?: unknown } | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.settings === "object" && obj.settings !== null) {
    return obj.settings as { achievements?: unknown };
  }
  if (typeof obj.data === "object" && obj.data !== null) {
    return extractSettings(obj.data);
  }
  return null;
}

export function AchievementsPage() {
  const [unlocked, setUnlocked] = useState<UnlockedMap>({});
  useEffect(() => {
    setUnlocked(readUnlockedFromStorage());
  }, []);

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
    <div className="min-h-dvh bg-page-bg px-4 py-10 text-fg">
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-8 text-sm leading-relaxed">
        <header className="flex flex-col gap-3">
          <a
            href={import.meta.env.BASE_URL}
            className="inline-flex items-center gap-1.5 self-start text-xs text-link hover:underline"
          >
            <ArrowLeft size={14} aria-hidden focusable={false} />
            Back to budget
          </a>
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border border-flag bg-flag/15 text-flag">
              <Trophy
                size={20}
                aria-hidden
                focusable={false}
                fill="currentColor"
              />
            </span>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-fg-bright">Achievements</h1>
              <p className="text-xs text-muted">
                {unlockedCount} of {ACHIEVEMENTS.length} unlocked ·{" "}
                {totalPoints} / {maxPoints} pts
              </p>
            </div>
          </div>
          <p className="text-xs text-muted">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="flex flex-col gap-2">
          <p>
            Every feature in the app is an achievement. Do the thing once and it
            unlocks — forward-going only, your past usage doesn't pre-fill the
            list. Four tiers, from <em>just opened the app</em> to{" "}
            <em>bending it to your situation</em>. Pick whichever tier is next
            for you.
          </p>
        </section>

        {TIER_ORDER.map((tier) => (
          <TierSection
            key={tier}
            tier={tier}
            unlocked={unlocked}
            achievements={ACHIEVEMENTS.filter((a) => a.tier === tier)}
          />
        ))}
      </article>
    </div>
  );
}

function TierSection({
  tier,
  achievements,
  unlocked,
}: {
  tier: TierKey;
  achievements: readonly Achievement[];
  unlocked: UnlockedMap;
}) {
  const meta = TIER_META[tier];
  const Icon = meta.glyph;
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
          <h2 className="text-base font-bold tracking-wide text-fg-bright">
            {meta.title}{" "}
            <span className="text-xs font-normal text-muted">
              · {tierEarned} / {tierMax} pts
            </span>
          </h2>
          <p className="text-xs text-muted">{meta.subtitle}</p>
        </div>
      </header>
      <div className="flex flex-col gap-2">
        {achievements.map((ach) => (
          <AchievementRow
            key={ach.id}
            achievement={ach}
            unlockedAt={unlocked[ach.id]}
          />
        ))}
      </div>
      <blockquote className="mt-2 border-l-2 border-pipe bg-surface-2 px-3 py-2 text-xs text-fg">
        <span className="font-bold text-fg-bright">Tier mastered when:</span>{" "}
        {meta.graduation}
      </blockquote>
    </section>
  );
}

function AchievementRow({
  achievement,
  unlockedAt,
}: {
  achievement: Achievement;
  unlockedAt: number | undefined;
}) {
  const Icon = achievement.glyph;
  const isUnlocked = unlockedAt !== undefined;
  const points = TIER_POINTS[achievement.tier];
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
              {achievement.name}
            </span>
            <span className="text-xs text-meta">+{points}</span>
            {isUnlocked && (
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <Check size={12} aria-hidden focusable={false} />
              </span>
            )}
          </div>
          <p className={isUnlocked ? "text-xs text-fg" : "text-xs text-muted"}>
            {achievement.condition}
          </p>
          {achievement.learnMore ? (
            <span className="ml-0 inline-flex items-center gap-1 text-xs text-link group-open:hidden">
              Learn more
              <ChevronDown size={12} aria-hidden focusable={false} />
            </span>
          ) : null}
        </div>
      </summary>
      {achievement.learnMore ? (
        <div className="ml-8 mt-2 text-muted">{achievement.learnMore}</div>
      ) : null}
    </details>
  );
}
