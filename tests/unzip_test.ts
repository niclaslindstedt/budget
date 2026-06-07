import { describe, expect, it } from "vitest";

import { buildZip } from "../src/utils/zip";
import { unzip } from "../src/utils/unzip";

// `buildZip` emits store-only (uncompressed) archives; `unzip` is its
// counterpart. A round-trip must preserve both text and binary entries
// byte-for-byte — the property-export archive relies on it.
describe("unzip", () => {
  it("round-trips a text entry and a binary entry through buildZip", async () => {
    const text = '{"hello":"wörld"}\n';
    const binary = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 42]);
    const archive = buildZip([
      { name: "manifest.json", data: text },
      { name: "files/photo.bin", data: binary },
    ]);

    const entries = await unzip(archive);
    expect(entries.size).toBe(2);
    expect(new TextDecoder().decode(entries.get("manifest.json"))).toBe(text);
    expect(Array.from(entries.get("files/photo.bin") ?? [])).toEqual(
      Array.from(binary),
    );
  });

  it("throws on input that isn't a zip archive", async () => {
    await expect(unzip(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});
