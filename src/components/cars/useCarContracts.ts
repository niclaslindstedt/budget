import { useCallback, useEffect } from "react";

import { unlock } from "../../data/achievements";
import { collectReceiptPaths } from "../../data/items/link";
import { buildCarContractPath } from "../../data/items/receipt-name";
import type { Action } from "../../data/reducer";
import { newId } from "../../data/sheet";
import type {
  Car,
  CarContract,
  CarContractKind,
  UserData,
} from "../../data/types";
import { useT } from "../../i18n";
import type { StorageAdapter } from "../../storage/adapter";
import { createLogger } from "../../utils/logger";

const log = createLogger("car-contracts");

// Metadata the user enters when uploading (or editing) a car contract.
export type CarContractMeta = {
  kind: CarContractKind;
  description?: string;
};

export type CarContracts = {
  // Whether the active backend can store car contracts at all (the folder /
  // cloud backends do; plain localStorage does not). The host gates the
  // upload / manage affordance on this.
  canManage: boolean;
  // Fetch a stored contract's bytes for the inline preview / download.
  download: (path: string) => Promise<Blob>;
  // Write the picked file to `<car>/contracts/` AND append a `CarContract`
  // record carrying its path + metadata; resolves the record.
  uploadContract: (
    car: Car,
    file: File,
    meta: CarContractMeta,
  ) => Promise<CarContract>;
  // Replace an existing contract's bytes with a freshly-picked file,
  // re-deriving the path from the record's metadata + the new extension (so a
  // same-format replace overwrites in place; a format change re-files).
  // Updates the record's `path` and resolves the new path.
  replaceContract: (
    car: Car,
    record: CarContract,
    file: File,
  ) => Promise<string>;
  // Delete a contract's bytes AND drop its `CarContract` record.
  removeContract: (
    carId: string,
    contractId: string,
    path: string,
  ) => Promise<void>;
};

type Args = {
  data: UserData;
  adapter: StorageAdapter;
  dispatch: (action: Action) => void;
};

// Car-contract handling. Each car's uploaded purchase / leasing / sale
// paperwork lives in the backend's per-car `cars/` store
// (`<name>/contracts/<file>`), so this hook owns the file write + the data
// commit; the Cars page wires the contracts manager to it. Mirrors
// `usePropertyAttachments`, trimmed to the single upload flow a contract
// needs (no categories / tags / export).
export function useCarContracts({
  data,
  adapter,
  dispatch,
}: Args): CarContracts {
  const t = useT();

  const store = adapter.carFiles;
  const canManage = adapter.capabilities.has("carFiles");

  // Mirror the property-attachments guard: a capability advertised with no
  // ops object means every operation throws with no clue why. Log it loudly
  // (once per adapter) so the regression is caught from the Logs tab.
  useEffect(() => {
    if (canManage && !store) {
      log.error(
        `adapter "${adapter.id}" advertises the carFiles capability but has no carFiles ops — uploads will fail`,
      );
    }
  }, [canManage, store, adapter.id]);

  const download = useCallback(
    async (path: string): Promise<Blob> => {
      if (!store) throw new Error("car contracts unavailable");
      const blob = await store.download(path);
      if (!blob) throw new Error("attachment missing");
      return blob;
    },
    [store],
  );

  const uploadContract = useCallback(
    async (
      car: Car,
      file: File,
      meta: CarContractMeta,
    ): Promise<CarContract> => {
      if (!store) throw new Error("car contracts unavailable");
      const id = newId();
      const path = buildCarContractPath({
        carName: car.name,
        fallbackFolder: t("carsSheet.contractsFolderFallback"),
        description: meta.description,
        originalFilename: file.name,
        contractId: id,
        usedPaths: collectReceiptPaths(data),
      });
      await store.upload(path, file);
      unlock("carContractKeeper");
      const record: CarContract = { id, path, kind: meta.kind };
      const description = meta.description?.trim();
      if (description) record.description = description;
      dispatch({ type: "addCarContract", carId: car.id, contract: record });
      return record;
    },
    [store, data, dispatch, t],
  );

  const replaceContract = useCallback(
    async (car: Car, record: CarContract, file: File): Promise<string> => {
      if (!store) throw new Error("car contracts unavailable");
      // Exclude the record's own path so a same-format replace reuses its
      // tidy name and overwrites in place.
      const usedPaths = collectReceiptPaths(data, record.path);
      const newPath = buildCarContractPath({
        carName: car.name,
        fallbackFolder: t("carsSheet.contractsFolderFallback"),
        description: record.description,
        originalFilename: file.name,
        contractId: record.id,
        usedPaths,
      });
      await store.upload(newPath, file);
      // Drop the old bytes when the name moved (a format change), so the
      // previous file isn't orphaned next to the replacement.
      if (newPath !== record.path) {
        try {
          await store.remove(record.path);
        } catch {
          // Best-effort cleanup — a failed delete leaves a harmless orphan.
        }
        dispatch({
          type: "updateCarContract",
          carId: car.id,
          contractId: record.id,
          patch: { path: newPath },
        });
      }
      return newPath;
    },
    [store, data, dispatch, t],
  );

  const removeContract = useCallback(
    async (carId: string, contractId: string, path: string): Promise<void> => {
      if (!store) throw new Error("car contracts unavailable");
      await store.remove(path);
      dispatch({ type: "deleteCarContract", carId, contractId });
    },
    [store, dispatch],
  );

  return {
    canManage,
    download,
    uploadContract,
    replaceContract,
    removeContract,
  };
}
