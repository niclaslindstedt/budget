import { useMemo } from "react";

import { getStandardColumns, type StandardColumns } from "../data/sheet";
import type { Column } from "../data/types";

// Memoized accessor for the standard column set every AccountBudget
// surface relies on (date / description / amount, plus the optional
// balance / completed / type columns). Wraps `getStandardColumns` so
// components stop re-deriving the same `findColumnByType` lookups one
// per column per render.
//
// The underlying `getStandardColumns` is already O(1) (it reads the
// `columns`-keyed WeakMap built once per array reference), so the
// `useMemo` here only stabilises the returned object's identity across
// renders while `columns` is unchanged. Adopt at sites that read three
// or more of these; single-lookup sites can stay on `findColumnByType`.
export function useStandardColumns(columns: readonly Column[]): StandardColumns {
  return useMemo(() => getStandardColumns(columns), [columns]);
}
