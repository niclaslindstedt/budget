// Minimal store-only ZIP writer. Produces a valid ZIP archive with no
// compression — every file is included verbatim. Enough for the XLSX
// export (which only needs a handful of small XML files); compressing
// them gains a few KB at the cost of a third-party dependency, which
// the project's bundle-size discipline rules out.
//
// Layout: local file headers + raw file bytes followed by a central
// directory and an end-of-central-directory record. All fields are
// little-endian.

type ZipFile = {
  name: string;
  data: Uint8Array;
  crc: number;
};

const textEncoder = new TextEncoder();

// CRC-32 table built once at module load. The polynomial is 0xEDB88320
// (the reversed IEEE 802.3 polynomial used by both ZIP and PNG).
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = {
  name: string;
  // Either a UTF-8 string (XML text) or raw bytes (binary files).
  data: string | Uint8Array;
};

export function buildZip(entries: readonly ZipEntry[]): Uint8Array {
  const files: ZipFile[] = entries.map((e) => {
    const bytes =
      typeof e.data === "string" ? textEncoder.encode(e.data) : e.data;
    return { name: e.name, data: bytes, crc: crc32(bytes) };
  });

  // Pre-compute total output size so we can allocate a single buffer.
  let localSize = 0;
  let centralSize = 0;
  for (const f of files) {
    const nameLen = textEncoder.encode(f.name).length;
    localSize += 30 + nameLen + f.data.length;
    centralSize += 46 + nameLen;
  }
  const total = localSize + centralSize + 22;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  let offset = 0;
  const localOffsets: number[] = [];

  // Local file headers + file data.
  for (const f of files) {
    localOffsets.push(offset);
    const nameBytes = textEncoder.encode(f.name);
    view.setUint32(offset, 0x04034b50, true); // local file header signature
    view.setUint16(offset + 4, 20, true); // version needed to extract
    view.setUint16(offset + 6, 0, true); // general purpose bit flag
    view.setUint16(offset + 8, 0, true); // compression method (stored)
    view.setUint16(offset + 10, 0, true); // last mod file time
    view.setUint16(offset + 12, 0, true); // last mod file date
    view.setUint32(offset + 14, f.crc, true);
    view.setUint32(offset + 18, f.data.length, true); // compressed size
    view.setUint32(offset + 22, f.data.length, true); // uncompressed size
    view.setUint16(offset + 26, nameBytes.length, true);
    view.setUint16(offset + 28, 0, true); // extra field length
    offset += 30;
    out.set(nameBytes, offset);
    offset += nameBytes.length;
    out.set(f.data, offset);
    offset += f.data.length;
  }

  const centralStart = offset;

  // Central directory.
  for (let i = 0; i < files.length; i += 1) {
    const f = files[i];
    const nameBytes = textEncoder.encode(f.name);
    view.setUint32(offset, 0x02014b50, true); // central directory signature
    view.setUint16(offset + 4, 20, true); // version made by
    view.setUint16(offset + 6, 20, true); // version needed
    view.setUint16(offset + 8, 0, true); // general purpose bit flag
    view.setUint16(offset + 10, 0, true); // compression method
    view.setUint16(offset + 12, 0, true); // last mod time
    view.setUint16(offset + 14, 0, true); // last mod date
    view.setUint32(offset + 16, f.crc, true);
    view.setUint32(offset + 20, f.data.length, true);
    view.setUint32(offset + 24, f.data.length, true);
    view.setUint16(offset + 28, nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // extra field length
    view.setUint16(offset + 32, 0, true); // comment length
    view.setUint16(offset + 34, 0, true); // disk number start
    view.setUint16(offset + 36, 0, true); // internal file attrs
    view.setUint32(offset + 38, 0, true); // external file attrs
    view.setUint32(offset + 42, localOffsets[i], true);
    offset += 46;
    out.set(nameBytes, offset);
    offset += nameBytes.length;
  }

  // End of central directory record.
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true); // disk number
  view.setUint16(offset + 6, 0, true); // disk where central directory starts
  view.setUint16(offset + 8, files.length, true);
  view.setUint16(offset + 10, files.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true); // comment length

  return out;
}
