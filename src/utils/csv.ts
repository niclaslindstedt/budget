// Minimal RFC-4180-ish CSV parser for user-supplied value imports. The
// bank importers each define their own delimiter; here the file is
// arbitrary, so we sniff the delimiter (comma / semicolon / tab) from the
// first non-empty line and handle quoted fields with embedded delimiters,
// newlines, and doubled-quote escapes.

function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    // Count only delimiters outside quotes on the header line.
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

// Parse CSV text into a dense grid of string cells. Empty trailing lines
// are dropped; every row is returned as-is (callers decide which row is
// the header).
export function parseCsv(text: string, delimiter?: string): string[][] {
  // Strip a UTF-8 BOM if the file carried one.
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delim = delimiter ?? sniffDelimiter(cleaned);

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      // swallow — the following \n (if any) ends the row
    } else {
      field += ch;
    }
  }
  // Flush the final field / row unless the file ended on a clean newline.
  if (field !== "" || row.length > 0) pushRow();

  // Drop fully-empty rows (a blank line between records, a trailing one).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
