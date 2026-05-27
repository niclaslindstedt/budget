// Serialises and coalesces async save calls. At most one body is
// in flight; at most one body is queued behind it. A `run` while a
// body is already queued *replaces* the queued body — only the
// latest queued body actually executes when the in-flight body
// settles. Dropped bodies never run; their returned promise
// resolves with `undefined`.
//
// Why this is safe to coalesce: every save body is a full-blob
// write of the current in-memory state, so the newer body's bytes
// subsume anything the older body would have written. A user
// editing in Metadata mode over a slow cellular link could
// otherwise queue ten "save" bodies behind a single in-flight
// upload; with coalescing the queue stays capped at one and the
// catch-up save carries everything.
//
// Why this is safe to serialise: `adapter.save(text, baseRev)` is
// optimistic-concurrency keyed on baseRev. Two bodies running in
// parallel both read `lastSnapshot.current?.revision` before the
// first has updated it, both send the same baseRev, the cloud
// accepts the first and rejects the second with a 409 — surfacing
// as a phantom "Sync conflict" modal on a single-device account.
// Running bodies one at a time guarantees the second body sees the
// fresh rev from the first.

export type SaveChain = {
  // Queue body to run after any in-flight save. If another body is
  // already queued behind the in-flight one, that queued body is
  // dropped in favour of this one. The returned promise resolves
  // with the body's value (or `undefined` if dropped before running),
  // or rejects if the body itself rejects.
  run<T>(body: () => Promise<T>): Promise<T | undefined>;
};

export function createSaveChain(): SaveChain {
  type Slot = {
    body: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  };
  let inFlight = false;
  let queued: Slot | null = null;

  async function pump(): Promise<void> {
    if (inFlight || !queued) return;
    const slot = queued;
    queued = null;
    inFlight = true;
    try {
      const result = await slot.body();
      slot.resolve(result);
    } catch (err) {
      slot.reject(err);
    } finally {
      inFlight = false;
      void pump();
    }
  }

  return {
    run<T>(body: () => Promise<T>): Promise<T | undefined> {
      return new Promise<T | undefined>((resolve, reject) => {
        // A previously-queued body is now redundant — the newer
        // body's full-blob write subsumes it. Resolve the dropped
        // caller's promise with `undefined` so it doesn't hang.
        if (queued) {
          queued.resolve(undefined);
        }
        queued = {
          body: body as () => Promise<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject,
        };
        void pump();
      });
    },
  };
}
