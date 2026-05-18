import { describe, expect, it, vi } from "vitest";

import { ConflictError } from "../src/storage/adapter";
import { createFolderAdapter } from "../src/storage/folder-adapter";

// Minimal in-memory mock of the File System Access API surface the
// adapter touches. We only model:
//   - directoryHandle.getFileHandle(name, { create })
//   - fileHandle.getFile() -> { lastModified, text() }
//   - fileHandle.createWritable() -> { write(text), close() }
// Permission errors are simulated by throwing DOMException with the
// real names the spec uses ("NotFoundError" / "NotAllowedError").
type Stored = { text: string; mtime: number };

function createMockDirectory(initial?: Stored | null) {
  // Boxed so multiple file-handle calls share the same backing store
  // — closely mirrors how a real `FileSystemDirectoryHandle` always
  // returns the same on-disk state regardless of how many handles
  // you ask for.
  const slot: { current: Stored | null } = { current: initial ?? null };
  let nextMtimeOffset = 0;

  function makeFileHandle(name: string) {
    return {
      name,
      async getFile() {
        if (slot.current === null) {
          throw new DOMException("File not found", "NotFoundError");
        }
        return {
          lastModified: slot.current.mtime,
          text: async () => slot.current!.text,
        };
      },
      async createWritable() {
        let buffer = "";
        return {
          async write(text: string) {
            buffer = text;
          },
          async close() {
            // Bump the mtime monotonically on each close so revision
            // comparisons in the test see a real change. Real
            // filesystems quantize differently — the adapter only
            // cares that the value strictly differs after a write.
            nextMtimeOffset += 1000;
            slot.current = {
              text: buffer,
              mtime: Date.now() + nextMtimeOffset,
            };
          },
        };
      },
    };
  }

  const dirHandle = {
    name: "Mock",
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!options?.create && slot.current === null) {
        throw new DOMException("File not found", "NotFoundError");
      }
      return makeFileHandle(name);
    },
  };

  return {
    handle: dirHandle as unknown as FileSystemDirectoryHandle,
    slot,
  };
}

describe("folderAdapter", () => {
  it("load() returns null when budget.json is missing", async () => {
    const { handle } = createMockDirectory(null);
    const adapter = createFolderAdapter({ directoryHandle: handle });
    const snap = await adapter.load();
    expect(snap).toBeNull();
  });

  it("load() returns text + revision when the file is present", async () => {
    const { handle } = createMockDirectory({
      text: '{"hello":"world"}',
      mtime: 12345,
    });
    const adapter = createFolderAdapter({ directoryHandle: handle });
    const snap = await adapter.load();
    expect(snap).toEqual({ text: '{"hello":"world"}', revision: "12345" });
  });

  it("save() writes the file and returns the new revision", async () => {
    const { handle, slot } = createMockDirectory(null);
    const adapter = createFolderAdapter({ directoryHandle: handle });
    const snap = await adapter.save('{"a":1}');
    expect(slot.current?.text).toBe('{"a":1}');
    expect(snap.text).toBe('{"a":1}');
    expect(snap.revision).toBe(String(slot.current?.mtime));
  });

  it("save() with a stale baseRevision throws ConflictError carrying the current snapshot", async () => {
    const { handle } = createMockDirectory({
      text: "remote-newer",
      mtime: 99999,
    });
    const adapter = createFolderAdapter({ directoryHandle: handle });
    await expect(adapter.save("from-old-base", "1234")).rejects.toMatchObject({
      name: "ConflictError",
      remote: { text: "remote-newer", revision: "99999" },
    });
  });

  it("save() with the current revision succeeds and returns the post-write revision", async () => {
    const { handle, slot } = createMockDirectory({
      text: "old",
      mtime: 1000,
    });
    const adapter = createFolderAdapter({ directoryHandle: handle });
    const snap = await adapter.save("new", "1000");
    expect(snap.text).toBe("new");
    // Post-write revision must reflect the new mtime, not the pre-write one.
    expect(snap.revision).toBe(String(slot.current?.mtime));
    expect(snap.revision).not.toBe("1000");
  });

  it("save() with a baseRevision but a now-missing file throws ConflictError", async () => {
    // Edge case: caller believes a file exists (has a revision token),
    // but the user deleted it out-of-band. Surfacing this as a conflict
    // — rather than silently re-creating the file — lets the storage
    // hook decide how to recover.
    const { handle } = createMockDirectory(null);
    const adapter = createFolderAdapter({ directoryHandle: handle });
    await expect(adapter.save("text", "stale-rev")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("load() invokes onPermissionLost when a NotAllowedError surfaces", async () => {
    const onPermissionLost = vi.fn();
    const failingHandle = {
      name: "Mock",
      async getFileHandle() {
        throw new DOMException("denied", "NotAllowedError");
      },
    } as unknown as FileSystemDirectoryHandle;
    const adapter = createFolderAdapter({
      directoryHandle: failingHandle,
      onPermissionLost,
    });
    await expect(adapter.load()).rejects.toBeInstanceOf(DOMException);
    expect(onPermissionLost).toHaveBeenCalledTimes(1);
  });

  it("exposes id and label so the picker can render the option", () => {
    const { handle } = createMockDirectory(null);
    const adapter = createFolderAdapter({ directoryHandle: handle });
    expect(adapter.id).toBe("folder");
    expect(adapter.label).toBe("Local folder");
  });
});
