import { describe, it, expect } from "vitest";
import {
  isRetryableError,
  calculateBackoffDelay,
} from "../../src/services/deliveryService.js";

describe("retryPolicy (Unit Tests)", () => {
  it("deve identificar status HTTP retryable (408, 429, 500, 502, 503, 504)", () => {
    expect(isRetryableError(null, 500)).toBe(true);
    expect(isRetryableError(null, 502)).toBe(true);
    expect(isRetryableError(null, 503)).toBe(true);
    expect(isRetryableError(null, 429)).toBe(true);
    expect(isRetryableError(null, 408)).toBe(true);
  });

  it("deve identificar status HTTP não-retryable (400, 401, 403, 404, 422)", () => {
    expect(isRetryableError(null, 400)).toBe(false);
    expect(isRetryableError(null, 401)).toBe(false);
    expect(isRetryableError(null, 403)).toBe(false);
    expect(isRetryableError(null, 404)).toBe(false);
    expect(isRetryableError(null, 422)).toBe(false);
  });

  it("deve identificar erros de timeout e rede como retryable", () => {
    expect(isRetryableError({ code: "ECONNRESET" }, null)).toBe(true);
    expect(isRetryableError({ code: "ETIMEDOUT" }, null)).toBe(true);
    expect(isRetryableError({ message: "timeout of 5000ms exceeded" }, null)).toBe(true);
  });

  it("deve calcular exponential backoff com limite máximo (maxDelay)", () => {
    const policy = { initialDelay: 1000, multiplier: 2, maxDelay: 10000 };

    const delay1 = calculateBackoffDelay(1, policy);
    const delay2 = calculateBackoffDelay(2, policy);
    const delay3 = calculateBackoffDelay(3, policy);
    const delayLarge = calculateBackoffDelay(10, policy);

    // Permitindo variação do jitter (10%)
    expect(delay1).toBeGreaterThanOrEqual(800);
    expect(delay1).toBeLessThanOrEqual(1200);

    expect(delay2).toBeGreaterThanOrEqual(1600);
    expect(delay2).toBeLessThanOrEqual(2400);

    expect(delay3).toBeGreaterThanOrEqual(3200);
    expect(delay3).toBeLessThanOrEqual(4800);

    // Limitado pelo maxDelay
    expect(delayLarge).toBeLessThanOrEqual(11500);
  });
});
