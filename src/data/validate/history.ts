import type {
  HistoryEntry,
  HistoryEntrySplit,
  HistoryImport,
  Transfer,
} from "../types";
import { validateLineItemLinks } from "./account";
import { fail, isObject, type Result } from "./helpers";

export function validateHistoryEntry(
  raw: unknown,
  path: string,
  knownTypeIds: ReadonlySet<string>,
  knownCompanyIds: ReadonlySet<string>,
  knownTagIds: ReadonlySet<string>,
  knownItemIds: ReadonlySet<string>,
): Result<HistoryEntry> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, date, description, amount, balance, importedAt } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof date !== "string" || date === "")
    return fail(`${path}.date`, "expected an ISO date string");
  if (typeof description !== "string")
    return fail(`${path}.description`, "expected a string");
  if (typeof amount !== "number" || !Number.isFinite(amount))
    return fail(`${path}.amount`, "expected a finite number");
  if (
    balance !== undefined &&
    (typeof balance !== "number" || !Number.isFinite(balance))
  )
    return fail(`${path}.balance`, "expected a finite number");
  if (typeof importedAt !== "number" || !Number.isFinite(importedAt))
    return fail(`${path}.importedAt`, "expected a finite number");
  const entry: HistoryEntry = {
    id,
    date,
    description,
    amount,
    importedAt,
  };
  if (balance !== undefined) entry.balance = balance;
  if (raw.hidden !== undefined) {
    if (typeof raw.hidden !== "boolean")
      return fail(`${path}.hidden`, "expected a boolean");
    if (raw.hidden) entry.hidden = true;
  }
  if (raw.collapsedIntoTransferId !== undefined) {
    if (
      typeof raw.collapsedIntoTransferId !== "string" ||
      raw.collapsedIntoTransferId === ""
    ) {
      return fail(
        `${path}.collapsedIntoTransferId`,
        "expected a non-empty string",
      );
    }
    entry.collapsedIntoTransferId = raw.collapsedIntoTransferId;
  }
  if (raw.userDescription !== undefined) {
    if (typeof raw.userDescription !== "string")
      return fail(`${path}.userDescription`, "expected a string");
    // Whitespace-only collapses to the empty string "explicit clear"
    // signal — `synthesizeHistoryRow` reads that to skip the rule /
    // hint description chain so a learned merchant hint doesn't
    // silently refill the cell after the user removed the override.
    // Non-empty values round-trip as-is so a trailing space the user
    // typed survives a reload.
    entry.userDescription =
      raw.userDescription.trim() === "" ? "" : raw.userDescription;
  }
  if (raw.userTypeId !== undefined && raw.userTypeId !== null) {
    if (typeof raw.userTypeId !== "string" || raw.userTypeId === "")
      return fail(`${path}.userTypeId`, "expected a non-empty string");
    // Drop dangling references to deleted types so the synthesized row
    // doesn't render a chip pointing at nothing. Same contract as
    // `MerchantHint` and `MatchRule`.
    if (knownTypeIds.has(raw.userTypeId)) entry.userTypeId = raw.userTypeId;
  }
  if (raw.userSeriesId !== undefined && raw.userSeriesId !== null) {
    // A grouping id with no registry — same shape as `Row.seriesId`, so
    // keep any non-empty string rather than cross-checking it against
    // existing series rows.
    if (typeof raw.userSeriesId !== "string" || raw.userSeriesId === "")
      return fail(`${path}.userSeriesId`, "expected a non-empty string");
    entry.userSeriesId = raw.userSeriesId;
  }
  if (raw.userCompanyId !== undefined && raw.userCompanyId !== null) {
    if (typeof raw.userCompanyId !== "string" || raw.userCompanyId === "")
      return fail(`${path}.userCompanyId`, "expected a non-empty string");
    if (knownCompanyIds.has(raw.userCompanyId))
      entry.userCompanyId = raw.userCompanyId;
  }
  if (raw.userTagIds !== undefined && raw.userTagIds !== null) {
    if (!Array.isArray(raw.userTagIds))
      return fail(`${path}.userTagIds`, "expected an array");
    // Drop dangling references to deleted tags and dedup defensively;
    // only persist a non-empty result so an all-dangling array
    // collapses back to "no tags". Same contract as `Row.tagIds`.
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const tagId of raw.userTagIds) {
      if (typeof tagId !== "string" || tagId === "") continue;
      if (!knownTagIds.has(tagId) || seen.has(tagId)) continue;
      seen.add(tagId);
      kept.push(tagId);
    }
    if (kept.length > 0) entry.userTagIds = kept;
  }
  if (raw.isTransfer !== undefined) {
    if (typeof raw.isTransfer !== "boolean")
      return fail(`${path}.isTransfer`, "expected a boolean");
    if (raw.isTransfer) entry.isTransfer = true;
  }
  if (raw.hintIgnored !== undefined) {
    if (typeof raw.hintIgnored !== "boolean")
      return fail(`${path}.hintIgnored`, "expected a boolean");
    if (raw.hintIgnored) entry.hintIgnored = true;
  }
  if (raw.noCompany !== undefined) {
    if (typeof raw.noCompany !== "boolean")
      return fail(`${path}.noCompany`, "expected a boolean");
    if (raw.noCompany) entry.noCompany = true;
  }
  if (raw.fiscalMonthShift !== undefined) {
    if (raw.fiscalMonthShift !== 1 && raw.fiscalMonthShift !== -1)
      return fail(`${path}.fiscalMonthShift`, "expected -1 or 1");
    entry.fiscalMonthShift = raw.fiscalMonthShift;
  }
  if (raw.splits !== undefined) {
    if (!Array.isArray(raw.splits))
      return fail(`${path}.splits`, "expected an array");
    const splits: HistoryEntry["splits"] = [];
    let sum = 0;
    for (let i = 0; i < raw.splits.length; i += 1) {
      const s = raw.splits[i];
      if (!isObject(s))
        return fail(`${path}.splits[${i}]`, "expected an object");
      if (typeof s.description !== "string")
        return fail(`${path}.splits[${i}].description`, "expected a string");
      if (typeof s.amount !== "number" || !Number.isFinite(s.amount))
        return fail(`${path}.splits[${i}].amount`, "expected a finite number");
      const split: HistoryEntrySplit = {
        description: s.description,
        amount: s.amount,
      };
      if (s.typeId !== undefined && s.typeId !== null) {
        if (typeof s.typeId !== "string" || s.typeId === "")
          return fail(
            `${path}.splits[${i}].typeId`,
            "expected a non-empty string",
          );
        // Drop dangling type references — same contract as `userTypeId`.
        if (knownTypeIds.has(s.typeId)) split.typeId = s.typeId;
      }
      if (s.companyId !== undefined && s.companyId !== null) {
        if (typeof s.companyId !== "string" || s.companyId === "")
          return fail(
            `${path}.splits[${i}].companyId`,
            "expected a non-empty string",
          );
        if (knownCompanyIds.has(s.companyId)) split.companyId = s.companyId;
      }
      if (s.tagIds !== undefined && s.tagIds !== null) {
        if (!Array.isArray(s.tagIds))
          return fail(`${path}.splits[${i}].tagIds`, "expected an array");
        // Drop dangling references to deleted tags and dedup, keeping a
        // non-empty result only — same contract as `userTagIds`.
        const seen = new Set<string>();
        const kept: string[] = [];
        for (const tagId of s.tagIds) {
          if (typeof tagId !== "string" || tagId === "") continue;
          if (!knownTagIds.has(tagId) || seen.has(tagId)) continue;
          seen.add(tagId);
          kept.push(tagId);
        }
        if (kept.length > 0) split.tagIds = kept;
      }
      splits.push(split);
      sum += s.amount;
    }
    // Only keep `splits` when they're a faithful decomposition of the
    // bank's amount; otherwise the running balance would drift away
    // from the bank's authoritative total. The split modal enforces
    // this on save, but a hand-edited export could violate it — fall
    // back to the single-row path rather than rejecting the whole
    // load. `Number.EPSILON`-scale tolerance handles float drift
    // when summing many sub-öre amounts.
    if (
      splits.length > 0 &&
      Math.abs(sum - amount) < Math.max(1e-6, Math.abs(amount) * 1e-9)
    ) {
      entry.splits = splits;
    }
  }
  if (raw.lineItems !== undefined) {
    // Drop dangling line-item links (deleted item) and malformed entries;
    // only persist a non-empty result. No sum check — line items are a
    // partial allocation, unlike `splits`. Independent of `splits`.
    const kept = validateLineItemLinks(raw.lineItems, knownItemIds);
    if (kept.length > 0) entry.lineItems = kept;
  }
  // Receipt file reference for this transaction — see `HistoryEntry`.
  // The file lives in the backend, not the JSON; a dangling path is
  // tolerated by the viewer, so only empty / non-string drops here.
  if (typeof raw.receiptPath === "string" && raw.receiptPath !== "")
    entry.receiptPath = raw.receiptPath;
  return { ok: true, value: entry };
}

export function validateHistoryImport(
  raw: unknown,
  path: string,
): Result<HistoryImport> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const {
    id,
    importedAt,
    filename,
    bankParserId,
    rangeStart,
    rangeEnd,
    addedCount,
    duplicateCount,
  } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof importedAt !== "number" || !Number.isFinite(importedAt))
    return fail(`${path}.importedAt`, "expected a finite number");
  if (typeof filename !== "string")
    return fail(`${path}.filename`, "expected a string");
  if (typeof bankParserId !== "string")
    return fail(`${path}.bankParserId`, "expected a string");
  if (typeof rangeStart !== "string")
    return fail(`${path}.rangeStart`, "expected a string");
  if (typeof rangeEnd !== "string")
    return fail(`${path}.rangeEnd`, "expected a string");
  if (typeof addedCount !== "number" || !Number.isFinite(addedCount))
    return fail(`${path}.addedCount`, "expected a finite number");
  if (typeof duplicateCount !== "number" || !Number.isFinite(duplicateCount))
    return fail(`${path}.duplicateCount`, "expected a finite number");
  return {
    ok: true,
    value: {
      id,
      importedAt,
      filename,
      bankParserId,
      rangeStart,
      rangeEnd,
      addedCount,
      duplicateCount,
    },
  };
}

export function validateTransfer(
  raw: unknown,
  path: string,
  knownAccountIds: ReadonlySet<string>,
  knownTypeIds: ReadonlySet<string>,
): Result<Transfer> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, date, description, amount, fromAccountId, toAccountId } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof date !== "string")
    return fail(`${path}.date`, "expected an ISO date string");
  if (typeof description !== "string")
    return fail(`${path}.description`, "expected a string");
  if (typeof amount !== "number" || !Number.isFinite(amount))
    return fail(`${path}.amount`, "expected a finite number");
  if (typeof fromAccountId !== "string" || fromAccountId === "")
    return fail(`${path}.fromAccountId`, "expected a non-empty string");
  if (typeof toAccountId !== "string" || toAccountId === "")
    return fail(`${path}.toAccountId`, "expected a non-empty string");
  if (!knownAccountIds.has(fromAccountId))
    return fail(
      `${path}.fromAccountId`,
      `references unknown account "${fromAccountId}"`,
    );
  if (!knownAccountIds.has(toAccountId))
    return fail(
      `${path}.toAccountId`,
      `references unknown account "${toAccountId}"`,
    );
  const tx: Transfer = {
    id,
    date,
    description,
    amount,
    fromAccountId,
    toAccountId,
  };
  if (raw.typeId !== undefined) {
    if (raw.typeId === null) {
      tx.typeId = null;
    } else if (typeof raw.typeId === "string" && raw.typeId !== "") {
      // Drop dangling type references silently so a deleted type
      // can't trap the transfer; the renderer treats an unknown id
      // as "no type".
      tx.typeId = knownTypeIds.has(raw.typeId) ? raw.typeId : null;
    } else {
      return fail(`${path}.typeId`, "expected a string or null");
    }
  }
  if (raw.completed !== undefined) {
    if (typeof raw.completed !== "boolean")
      return fail(`${path}.completed`, "expected a boolean");
    tx.completed = raw.completed;
  }
  return { ok: true, value: tx };
}
