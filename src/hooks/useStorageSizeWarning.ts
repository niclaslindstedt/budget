import { useCallback, useEffect, useState } from "react";

import type { BackendId } from "../storage/backend-preference";
import { measureLocalStorageSize } from "../storage/local-adapter";

// Threshold in UTF-16 code units. Browsers typically allow ~5 MB of
// localStorage per origin (measured in code units); at ~3 MB the user
// has ~40% of headroom left before writes start failing silently, which
// is enough warning for a manual migration to the folder or cloud
// backend without nagging users whose budget is still tiny.
const STORAGE_WARNING_THRESHOLD = 3 * 1024 * 1024;

type Input = {
  backend: BackendId;
};

type Result = {
  isOpen: boolean;
  sizeBytes: number;
  thresholdBytes: number;
  onClose: () => void;
};

// "Storage almost full" gate. Fires once per BudgetView mount when the
// user is still on the default browser backend and total localStorage
// usage has crossed the warning threshold. Intentionally not persisted
// — the user must dismiss it on every page load until they migrate to
// a folder or cloud backend, which clears the condition because cloud
// backends move the budget bucket out of localStorage entirely.
export function useStorageSizeWarning({ backend }: Input): Result {
  const [isOpen, setIsOpen] = useState(false);
  const [sizeBytes, setSizeBytes] = useState(0);

  useEffect(() => {
    if (backend !== "browser") return;
    const size = measureLocalStorageSize();
    if (size >= STORAGE_WARNING_THRESHOLD) {
      setSizeBytes(size);
      setIsOpen(true);
    }
    // Effect intentionally fires once per mount of the budget view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onClose = useCallback(() => setIsOpen(false), []);

  return {
    isOpen,
    sizeBytes,
    thresholdBytes: STORAGE_WARNING_THRESHOLD,
    onClose,
  };
}
