// Flexible date parsing for batch value imports. Bank parsers each know
// their own column format; this module is the opposite — it takes a date
// cell from an arbitrary CSV / xlsx the user dropped in (a broker export,
// a spreadsheet they keep by hand) and tries every format the feature
// might plausibly meet, normalising to the app's internal ISO
// `YYYY-MM-DD`.
//
// The hard case is numeric `DD/MM/YYYY` vs `MM/DD/YYYY` — the same three
// digits mean different days. We resolve it at the column level
// (`inferDayFirst`) by scanning every cell for an unambiguous one (a part
// > 12 pins the order) and only fall back to the user's `dateFormat`
// preference when the whole column is ambiguous.

// Month names we recognise, English + Swedish, full and abbreviated.
// Keyed by a lower-case prefix; the parser matches the longest key that
// the token starts with. "maj" (sv May) and "mar"/"mars" (March) are why
// we can't just slice three letters and share a table.
const MONTH_NAMES: ReadonlyArray<readonly [string, number]> = [
  ["january", 1],
  ["jan", 1],
  ["februari", 2],
  ["february", 2],
  ["feb", 2],
  ["mars", 3],
  ["march", 3],
  ["mar", 3],
  ["april", 4],
  ["apr", 4],
  ["maj", 5],
  ["may", 5],
  ["juni", 6],
  ["june", 6],
  ["jun", 6],
  ["juli", 7],
  ["july", 7],
  ["jul", 7],
  ["augusti", 8],
  ["august", 8],
  ["aug", 8],
  ["september", 9],
  ["sep", 9],
  ["oktober", 10],
  ["october", 10],
  ["okt", 10],
  ["oct", 10],
  ["november", 11],
  ["nov", 11],
  ["december", 12],
  ["dec", 12],
];

function monthFromName(token: string): number | null {
  const t = token.toLowerCase();
  for (const [prefix, num] of MONTH_NAMES) {
    if (t.startsWith(prefix)) return num;
  }
  return null;
}

// Expand a 2-digit year to a 4-digit one. 70–99 → 1970–1999, 00–69 →
// 2000–2069 — the usual pivot, and a safe bet for personal-finance data
// that is overwhelmingly recent.
function expandYear(y: number): number {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Whether `y-m-d` is a real calendar date (rejects 2024-02-31, month 13,
// day 0, …) by round-tripping through `Date`.
function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function toIso(y: number, m: number, d: number): string | null {
  const year = expandYear(y);
  if (!isRealDate(year, m, d)) return null;
  return `${String(year).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
}

// Excel / spreadsheet serial date → ISO. The epoch is 1899-12-30 (the
// off-by-one that absorbs Excel's fictional 1900 leap day). Bounded to a
// plausible window so a stray amount in the date column isn't silently
// read as a date in the year 4000.
const EXCEL_SERIAL_MIN = 367; // 1901-01-01
const EXCEL_SERIAL_MAX = 73415; // 2100-12-31

export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  if (whole < EXCEL_SERIAL_MIN || whole > EXCEL_SERIAL_MAX) return null;
  const ms = Date.UTC(1899, 11, 30) + whole * 86400000;
  const dt = new Date(ms);
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

// Parse a single date cell to ISO, or null when it isn't a date.
//
// `dayFirst` only decides the numeric `a/b/yyyy` ambiguity — every other
// shape (ISO, year-first, month-name) is unambiguous and ignores it.
export function parseFlexibleDate(
  input: string | number | null | undefined,
  dayFirst: boolean,
): string | null {
  if (input === null || input === undefined) return null;

  if (typeof input === "number") return excelSerialToIso(input);

  const raw = input.trim();
  if (raw === "") return null;

  // Drop a trailing time component ("2024-01-15 13:45", "2024-01-15T13:45").
  const datePart = raw.split(/[ T]/)[0];

  // Year-first ISO-ish: 2024-01-15, 2024/01/15, 2024.01.15.
  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(datePart);
  if (ymd) return toIso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  // Day/month-first numeric: 15/01/2024, 1.2.24, 15-01-2024.
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(datePart);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const y = Number(dmy[3]);
    // An out-of-range part disambiguates regardless of preference.
    let useDayFirst = dayFirst;
    if (a > 12 && b <= 12) useDayFirst = true;
    else if (b > 12 && a <= 12) useDayFirst = false;
    const month = useDayFirst ? b : a;
    const day = useDayFirst ? a : b;
    return toIso(y, month, day);
  }

  // Month-name forms (use the full string, not the time-stripped part):
  //   "15 Jan 2024", "15 januari 2024"
  //   "Jan 15, 2024", "January 15 2024"
  //   "2024 Jan 15"
  const tokens = raw.split(/[\s,]+/).filter((s) => s !== "");
  if (tokens.length === 3) {
    const nums = tokens.map((tok) => /^\d+$/.test(tok));
    const monthIdx = tokens.findIndex((tok) => monthFromName(tok) !== null);
    if (monthIdx !== -1) {
      const month = monthFromName(tokens[monthIdx]) as number;
      const others = tokens.filter((_, i) => i !== monthIdx);
      const oNums = nums.filter((_, i) => i !== monthIdx);
      if (oNums[0] && oNums[1]) {
        const p0 = Number(others[0]);
        const p1 = Number(others[1]);
        // The 4-digit (or larger) one is the year; the other is the day.
        const yearIs0 = others[0].length === 4 || p0 > 31;
        const year = yearIs0 ? p0 : p1;
        const day = yearIs0 ? p1 : p0;
        return toIso(year, month, day);
      }
    }
  }

  return null;
}

// Decide whether a column of numeric `a/b/yyyy` dates is day-first.
// Scans for the first unambiguous cell (a part > 12); returns the
// supplied fallback when every cell could go either way.
export function inferDayFirst(
  cells: ReadonlyArray<string | number | null | undefined>,
  fallback: boolean,
): boolean {
  for (const cell of cells) {
    if (typeof cell !== "string") continue;
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(cell.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) return true;
    if (b > 12 && a <= 12) return false;
  }
  return fallback;
}

// The day-first fallback implied by the user's display preference, used
// when a column is wholly ambiguous. "MM/DD/YYYY" is the only month-first
// preset; everything else (ISO, DD/MM, DD.MM, "D MMM") reads day-first.
export function dayFirstFromDateFormat(format: string): boolean {
  return format !== "MM/DD/YYYY";
}
