// Public surface of the bank-import pipeline. Importing this module
// has the side effect of registering every parser under
// `./parsers/*.ts` via the auto-discovery in `./parsers/index.ts`.
// Components and reducers import from here rather than `./core`
// directly so the registry is populated before `parseBankFile` runs.

import "./parsers";

export {
  type BankFile,
  type BankParser,
  type MergeResult,
  type ParsedBankEntry,
  type ParsedBankFile,
  computeOpeningBalanceFromEntries,
  computeOpeningBalanceFromHistory,
  historyEntryId,
  listBankParsers,
  makeBankFile,
  mergeHistory,
  parseBankFile,
  registerBankParser,
} from "./core";
