export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  retryable: (error: unknown) => boolean;
  /** Injected so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected so jitter is reproducible in tests. */
  random?: () => number;
}

/**
 * Retries a transient failure with exponential backoff and full jitter.
 *
 * Why jitter: without it, every client that failed at the same moment retries at the same moment,
 * which is how a rate limit turns into a self-inflicted stampede. `delay = random() * base * 2^(n-1)`
 * spreads the retries across the window instead of synchronising them.
 *
 * The attempt count is exact (not "retries + 1"), and anything that is not explicitly retryable
 * fails immediately: retrying a malformed request only wastes quota and time.
 */
export async function withRetries<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const maxAttempts = Math.max(1, options.maxAttempts);

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      if (isAbortError(error) || !options.retryable(error) || attempt === maxAttempts) {
        throw error;
      }

      const ceiling = options.baseDelayMs * 2 ** (attempt - 1);
      await sleep(Math.round(random() * ceiling));
    }
  }

  throw lastError;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
