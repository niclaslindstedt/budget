// Forward-only migration chain for persisted UserData blobs.
//
// Each entry in the assembled `migrations` table migrates from version
// `N` to `N+1`. Once a migration ships it must never be removed or
// rewritten — exports in the wild still depend on it to upgrade cleanly.
// To add a new version: bump `LATEST_VERSION`, update the
// `UserData.version` literal in `data/types.ts`, and add the next step
// to the modern table in `./modern.ts`.
//
// The table is split across two halves so recent migrations stay
// scannable. `./legacy.ts` covers v1 → v30; `./modern.ts` covers v31 →
// `LATEST_VERSION`. The split point is fixed at v30 / v31 — past v30
// migrations never grow, so the boundary will only shift if the legacy
// chain is dropped entirely as part of a future v2.0 major bump.

import { LEGACY_MIGRATIONS } from "./legacy";
import { MODERN_MIGRATIONS } from "./modern";
import type { MigrationContext, MigrationTable, Versioned } from "./shared";

export type { MigrationContext, Versioned } from "./shared";

// Typed as a literal so consumers (like the UserData type) can pin to it.
// When bumping, change BOTH this constant and the `UserData.version` literal
// in `data/types.ts` in the same commit.
export const LATEST_VERSION = 54 as const;

const migrations: MigrationTable = {
  ...LEGACY_MIGRATIONS,
  ...MODERN_MIGRATIONS,
};

export type MigrationResult = {
  data: Versioned;
  migrated: boolean;
};

export function migrate(
  raw: Versioned,
  ctx: MigrationContext = {},
): MigrationResult {
  if (raw.version > LATEST_VERSION) {
    throw new Error(
      `Data was created by a newer version of the app (v${raw.version}); ` +
        `this build supports up to v${LATEST_VERSION}.`,
    );
  }
  let current = raw;
  let migrated = false;
  while (current.version < LATEST_VERSION) {
    const step = migrations[current.version];
    if (!step) {
      throw new Error(
        `No migration registered from v${current.version} to v${current.version + 1}.`,
      );
    }
    current = step(current, ctx);
    migrated = true;
  }
  return { data: current, migrated };
}
