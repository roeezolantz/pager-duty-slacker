import winston from 'winston';
import { LogContext } from '../types';

const logLevel = process.env.LOG_LEVEL || 'info';

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'pd-slacker' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        }),
      ),
    }),
  ],
});

export class Logger {
  private context: Partial<LogContext>;

  constructor(context: Partial<LogContext> = {}) {
    this.context = context;
  }

  private log(level: string, message: string, meta?: Record<string, unknown>): void {
    logger.log(level, message, { ...this.context, ...meta });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorMeta = error instanceof Error
      ? {
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
        }
      : { error };

    this.log('error', message, { ...errorMeta, ...meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  child(context: Partial<LogContext>): Logger {
    return new Logger({ ...this.context, ...context });
  }
}

export const createLogger = (context?: Partial<LogContext>): Logger => {
  return new Logger(context);
};

export default createLogger();
