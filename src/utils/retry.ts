import { Logger, createLogger } from './logger';

const logger = createLogger({ service: 'retry-util' });

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  operationLogger?: Logger,
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const log = operationLogger || logger;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      log.debug(`Attempt ${attempt + 1}/${opts.maxRetries + 1}`);
      return await fn();
    } catch (error) {
      const currentError = error as Error;

      if (attempt === opts.maxRetries) {
        log.error(`All retry attempts exhausted`, currentError, {
          attempts: attempt + 1,
          maxRetries: opts.maxRetries,
        });
        throw currentError;
      }

      const isRetryable =
        !opts.retryableErrors ||
        opts.retryableErrors.some((errMsg) => currentError.message.includes(errMsg));

      if (!isRetryable) {
        log.error(`Non-retryable error encountered`, currentError, {
          error: currentError.message,
        });
        throw currentError;
      }

      const delay = Math.min(
        opts.baseDelay * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelay,
      );

      log.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
        error: currentError.message,
        nextAttempt: attempt + 2,
      });

      await sleep(delay);
    }
  }

  // This line should never be reached due to the throw in the loop,
  // but TypeScript can't prove it. Throw a clear error if we somehow get here.
  throw new Error('Retry loop completed without returning or throwing');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const networkErrors = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'EPIPE',
      'EAI_AGAIN',
    ];
    return networkErrors.some((code) => error.message.includes(code));
  }
  return false;
}

export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.toLowerCase().includes('rate limit');
  }
  return false;
}
