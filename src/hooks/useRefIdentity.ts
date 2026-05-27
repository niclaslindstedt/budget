import { useState } from "react";

// True on the render where `value`'s reference identity changed since
// the last render — useful for modals that mirror a prop into local
// working state and need to resync when the parent passes a fresh
// object (e.g. AccountRenamePredictorModal regenerating its row-state when
// the suggestion list is replaced).
//
// The internal state updates synchronously during render so the
// caller can drive a post-render `setState` without an effect; React
// batches the two updates into the same paint.
export function useRefIdentity<T>(value: T): { changed: boolean } {
  const [previous, setPrevious] = useState<T>(value);
  if (previous !== value) {
    setPrevious(value);
    return { changed: true };
  }
  return { changed: false };
}
