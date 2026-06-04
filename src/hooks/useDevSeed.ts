// Hook backing the developer "Fake data" toggle. When active, `AppShell`
// swaps the storage adapter fed into `useUserDataStorage` for the
// ephemeral in-memory seed adapter (`src/storage/dev-seed-adapter.ts`),
// so the app loads ~6 months of fake data without touching the real
// backend. Turning it off restores the previously-active backend.
//
// The flag is deliberately IN-MEMORY ONLY — no `localStorage` write —
// so a page reload always drops back to the real backend. That makes
// reload the guaranteed escape hatch: fake data can never outlive the
// tab. State lives at module scope with a pub/sub layer (mirroring
// `useDevMode`) so the toggle in the Developer tab and the adapter swap
// in `AppShell` see the same value in the same render.
//
// Inert outside preview builds, gated on `IS_PREVIEW` — the Developer
// tab that exposes the toggle is itself preview-only, so this is
// defence in depth rather than the only guard.

import { useEffect, useState } from "react";

import { IS_PREVIEW } from "../utils/build-env";

let active = false;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      // Subscriber errors must not break the notify loop.
    }
  }
}

function setActiveGlobal(next: boolean): void {
  if (!IS_PREVIEW) return;
  if (active === next) return;
  active = next;
  notify();
}

export function useDevSeed(): {
  active: boolean;
  setActive: (next: boolean) => void;
} {
  const [, force] = useState(0);

  useEffect(() => {
    const cb = () => force((v) => v + 1);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  return { active, setActive: setActiveGlobal };
}
