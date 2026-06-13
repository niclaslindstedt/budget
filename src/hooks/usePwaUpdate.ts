import { useSyncExternalStore } from "react";
import type { Workbox } from "workbox-window";

// Single source of truth for the PWA update lifecycle, shared by the
// `UpdateToast` (the "reload to apply" prompt) and the header "budget"
// wordmark (which fills gold from the bottom — like a glass of water —
// while a new build downloads). Both surfaces mount independently, so
// the registration and progress tracking live in a module singleton
// here rather than inside either component; the first subscriber starts
// it, and `useSyncExternalStore` fans the state out to all consumers.
//
// We register the service worker ourselves via `workbox-window` rather
// than vite-plugin-pwa's `useRegisterSW` virtual module — the hook's
// auto-injected register call doesn't forward `updateViaCache: "none"`
// to the browser, so an HTTP-cached `sw.js` can satisfy update checks
// indefinitely (the SW spec only forces a cache bypass once the cached
// SW is over 24h old). With `updateViaCache: "none"` every
// `reg.update()` re-fetches the SW script from the network.
//
// Update strategy stays "prompt": the new SW installs and parks in the
// `waiting` state, we flip `needRefresh` from the workbox `waiting`
// event, and the user clicks Reload at a moment of their choosing. We
// deliberately do NOT call `skipWaiting()` from the SW itself or set
// `clientsClaim` — the page would silently swap to new JS, breaking
// long-lived in-progress edits.
//
// Download progress: vite-plugin-pwa's generated SW precaches its
// assets during the `install` event, but workbox exposes no progress
// API. Instead we watch the shared precache Cache Storage from the
// window: each asset workbox finishes fetching lands in the cache, so
// summing the byte sizes (from the build-time `precache-manifest.json`)
// of the entries already present, against the manifest total, yields a
// real percentage. Content-hashed assets — the bulk of the bytes —
// change URL every build, so they only count once the new SW actually
// downloads them, which is what makes the fill track the real transfer.

export type PwaUpdateState = {
  // 0..100 while a new build is downloading or sitting ready; null when
  // idle (no update in flight). Drives the header wordmark fill.
  progress: number | null;
  // True once a new build has fully installed and is waiting to take
  // over. Drives the reload toast.
  needRefresh: boolean;
  // Version label of the incoming build (from `version.json`), or null
  // for a deploy predating that file / while offline.
  incomingVersion: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const POLL_MS = 200;

let state: PwaUpdateState = {
  progress: null,
  needRefresh: false,
  incomingVersion: null,
};
const listeners = new Set<() => void>();
let wb: Workbox | null = null;
let started = false;

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<PwaUpdateState>) {
  const next = { ...state, ...patch };
  if (
    next.progress === state.progress &&
    next.needRefresh === state.needRefresh &&
    next.incomingVersion === state.incomingVersion
  ) {
    return;
  }
  state = next;
  emit();
}

function cacheIdForBase(base: string): string {
  if (base === "/preview/") return "budget-preview";
  if (base === "/branch/") return "budget-branch";
  return "budget";
}

// The running bundle only knows its OWN version (`BUILD_LABEL`), which
// is the build the toast is upgrading AWAY from. The incoming build's
// version lives in `version.json`, deployed alongside the new SW; fetch
// it cache-bypassed so the still-active old SW lets the request reach
// the network and return the freshly-deployed file.
async function fetchIncomingVersion(base: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}version.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      data &&
      typeof data === "object" &&
      "version" in data &&
      typeof (data as { version: unknown }).version === "string"
    ) {
      return (data as { version: string }).version;
    }
    return null;
  } catch {
    return null;
  }
}

type PrecacheManifest = {
  totalBytes: number;
  assets: Record<string, number>;
};

async function fetchPrecacheManifest(
  base: string,
): Promise<PrecacheManifest | null> {
  try {
    const res = await fetch(`${base}precache-manifest.json`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      data &&
      typeof data === "object" &&
      "totalBytes" in data &&
      typeof (data as { totalBytes: unknown }).totalBytes === "number" &&
      "assets" in data &&
      typeof (data as { assets: unknown }).assets === "object"
    ) {
      return data as PrecacheManifest;
    }
    return null;
  } catch {
    return null;
  }
}

// Sum the manifest byte sizes of every precached asset already present
// in this slot's precache cache. Workbox names that cache
// `<cacheId>-precache-v2-<scope>`; entries are keyed by the request URL
// (with a `?__WB_REVISION__=` query for revisioned ones), so we compare
// by pathname to ignore the query and to ignore the other deploy slots'
// caches sharing this origin.
async function cachedBytes(
  cacheId: string,
  manifest: PrecacheManifest,
): Promise<number> {
  if (typeof caches === "undefined") return 0;
  const names = await caches.keys();
  const cacheName = names.find((n) => n.startsWith(`${cacheId}-precache`));
  if (!cacheName) return 0;
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();
  const present = new Set<string>();
  for (const req of requests) {
    try {
      present.add(new URL(req.url).pathname);
    } catch {
      // Ignore unparseable cache keys.
    }
  }
  let bytes = 0;
  for (const [path, size] of Object.entries(manifest.assets)) {
    if (present.has(path)) bytes += size;
  }
  return bytes;
}

// While the incoming SW is in its `installing` state, poll the precache
// cache and translate "bytes cached so far" into a 0..99 fill. We cap
// at 99 here so the jump to 100 coincides with the `waiting` event, the
// moment the build is genuinely ready to apply.
function trackInstall(installing: ServiceWorker | null, base: string) {
  if (!installing) return;
  const cacheId = cacheIdForBase(base);
  let stopped = false;
  let timer: number | undefined;

  const stop = () => {
    stopped = true;
    if (timer !== undefined) window.clearTimeout(timer);
  };

  const poll = async () => {
    if (stopped) return;
    const manifest = await fetchPrecacheManifest(base);
    if (manifest && manifest.totalBytes > 0) {
      const bytes = await cachedBytes(cacheId, manifest);
      const pct = Math.min(99, Math.round((bytes / manifest.totalBytes) * 100));
      // Never walk the fill backwards (a slot's old entries can drop out
      // mid-install when caches are cleaned up).
      const prev = state.progress ?? 0;
      setState({ progress: Math.max(prev, pct) });
    }
    if (!stopped) timer = window.setTimeout(() => void poll(), POLL_MS);
  };

  // Seed the fill immediately from whatever is already cached, then
  // poll for the rest.
  setState({ progress: state.progress ?? 0 });
  void poll();

  installing.addEventListener("statechange", () => {
    if (installing.state === "installing") return;
    stop();
    // "installed" hands off to the `waiting` event (→ 100 + toast). A
    // first install with no prior controller goes straight to
    // "activated"; "redundant" means it was superseded. Either way
    // there is no waiting build to advertise, so clear the fill.
    if (installing.state === "activated" || installing.state === "redundant") {
      setState({ progress: null });
    }
  });
}

function start() {
  if (started) return;
  started = true;
  if (import.meta.env.DEV) return;
  if (typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const base = import.meta.env.BASE_URL ?? "/";
  const swUrl = `${base}sw.js`;

  void import("workbox-window").then(({ Workbox }) => {
    const instance = new Workbox(swUrl, {
      scope: base,
      type: "classic",
      // Bypass the HTTP cache when checking for a new SW. Without this,
      // GitHub Pages' default caching can serve the same bytes back to
      // the browser's update check and the new SW never gets discovered
      // until the cached SW is >24h old.
      updateViaCache: "none",
    });
    wb = instance;

    instance.addEventListener("waiting", () => {
      setState({ progress: 100, needRefresh: true });
      void fetchIncomingVersion(base).then((version) =>
        setState({ incomingVersion: version }),
      );
    });
    instance.addEventListener(
      "controlling",
      (event: { isUpdate?: boolean }) => {
        if (event.isUpdate) window.location.reload();
      },
    );

    instance
      .register()
      .then((reg) => {
        if (!reg) return;
        // A new worker may already be mid-install when we register
        // (another tab kicked it off); track it so the fill picks up.
        if (reg.installing) trackInstall(reg.installing, base);
        reg.addEventListener("updatefound", () =>
          trackInstall(reg.installing, base),
        );

        void reg.update();
        window.setInterval(() => {
          if (document.visibilityState === "visible") void reg.update();
        }, HOUR_MS);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void reg.update();
        });
      })
      .catch(() => {
        // Registration errors are swallowed — the app still functions
        // without a service worker.
      });
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

function getSnapshot(): PwaUpdateState {
  return state;
}

// Server / first-paint snapshot: no update in flight.
const SERVER_SNAPSHOT: PwaUpdateState = {
  progress: null,
  needRefresh: false,
  incomingVersion: null,
};

function getServerSnapshot(): PwaUpdateState {
  return SERVER_SNAPSHOT;
}

export type PwaUpdate = PwaUpdateState & {
  // Apply the waiting build: posts SKIP_WAITING to it; the `controlling`
  // listener reloads the page once it takes over.
  reload: () => void;
  // Hide the prompt and clear the fill until a fresher build arrives.
  dismiss: () => void;
};

export function usePwaUpdate(): PwaUpdate {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return {
    ...snapshot,
    reload: () => wb?.messageSkipWaiting(),
    dismiss: () => setState({ needRefresh: false, progress: null }),
  };
}
