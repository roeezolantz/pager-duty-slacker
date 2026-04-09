/**
 * Generates a unique correlation ID for request tracing
 * Format: {prefix}-{timestamp}-{random}
 */
export function generateCorrelationId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}
