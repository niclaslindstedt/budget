// Build a minimal xlsx ArrayBuffer in memory for parser tests.
//
// The xlsx-reader at `src/storage/xlsx-reader.ts` only requires
// `xl/worksheets/sheet1.xml` to be present in the ZIP and reads cells
// of types `str`, `inlineStr`, `s`, `b`, or plain numeric. This helper
// emits the smallest archive that satisfies that subset:
//
//   - Stored (uncompressed) ZIP entries (compression method 0).
//     Keeps the encoder small — no DEFLATE step needed and the reader
//     already supports method 0.
//   - One worksheet part with rows / cells of types "str" and "n".
//   - No styles, no shared strings, no workbook-rels chrome — the
//     reader doesn't read those.
//
// Tests pass row data as a 2-D array of strings or numbers; this
// helper turns it into the bytes a real Swedbank export would have.

export type XlsxCell = string | number;

const SHEET_PATH = "xl/worksheets/sheet1.xml";

export function buildXlsx(rows: readonly (readonly XlsxCell[])[]): ArrayBuffer {
  const sheetXml = encodeSheet(rows);
  const sheetBytes = new TextEncoder().encode(sheetXml);
  return packStoredZip([{ name: SHEET_PATH, data: sheetBytes }]);
}

function encodeSheet(rows: readonly (readonly XlsxCell[])[]): string {
  const parts: string[] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    "<x:sheetData>",
  ];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    parts.push(`<x:row r="${r + 1}">`);
    for (let c = 0; c < row.length; c++) {
      const ref = `${columnLetter(c)}${r + 1}`;
      const cell = row[c];
      if (typeof cell === "number") {
        parts.push(`<x:c r="${ref}"><x:v>${cell}</x:v></x:c>`);
      } else {
        parts.push(
          `<x:c r="${ref}" t="str"><x:v>${escapeXml(cell)}</x:v></x:c>`,
        );
      }
    }
    parts.push("</x:row>");
  }
  parts.push("</x:sheetData></x:worksheet>");
  return parts.join("");
}

function columnLetter(index: number): string {
  let n = index;
  let s = "";
  for (;;) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
    if (n < 0) return s;
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// --- ZIP packing -------------------------------------------------

type StoredEntry = { name: string; data: Uint8Array };

function packStoredZip(entries: readonly StoredEntry[]): ArrayBuffer {
  const chunks: Uint8Array[] = [];
  const centralEntries: {
    name: Uint8Array;
    crc: number;
    size: number;
    localOffset: number;
  }[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true); // signature
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0, true); // flags
    view.setUint16(8, 0, true); // compression: stored
    view.setUint16(10, 0, true); // mod time
    view.setUint16(12, 0, true); // mod date
    view.setUint32(14, crc, true); // crc32
    view.setUint32(18, size, true); // compressed size
    view.setUint32(22, size, true); // uncompressed size
    view.setUint16(26, nameBytes.length, true); // name length
    view.setUint16(28, 0, true); // extra length
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader);
    chunks.push(entry.data);
    centralEntries.push({
      name: nameBytes,
      crc,
      size,
      localOffset: offset,
    });
    offset += localHeader.length + entry.data.length;
  }

  const cdStart = offset;
  for (const e of centralEntries) {
    const cdEntry = new Uint8Array(46 + e.name.length);
    const view = new DataView(cdEntry.buffer);
    view.setUint32(0, 0x02014b50, true); // signature
    view.setUint16(4, 20, true); // version made by
    view.setUint16(6, 20, true); // version needed
    view.setUint16(8, 0, true); // flags
    view.setUint16(10, 0, true); // compression
    view.setUint16(12, 0, true); // mod time
    view.setUint16(14, 0, true); // mod date
    view.setUint32(16, e.crc, true); // crc32
    view.setUint32(20, e.size, true); // compressed size
    view.setUint32(24, e.size, true); // uncompressed size
    view.setUint16(28, e.name.length, true); // name length
    view.setUint16(30, 0, true); // extra length
    view.setUint16(32, 0, true); // comment length
    view.setUint16(34, 0, true); // disk number start
    view.setUint16(36, 0, true); // internal attrs
    view.setUint32(38, 0, true); // external attrs
    view.setUint32(42, e.localOffset, true); // local header offset
    cdEntry.set(e.name, 46);
    chunks.push(cdEntry);
    offset += cdEntry.length;
  }

  const cdSize = offset - cdStart;
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // signature
  eocdView.setUint16(4, 0, true); // disk number
  eocdView.setUint16(6, 0, true); // disk with start of central dir
  eocdView.setUint16(8, centralEntries.length, true); // entries on this disk
  eocdView.setUint16(10, centralEntries.length, true); // total entries
  eocdView.setUint32(12, cdSize, true); // central dir size
  eocdView.setUint32(16, cdStart, true); // central dir offset
  eocdView.setUint16(20, 0, true); // comment length
  chunks.push(eocd);

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(totalLength);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
