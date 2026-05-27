// Shared types and helpers consumed by both the legacy (v1 → v30) and
// modern (v31 → v44) migration tables. Kept in its own module so the
// two halves don't need to import from each other (or from `index.ts`,
// which would risk a circular import).

export type Versioned = { version: number; [key: string]: unknown };

// Per-call context for `migrate()`. Currently only carries the active
// `userId` so the v34 → v35 step can absorb the per-user download
// preferences from device-local localStorage; future migrations can
// extend this. Defaulting to `{}` keeps existing callers (including
// every test) source-compatible.
export type MigrationContext = {
  userId?: string;
};

export type MigrationStep = (b: Versioned, ctx: MigrationContext) => Versioned;

export type MigrationTable = Record<number, MigrationStep>;

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
