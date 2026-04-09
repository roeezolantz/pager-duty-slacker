import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types';
import { createLogger } from '../utils/logger';
import { generateCorrelationId } from '../utils/correlation-id';

const logger = createLogger({ service: 'error-handler' });

export function errorHandler(
  error: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = generateCorrelationId('err');

  logger.error('Request error', error, {
    correlationId,
    path: req.path,
    method: req.method,
  });

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        correlationId,
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      correlationId,
    },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND',
      statusCode: 404,
    },
  });
}
