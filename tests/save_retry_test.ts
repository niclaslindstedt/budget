import { describe, expect, it } from "vitest";

import {
  AuthError,
  ConflictError,
  RateLimitError,
} from "../src/storage/adapter";
import {
  backoffDelayMs,
  isRetryableSaveError,
  MAX_TRANSIENT_SAVE_RETRIES,
} from "../src/storage/save-retry";

describe("backoffDelayMs", () => {
  it("grows the cap geometrically per attempt (mid-jitter sample)", () => {
    // rand=0.5 lands exactly at 3/4 of the cap (cap/2 + 0.5*cap/2).
    const mid = () => 0.5;
    expect(backoffDelayMs(0, {}, mid)).toBe(375); // cap 500
    expect(backoffDelayMs(1, {}, mid)).toBe(750); // cap 1000
    expect(backoffDelayMs(2, {}, mid)).toBe(1500); // cap 2000
    expect(backoffDelayMs(3, {}, mid)).toBe(3000); // cap 4000
  });

  it("keeps every delay within [cap/2, cap) for equal jitter", () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const cap = Math.min(30_000, 500 * 2 ** attempt);
      expect(backoffDelayMs(attempt, {}, () => 0)).toBe(Math.round(cap / 2));
      // rand just under 1 approaches but never reaches the full cap.
      const high = backoffDelayMs(attempt, {}, () => 0.999999);
      expect(high).toBeGreaterThanOrEqual(Math.round(cap / 2));
      expect(high).toBeLessThanOrEqual(cap);
    }
  });

  it("caps the curve at maxMs no matter how high the attempt climbs", () => {
    // attempt 20 would be 500 * 2^20 ≈ 524M ms uncapped; clamp to 30s.
    expect(backoffDelayMs(20, {}, () => 0)).toBe(15_000); // 30000 / 2
    expect(backoffDelayMs(20, {}, () => 0.999999)).toBeLessThanOrEqual(30_000);
  });

  it("honours custom backoff options", () => {
    const delay = backoffDelayMs(
      2,
      { baseMs: 100, factor: 3, maxMs: 5000 },
      () => 0,
    );
    // cap = min(5000, 100 * 3^2) = 900; floor = 450.
    expect(delay).toBe(450);
  });

  it("treats negative or fractional attempts as attempt 0", () => {
    expect(backoffDelayMs(-3, {}, () => 0)).toBe(250);
    expect(backoffDelayMs(0.7, {}, () => 0)).toBe(250);
  });
});

describe("isRetryableSaveError", () => {
  it("does not retry the three typed adapter signals", () => {
    expect(isRetryableSaveError(new ConflictError({ text: "{}" }))).toBe(false);
    expect(isRetryableSaveError(new AuthError("expired"))).toBe(false);
    expect(isRetryableSaveError(new RateLimitError(1000))).toBe(false);
  });

  it("retries generic backend / network errors", () => {
    expect(isRetryableSaveError(new Error("Dropbox save failed: 500"))).toBe(
      true,
    );
    expect(isRetryableSaveError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableSaveError("some non-Error throw")).toBe(true);
  });
});

describe("MAX_TRANSIENT_SAVE_RETRIES", () => {
  it("is a small positive budget", () => {
    expect(MAX_TRANSIENT_SAVE_RETRIES).toBeGreaterThan(0);
    expect(MAX_TRANSIENT_SAVE_RETRIES).toBeLessThanOrEqual(10);
  });
});
