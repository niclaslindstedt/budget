import { describe, expect, it } from "vitest";

import { createSaveChain } from "../src/storage/save-chain";

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSaveChain", () => {
  it("runs two bodies serially even when the second is enqueued mid-flight", async () => {
    const chain = createSaveChain();
    const log: string[] = [];
    const a = deferred();
    const b = deferred();

    const pA = chain.run(async () => {
      log.push("a-start");
      await a.promise;
      log.push("a-end");
      return "a";
    });
    // B enqueues while A is still in flight.
    const pB = chain.run(async () => {
      log.push("b-start");
      await b.promise;
      log.push("b-end");
      return "b";
    });

    // Yield so A's body has a chance to start.
    await Promise.resolve();
    expect(log).toEqual(["a-start"]);

    a.resolve();
    await pA;
    expect(log).toEqual(["a-start", "a-end", "b-start"]);

    b.resolve();
    const result = await pB;
    expect(log).toEqual(["a-start", "a-end", "b-start", "b-end"]);
    expect(result).toBe("b");
  });

  it("coalesces a queued body when a newer body is enqueued", async () => {
    const chain = createSaveChain();
    const log: string[] = [];
    const a = deferred();

    // A starts.
    const pA = chain.run(async () => {
      log.push("a-start");
      await a.promise;
      log.push("a-end");
    });
    // B queues behind A.
    const pB = chain.run(async () => {
      log.push("b-ran");
    });
    // C queues — replaces B. B's promise resolves with undefined.
    const pC = chain.run(async () => {
      log.push("c-ran");
      return 42;
    });

    a.resolve();
    const [bResult, cResult] = await Promise.all([pB, pC]);
    await pA;

    // B never ran; C ran exactly once after A.
    expect(log).toEqual(["a-start", "a-end", "c-ran"]);
    expect(bResult).toBeUndefined();
    expect(cResult).toBe(42);
  });

  it("coalesces repeatedly when many bodies pile up behind a single in-flight save", async () => {
    const chain = createSaveChain();
    const log: string[] = [];
    const a = deferred();

    const pA = chain.run(async () => {
      log.push("a-start");
      await a.promise;
      log.push("a-end");
    });
    const dropped = [
      chain.run(async () => {
        log.push("b-ran");
      }),
      chain.run(async () => {
        log.push("c-ran");
      }),
      chain.run(async () => {
        log.push("d-ran");
      }),
    ];
    const pLatest = chain.run(async () => {
      log.push("e-ran");
    });

    a.resolve();
    await Promise.all([...dropped, pLatest, pA]);

    // Only the in-flight body and the latest queued body run.
    expect(log).toEqual(["a-start", "a-end", "e-ran"]);
    for (const p of dropped) {
      await expect(p).resolves.toBeUndefined();
    }
  });

  it("propagates body rejections to the body's caller without poisoning the chain", async () => {
    const chain = createSaveChain();
    const a = deferred();

    const pA = chain.run(async () => {
      await a.promise;
      throw new Error("boom");
    });
    const pB = chain.run(async () => "after-failure");

    a.resolve();
    await expect(pA).rejects.toThrow("boom");
    // The next queued body still runs.
    await expect(pB).resolves.toBe("after-failure");
  });

  it("runs a freshly queued body immediately when the chain is idle", async () => {
    const chain = createSaveChain();
    const log: string[] = [];

    await chain.run(async () => {
      log.push("a");
    });
    await chain.run(async () => {
      log.push("b");
    });

    expect(log).toEqual(["a", "b"]);
  });

  it("queues a new body after the chain has drained, without replaying the dropped slot", async () => {
    const chain = createSaveChain();
    const log: string[] = [];
    const a = deferred();

    const pA = chain.run(async () => {
      await a.promise;
      log.push("a-end");
    });
    // B queued behind A.
    const pB = chain.run(async () => {
      log.push("b-ran");
    });
    // C replaces B before A finishes.
    const pC = chain.run(async () => {
      log.push("c-ran");
    });

    a.resolve();
    await Promise.all([pA, pB, pC]);
    expect(log).toEqual(["a-end", "c-ran"]);

    // After the chain drains, a fresh body runs cleanly.
    await chain.run(async () => {
      log.push("d-ran");
    });
    expect(log).toEqual(["a-end", "c-ran", "d-ran"]);
  });
});
