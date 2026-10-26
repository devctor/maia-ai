import { describe, expect, it, vi } from "vitest";
import { withRetries } from "./retry";

describe("withRetries", () => {
  it("returns the successful result from the second attempt", async () => {
    const attempts: number[] = [];

    const result = await withRetries(
      async (attempt) => {
        attempts.push(attempt);
        if (attempt === 1) {
          throw new Error("temporary");
        }
        return "ok";
      },
      {
        maxAttempts: 2,
        baseDelayMs: 0,
        retryable: () => true,
        sleep: async () => undefined,
      },
    );

    expect(result).toBe("ok");
    expect(attempts).toEqual([1, 2]);
  });

  it("does not retry a non-retryable error", async () => {
    const operation = vi.fn(async () => {
      throw new Error("permanent");
    });

    await expect(
      withRetries(operation, {
        maxAttempts: 3,
        baseDelayMs: 0,
        retryable: () => false,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow("permanent");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("exhausts the configured attempts and rethrows the last error", async () => {
    const attempts: number[] = [];
    const lastError = new Error("last");

    await expect(
      withRetries(
        async (attempt) => {
          attempts.push(attempt);
          throw attempt === 3 ? lastError : new Error("earlier");
        },
        {
          maxAttempts: 3,
          baseDelayMs: 0,
          retryable: () => true,
          sleep: async () => undefined,
        },
      ),
    ).rejects.toBe(lastError);
    expect(attempts).toEqual([1, 2, 3]);
  });

  it("uses exponentially growing full-jitter delays", async () => {
    const delays: number[] = [];

    await expect(
      withRetries(
        async () => {
          throw new Error("temporary");
        },
        {
          maxAttempts: 3,
          baseDelayMs: 100,
          retryable: () => true,
          random: () => 0.5,
          sleep: async (delay) => {
            delays.push(delay);
          },
        },
      ),
    ).rejects.toThrow("temporary");
    expect(delays).toEqual([50, 100]);
  });

  it("never retries an abort", async () => {
    const operation = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });

    await expect(
      withRetries(operation, {
        maxAttempts: 3,
        baseDelayMs: 0,
        retryable: () => true,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow("aborted");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
