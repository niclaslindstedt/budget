import { expect, signInAsGuest, test } from "../fixtures";

// Regression: achievements unlocked during sign-in (and any other
// flow that fires `unlock()` from outside AppShell's subtree) never
// reached on-disk storage, so the achievements modal rendered 0/63
// even when the in-app star had shown an unlock modal moments before.
// Two distinct races contribute and both have to stay fixed:
//
//   1. `useChangelogAutoOpen` once dispatched `updateSettings` with a
//      `settingsRef.current` captured from the initial render — its
//      `achievements` was still `{}`. The reducer treated that as a
//      full settings replacement and wiped any unlock the watcher
//      had just landed. Fixed by preserving
//      `settings.achievements` / `settings.unseenAchievements`
//      across `updateSettings` / `updateCommonSettings` so concurrent
//      writers can't regress the unlock state.
//
//   2. With the user-data bucket now in IndexedDB (async load), the
//      async `adapter.load()` resolved after the auth handler had
//      already fired `unlock("localHero")` and the watcher had
//      dispatched `recordAchievementUnlock`. On an empty bucket the
//      loader used to `setData(freshUserData())`, which wiped the
//      just-landed unlock. Fixed by leaving in-memory state alone on
//      the initial async load when no bytes are on disk.
//
// The assertion below reads the persisted bytes out of the IDB
// `userData` store so it catches a regression on either path: if the
// unlock never reaches state, or if the state never reaches disk,
// `achievements.localHero` is missing.
//
// The bytes on disk are gzip-wrapped by `withCompression` (the
// `budget.gz1:` envelope from `src/storage/compression.ts`), so the
// reader below gunzips that envelope — via the same `DecompressionStream`
// the app uses — before parsing the JSON. A legacy uncompressed payload
// (no prefix) is parsed as-is.

test("guest sign-in persists the `localHero` unlock past the changelog auto-stamp", async ({
  page,
}) => {
  await signInAsGuest(page);
  // Give the autosave debounce a moment to flush.
  await page.waitForTimeout(500);

  const persisted = await page.evaluate(async () => {
    if (typeof indexedDB === "undefined") return null;
    if (typeof indexedDB.databases !== "function") return null;
    // Mirror `src/storage/compression.ts`: the userData bytes are a
    // base64 gzip envelope tagged with this prefix. Strip + gunzip it
    // here so the JSON.parse below sees plaintext; a payload without
    // the prefix is legacy uncompressed data and is returned as-is.
    const COMPRESSION_PREFIX = "budget.gz1:";
    const decodeText = async (text: string): Promise<string> => {
      if (!text.startsWith(COMPRESSION_PREFIX)) return text;
      const binary = atob(text.slice(COMPRESSION_PREFIX.length));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const stream = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      const buf = await new Response(stream).arrayBuffer();
      return new TextDecoder().decode(buf);
    };
    const dbs = await indexedDB.databases();
    for (const meta of dbs) {
      if (typeof meta.name !== "string") continue;
      if (!meta.name.startsWith("budget-data")) continue;
      const records = await new Promise<unknown[] | null>((resolve) => {
        const req = indexedDB.open(meta.name as string);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("userData")) {
            db.close();
            resolve(null);
            return;
          }
          const tx = db.transaction("userData", "readonly");
          const store = tx.objectStore("userData");
          const all = store.getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result as unknown[]);
          };
          all.onerror = () => {
            db.close();
            resolve(null);
          };
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      });
      if (!records || records.length === 0) continue;
      for (const record of records) {
        const text = (record as { text?: unknown }).text;
        if (typeof text !== "string") continue;
        try {
          const decoded = await decodeText(text);
          const parsed = JSON.parse(decoded) as {
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
          continue;
        }
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
