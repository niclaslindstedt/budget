// Minimal ZIP reader — the counterpart to `buildZip` in `./zip.ts`. Reads a
// ZIP archive into a `name -> bytes` map, handling both stored (method 0,
// what `buildZip` emits) and deflated (method 8) entries. Deflate is
// inflated with the platform `DecompressionStream("deflate-raw")`, the same
// primitive `src/storage/xlsx-reader.ts` relies on, so no third-party
// dependency is pulled in (the project's bundle-size discipline rules that
// out). All multi-byte fields are little-endian.
//
// Scoped to what a property-export archive needs: no ZIP64, no encryption,
// no multi-disk archives. A malformed / unsupported archive throws.

const textDecoder = new TextDecoder();

// Locate the end-of-central-directory record by scanning backwards for its
// signature. Our own archives carry no trailing comment so it sits at the
// very end, but scanning back tolerates one if a foreign tool added it.
function findEndOfCentralDirectory(view: DataView): number {
  const minLen = 22;
  if (view.byteLength < minLen) throw new Error("not a zip archive");
  // The comment is capped at 0xffff, so the EOCD starts no earlier than this.
  const earliest = Math.max(0, view.byteLength - minLen - 0xffff);
  for (let i = view.byteLength - minLen; i >= earliest; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  throw new Error("end-of-central-directory record not found");
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(
    new Blob([bytes as BlobPart]).stream().pipeThrough(
      // "deflate-raw" — ZIP stores the raw DEFLATE stream with no zlib header.
      new DecompressionStream("deflate-raw"),
    ),
  );
  return new Uint8Array(await stream.arrayBuffer());
}

// Parse a ZIP archive into a map of entry name -> raw bytes. Directory
// entries (names ending in "/") are skipped — only files carry bytes.
export async function unzip(
  archive: Uint8Array,
): Promise<Map<string, Uint8Array>> {
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  const eocd = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true); // central directory offset

  const result = new Map<string, Uint8Array>();
  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("bad central directory header");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = textDecoder.decode(
      archive.subarray(offset + 46, offset + 46 + nameLen),
    );
    offset += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue; // directory entry, no bytes

    // Read the local file header to find where this entry's data starts —
    // its own name / extra lengths can differ from the central record's.
    if (view.getUint32(localOffset, true) !== 0x04034b50)
      throw new Error("bad local file header");
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = archive.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      // Stored — copy so the slice doesn't keep the whole archive alive.
      result.set(name, raw.slice());
    } else if (method === 8) {
      result.set(name, await inflateRaw(raw));
    } else {
      throw new Error(`unsupported compression method ${method}`);
    }
  }
  return result;
}
