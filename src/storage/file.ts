import { migrate, type Versioned } from "../data/migrations";
import type { Budget } from "../data/types";
import { validateBudget } from "../data/validate";

export const FILE_MIME_TYPE = "application/json";

// Pretty-printed with sorted keys: two exports of equal budgets produce
// byte-identical files, which keeps diffs (if a user version-controls
// their exports) clean and review-friendly.
export function serializeBudget(budget: Budget): string {
  return stableStringify(budget, 2) + "\n";
}

export type ImportResult =
  | { ok: true; budget: Budget; migrated: boolean }
  | { ok: false; error: string };

// Single entry point for "raw text → Budget". Used by file import and by
// the localStorage loader so both paths share the same parse / migrate /
// validate pipeline.
export function parseBudget(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${(err as Error).message}` };
  }
  if (!hasNumericVersion(parsed)) {
    return { ok: false, error: "Missing or non-numeric 'version' field" };
  }
  let migrated;
  try {
    migrated = migrate(parsed);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const validated = validateBudget(migrated.budget);
  if (!validated.ok) return { ok: false, error: validated.error };
  return { ok: true, budget: validated.value, migrated: migrated.migrated };
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

function stableStringify(value: unknown, indent: number): string {
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
