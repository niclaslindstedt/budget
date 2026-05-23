import { expect, signInAsGuest, test } from "../fixtures";

// Regression: achievements unlocked during sign-in (and any other
// flow that fires `unlock()` from outside BudgetView's subtree) never
// reached localStorage, so the standalone /achievements page rendered
// 0/63 even when the in-app star had shown an unlock modal moments
// before. Two effects raced on first mount:
//
//   1. `useAchievementWatcher` drained the bus and dispatched
//      `recordAchievementUnlock`, adding the id to
//      `state.settings.achievements`.
//   2. `useChangelogAutoOpen` dispatched `updateSettings` with a
//      `settingsRef.current` captured from the initial render — its
//      `achievements` was still `{}`. The reducer treated that as a
//      full settings replacement and wiped the unlock from (1).
//
// Fixed by preserving `settings.achievements` and
// `settings.unseenAchievements` across the `updateSettings` reducer
// case: those fields have their own dispatch actions and must not
// regress because a concurrent caller passed a stale settings blob.

test("guest sign-in persists the `localHero` unlock past the changelog auto-stamp", async ({
  page,
}) => {
  await signInAsGuest(page);
  // Give the autosave debounce a moment to flush.
  await page.waitForTimeout(500);

  const persisted = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.includes(".user.")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as {
          settings?: {
            achievements?: Record<string, number>;
            unseenAchievements?: string[];
          };
        };
        return {
          achievements: parsed.settings?.achievements ?? null,
          unseen: parsed.settings?.unseenAchievements ?? null,
        };
      } catch {
        return null;
      }
    }
    return null;
  });

  expect(persisted).not.toBeNull();
  expect(persisted!.achievements).toMatchObject({
    localHero: expect.any(Number),
  });
  expect(persisted!.unseen).toContain("localHero");
});
