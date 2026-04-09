import CircuitBreaker from 'opossum';
import { createLogger } from './logger';
import { AppError } from '../types';

const logger = createLogger({ service: 'circuit-breaker' });

export interface CircuitBreakerConfig {
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
  rollingCountTimeout: number;
  rollingCountBuckets: number;
  name?: string;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  timeout: 10000, // 10 seconds
  errorThresholdPercentage: 50,
  resetTimeout: 30000, // 30 seconds
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
};

export function createCircuitBreaker<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  config: Partial<CircuitBreakerConfig> = {},
): CircuitBreaker<T, R> {
  const options = { ...DEFAULT_CONFIG, ...config };
  const breaker = new CircuitBreaker(fn, options);

  breaker.on('open', () => {
    logger.warn(`Circuit breaker opened`, { name: options.name || 'unknown' });
  });

  breaker.on('halfOpen', () => {
    logger.info(`Circuit breaker half-open, attempting recovery`, {
      name: options.name || 'unknown',
    });
  });

  breaker.on('close', () => {
    logger.info(`Circuit breaker closed, service recovered`, {
      name: options.name || 'unknown',
    });
  });

  breaker.on('timeout', () => {
    logger.error(`Circuit breaker timeout`, { name: options.name || 'unknown' });
  });

  breaker.fallback(() => {
    throw new AppError(
      `Circuit breaker is open for ${options.name || 'unknown'}. Service temporarily unavailable.`,
      503,
      'CIRCUIT_BREAKER_OPEN',
    );
  });

  return breaker;
}

/**
 * Cleans up event listeners from a circuit breaker to prevent memory leaks.
 * Call this when a circuit breaker is no longer needed (e.g., during testing or service shutdown).
 */
export function cleanupCircuitBreaker(breaker: CircuitBreaker): void {
  breaker.removeAllListeners();
  breaker.shutdown();
}

export function getCircuitBreakerStats(breaker: CircuitBreaker): {
  state: string;
  stats: CircuitBreaker.Stats;
} {
  return {
    state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
    stats: breaker.stats,
  };
}
