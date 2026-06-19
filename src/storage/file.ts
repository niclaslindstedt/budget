import {
  migrate,
  type MigrationContext,
  type Versioned,
} from "../data/migrations";
import type { UserData } from "../data/types";
import { validateUserData } from "../data/validate";
import { createLogger } from "../utils/logger";

const log = createLogger("parse");

export const FILE_MIME_TYPE = "application/json";

// Pretty-printed with sorted keys: two exports of equal UserData blobs
// produce byte-identical files, which keeps diffs (if a user
// version-controls their exports) clean and review-friendly.
export function serializeUserData(data: UserData): string {
  return stableStringify(data, 2) + "\n";
}

export type ImportResult =
  | { ok: true; data: UserData; migrated: boolean }
  | { ok: false; error: string };

// Single entry point for "raw text → UserData". Used by file import
// and by the localStorage loader so both paths share the same parse /
// migrate / validate pipeline. The optional `ctx` is threaded into the
// migration chain — currently only the v34 → v35 step uses it (to
// absorb per-user values from device-local localStorage when the active
// `userId` is known); the import path leaves it empty and the step
// seeds defaults instead.
export function parseUserData(
  text: string,
  ctx: MigrationContext = {},
): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = `Invalid JSON: ${(err as Error).message}`;
    log.error(`parseUserData: ${message}`);
    return { ok: false, error: message };
  }
  if (!hasNumericVersion(parsed)) {
    log.error("parseUserData: missing or non-numeric 'version' field", parsed);
    return { ok: false, error: "Missing or non-numeric 'version' field" };
  }
  let migrated;
  const fromVersion = (parsed as Versioned).version;
  try {
    migrated = migrate(parsed, ctx);
    if (migrated.migrated) {
      log.info(
        `parseUserData: migrated v${fromVersion} → v${migrated.data.version}`,
      );
    }
  } catch (err) {
    log.error(`parseUserData: migration from v${fromVersion} failed`, err);
    return { ok: false, error: (err as Error).message };
  }
  const validated = validateUserData(migrated.data);
  if (!validated.ok) {
    log.error(`parseUserData: validation failed: ${validated.error}`);
    return { ok: false, error: validated.error };
  }
  return { ok: true, data: validated.value, migrated: migrated.migrated };
}

export function suggestFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `budget-${stamp}.json`;
}

function hasNumericVersion(v: unknown): v is Versioned {
  return (
    typeof v === "object" &&
    v !== null &&
    "version" in v &&
    typeof (v as { version: unknown }).version === "number"
  );
}

// Pretty-print with sorted keys. Exported so segment serialization
// (`segments.ts`) produces byte-identical output to `serializeUserData`,
// which is what lets a split-then-merge round-trip be asserted against
// the whole-blob serialization.
export function stableStringify(value: unknown, indent: number): string {
  return JSON.stringify(value, stableReplacer, indent);
}

function stableReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}
