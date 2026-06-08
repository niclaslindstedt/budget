import {
  type RowSwipe,
  type RowSwipeOptions,
  useRowSwipe,
} from "../hooks/useRowSwipe";
import { useClaimActiveRow } from "./useClaimActiveRow";

// Every sheet row — budget, accounts, items, salary — pairs the
// swipe-to-reveal gesture (`useRowSwipe`) with an active-row claim
// (`useClaimActiveRow`) so a tap elsewhere on the page retracts the
// swipe instead of firing the control underneath it. The two calls were
// made identically in all four `*Row` components; this folds them into
// one. Lives alongside `useClaimActiveRow` (not in `src/hooks/`) because
// the claim needs the component-level `ActiveRowProvider` context.
export function useRowSwipeAndClaim(
  rowId: string | undefined,
  options: RowSwipeOptions = {},
): RowSwipe {
  const swipe = useRowSwipe(options);
  useClaimActiveRow(rowId, swipe.swiped, () => swipe.setSwiped(false));
  return swipe;
}
