// Forward-only migration chain for persisted budgets.
//
// Each entry in `migrations` migrates from version `N` to `N+1`. Once a
// migration ships it must never be removed or rewritten — exports in the
// wild still depend on it to upgrade cleanly. To add a new version: bump
// `LATEST_VERSION`, update the `Budget.version` literal in `data/types.ts`,
// and add the next step here.

// Typed as a literal so consumers (like the Budget type) can pin to it.
// When bumping, change BOTH this constant and the `Budget.version` literal
// in `data/types.ts` in the same commit.
export const LATEST_VERSION = 1 as const;

export type Versioned = { version: number; [key: string]: unknown };

const migrations: Record<number, (b: Versioned) => Versioned> = {
  // 1: (v1) => ({ ...v1, version: 2, /* added fields */ }),
};

export type MigrationResult = {
  budget: Versioned;
  migrated: boolean;
};

export function migrate(raw: Versioned): MigrationResult {
  if (raw.version > LATEST_VERSION) {
    throw new Error(
      `Budget was created by a newer version of the app (v${raw.version}); ` +
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
    current = step(current);
    migrated = true;
  }
  return { budget: current, migrated };
}
