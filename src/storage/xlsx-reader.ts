// Minimal xlsx reader tailored to bank-statement files.
//
// `.xlsx` is a ZIP container of XML parts. SheetJS handles the
// general case in ~500 KB of code; bank exports use a tiny subset
// (one sheet, no formulas, often no styles, often no shared-strings
// table) so a few hundred lines of focused code is enough. Keeping
// this in-tree avoids dragging a heavy dependency into a bundle the
// project takes care to keep small.
//
// Supports:
//   - Stored entries (compression method 0)
//   - Deflate entries (compression method 8) via the browser /
//     Node `DecompressionStream("deflate-raw")` primitive.
//   - Inline strings (`t="str"` / `t="inlineStr"`)
//   - Shared strings (`t="s"`, resolved against `xl/sharedStrings.xml`)
//   - Plain numeric cells (`<v>...</v>` with no `t` attribute)
//   - Boolean cells (`t="b"`)
//
// Does NOT support:
//   - Date serials (numeric cells with date-formatted styles). The
//     Skandia export stores dates as ISO strings inside `t="str"`
//     cells so this is unnecessary today. If a future bank needs
//     date-serial decoding, add it here and key off the styles part.
//   - Cells whose value is a formula (`<f>...</f>`). Bank exports
//     don't use formulas.

export type XlsxCellValue = string | number | boolean | null;

export type XlsxSheet = {
  // Rows in document order. Each row is a sparse map from 0-based
  // column index (A=0, B=1, …) to the cell's decoded value. Empty
  // cells are omitted so the caller can use `Object.keys` to learn
  // which columns are populated.
  rows: Map<number, XlsxCellValue>[];
};

// Read the first worksheet of an xlsx file. Returns the sheet's
// rows; callers slice / inspect headers as needed.
export async function readFirstSheet(buf: ArrayBuffer): Promise<XlsxSheet> {
  const files = await readZip(buf);
  const sharedStrings = extractSharedStrings(
    files.get("xl/sharedStrings.xml") ?? "",
  );
  // The first sheet is reliably `xl/worksheets/sheet1.xml` in every
  // export we've seen. If a producer ever uses a different layout,
  // we'd need to walk `xl/workbook.xml` for the `r:id` mapping —
  // not needed today.
  const sheetXml = files.get("xl/worksheets/sheet1.xml");
  if (!sheetXml) throw new Error("xlsx missing xl/worksheets/sheet1.xml");
  return { rows: parseSheet(sheetXml, sharedStrings) };
}

// --- ZIP ----------------------------------------------------------

type ZipEntry = {
  compression: number;
  compressedSize: number;
  localHeaderOffset: number;
};

async function readZip(buf: ArrayBuffer): Promise<Map<string, string>> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // End-of-central-directory record: signature 0x06054b50. ZIPs allow
  // a trailing comment of up to 64 KiB, so scan backwards from the
  // tail for at most that distance plus the 22-byte EOCD record.
  let eocd = -1;
  const minEocd = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minEocd; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a valid xlsx (no EOCD record)");

  const entryCount = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);

  const entries = new Map<string, ZipEntry>();
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(p, true) !== 0x02014b50)
      throw new Error("not a valid xlsx (bad central directory)");
    const compression = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(p + 46, p + 46 + nameLen),
    );
    entries.set(name, { compression, compressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const out = new Map<string, string>();
  const decoder = new TextDecoder("utf-8");
  for (const [name, e] of entries) {
    if (view.getUint32(e.localHeaderOffset, true) !== 0x04034b50)
      throw new Error(`not a valid xlsx (bad local header for ${name})`);
    const lhNameLen = view.getUint16(e.localHeaderOffset + 26, true);
    const lhExtraLen = view.getUint16(e.localHeaderOffset + 28, true);
    const dataStart = e.localHeaderOffset + 30 + lhNameLen + lhExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + e.compressedSize);
    let raw: Uint8Array;
    if (e.compression === 0) {
      raw = compressed;
    } else if (e.compression === 8) {
      raw = await inflateRaw(compressed);
    } else {
      throw new Error(`unsupported compression ${e.compression} for ${name}`);
    }
    out.set(name, decoder.decode(raw));
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // `DecompressionStream` is available in modern browsers and Node
  // 18+. "deflate-raw" matches the raw DEFLATE stream ZIP uses (no
  // zlib header / Adler-32 trailer).
  // Re-wrap as a fresh ArrayBuffer copy so the Blob constructor sees
  // a definite `ArrayBuffer` (not `ArrayBufferLike`), which trips
  // TypeScript's DOM lib when given a Uint8Array subarray view.
  const owned = new Uint8Array(data.length);
  owned.set(data);
  const stream = new Blob([owned.buffer])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  return merged;
}

// --- XML ----------------------------------------------------------

// Shared-strings table: `<sst><si>{...}</si><si>...</si></sst>`.
// Each `<si>` may contain a single `<t>...</t>` or a rich-text run
// list with multiple `<t>` fragments — concatenate them.
function extractSharedStrings(xml: string): string[] {
  if (xml === "") return [];
  const out: string[] = [];
  const siRe = /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml)) !== null) {
    const body = m[1];
    let combined = "";
    const tRe = /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(body)) !== null) combined += decodeXmlText(tm[1]);
    out.push(combined);
  }
  return out;
}

function parseSheet(
  xml: string,
  sharedStrings: readonly string[],
): Map<number, XlsxCellValue>[] {
  const rows: Map<number, XlsxCellValue>[] = [];
  const rowRe = /<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const body = rowMatch[1];
    const cells = new Map<number, XlsxCellValue>();
    const cRe =
      /<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>|<(?:\w+:)?c\b([^>]*)\/>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cRe.exec(body)) !== null) {
      const attrs = cm[1] ?? cm[3] ?? "";
      const inner = cm[2] ?? "";
      const ref = attrText(attrs, "r");
      if (ref === null) continue;
      const col = parseColumnRef(ref);
      const t = attrText(attrs, "t") ?? "n";
      const value = readCellValue(t, inner, sharedStrings);
      if (value !== null) cells.set(col, value);
    }
    rows.push(cells);
  }
  return rows;
}

function readCellValue(
  type: string,
  inner: string,
  sharedStrings: readonly string[],
): XlsxCellValue {
  // Inline-string variant uses `<is><t>...</t></is>` rather than
  // `<v>`; handle it before falling through to the generic value
  // reader.
  if (type === "inlineStr") {
    const tRe = /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g;
    let combined = "";
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(inner)) !== null) combined += decodeXmlText(tm[1]);
    return combined;
  }

  const vMatch = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
  if (!vMatch) return null;
  const raw = decodeXmlText(vMatch[1]);
  switch (type) {
    case "s": {
      const idx = Number.parseInt(raw, 10);
      return Number.isFinite(idx) && idx >= 0 && idx < sharedStrings.length
        ? sharedStrings[idx]
        : "";
    }
    case "str":
      return raw;
    case "b":
      return raw === "1" || raw === "true";
    default: {
      // `t="n"` (numeric) or no `t` attribute. Bank exports we care
      // about put plain decimal numbers here.
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
  }
}

function attrText(attrs: string, name: string): string | null {
  const re = new RegExp(`\\b${name}="([^"]*)"`);
  const m = re.exec(attrs);
  return m ? m[1] : null;
}

// Translate a cell reference like "C12" to a 0-based column index
// ("A" → 0, "Z" → 25, "AA" → 26, …). Bank exports stay within the
// first few columns so this barely matters in practice, but the
// arithmetic is simple enough to do correctly.
export function parseColumnRef(ref: string): number {
  let col = 0;
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i);
    if (code < 65 || code > 90) break;
    col = col * 26 + (code - 64);
  }
  return col - 1;
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCodePoint(Number.parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&");
}
