// Side-effect import: registers every bank-specific parser with the
// shared registry in `bank-import.ts`. Components that need to parse
// a file import this module instead of `bank-import.ts` directly so
// the registry is populated before `parseBankFile` is called.

import "./bank-skandia";
import "./bank-ica";
import "./bank-swedbank";
import "./bank-norwegian";
import "./bank-budget-history";

export {
  type BankFile,
  type ParsedBankEntry,
  type ParsedBankFile,
  type MergeResult,
  computeOpeningBalanceFromEntries,
  computeOpeningBalanceFromHistory,
  historyEntryId,
  listBankParsers,
  makeBankFile,
  mergeHistory,
  parseBankFile,
} from "./bank-import";
