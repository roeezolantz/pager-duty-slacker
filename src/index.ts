import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

import express, { Request, Response, Express } from 'express';
import { loadConfig } from './config/config';
import { OnCallService } from './services/oncall.service';
import { Config, HealthStatus } from './types';
import { createLogger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

const logger = createLogger({ service: 'main' });
const app: Express = express();

let onCallService: OnCallService | null = null;
let config: Config | null = null;

const packageJson = require('../package.json');
const APP_VERSION = packageJson.version;

async function initialize(): Promise<void> {
  try {
    logger.info('Starting PD-Slacker', { version: APP_VERSION });

    const useGCPSecrets = process.env.NODE_ENV === 'production';
    config = await loadConfig(useGCPSecrets);

    onCallService = new OnCallService(config);

    logger.info('Initialization complete');
  } catch (error) {
    logger.error('Failed to initialize application', error);
    process.exit(1);
  }
}

app.use(express.json());

app.get('/health', async (_req: Request, res: Response) => {
  // Basic liveness check - service is running
  const health: HealthStatus = {
    status: onCallService ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    services: {
      pagerduty: onCallService !== null,
      slack: onCallService !== null,
    },
  };

  const statusCode = onCallService ? 200 : 503;
  res.status(statusCode).json(health);
});

app.get('/ready', async (_req: Request, res: Response) => {
  try {
    if (!onCallService) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
        error: 'Service not initialized',
      });
      return;
    }

    const serviceHealth = await onCallService.healthCheck();
    const isHealthy = serviceHealth.pagerduty && serviceHealth.slack;

    const health: HealthStatus = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      services: serviceHealth,
    };

    res.status(isHealthy ? 200 : 503).json(health);
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/notify', async (_req: Request, res: Response) => {
  try {
    logger.info('Received notification trigger request');

    if (!onCallService) {
      res.status(503).json({
        error: 'Service not initialized',
      });
      return;
    }

    const result = await onCallService.sendNextOnCallNotification();

    logger.info('Notification sent successfully', {
      messageTimestamp: result.messageTimestamp,
    });

    res.json({
      success: true,
      message: 'On-call notification sent successfully',
      timestamp: new Date().toISOString(),
      messageTimestamp: result.messageTimestamp,
    });
  } catch (error) {
    logger.error('Failed to send notification', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// PagerDuty webhook endpoint - called when on-call changes
app.post('/webhook/pagerduty', async (req: Request, res: Response) => {
  try {
    logger.info('Received PagerDuty webhook', {
      eventType: req.body?.event?.event_type,
      resourceType: req.body?.event?.resource_type,
    });

    if (!onCallService) {
      res.status(503).json({
        error: 'Service not initialized',
      });
      return;
    }

    // PagerDuty sends various event types, we care about schedule changes
    const event = req.body?.event;
    const eventType = event?.event_type;

    // Handle on-call change events
    // PagerDuty webhook events: https://developer.pagerduty.com/docs/webhooks/v3-overview/
    if (
      eventType === 'oncall_handoff.scheduled' ||
      eventType === 'oncall_handoff.immediate' ||
      eventType === 'schedule.updated'
    ) {
      logger.info('Processing on-call change event', { eventType });

      const result = await onCallService.updateOnCallGroup();

      if (result.success) {
        logger.info('Successfully updated @oncall group from webhook', {
          email: result.email,
        });
        res.json({
          success: true,
          message: '@oncall group updated successfully',
          email: result.email,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.warn('Failed to update @oncall group from webhook', {
          error: result.error,
        });
        res.status(500).json({
          success: false,
          error: result.error,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      // Acknowledge other events but don't process them
      logger.debug('Ignoring non-oncall event', { eventType });
      res.json({
        success: true,
        message: 'Event acknowledged but not processed',
        eventType,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Failed to process PagerDuty webhook', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Manual endpoint to sync @oncall group with current on-call
app.post('/sync-oncall', async (_req: Request, res: Response) => {
  try {
    logger.info('Received manual sync request');

    if (!onCallService) {
      res.status(503).json({
        error: 'Service not initialized',
      });
      return;
    }

    const result = await onCallService.updateOnCallGroup();

    if (result.success) {
      logger.info('Successfully synced @oncall group', { email: result.email });
      res.json({
        success: true,
        message: '@oncall group synced successfully',
        email: result.email,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.warn('Failed to sync @oncall group', { error: result.error });
      res.status(500).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Failed to sync @oncall group', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer(): Promise<void> {
  await initialize();

  if (!config) {
    logger.error('Config not loaded after initialization');
    process.exit(1);
  }

  const port = config.app.port;

  app.listen(port, () => {
    logger.info(`Server started successfully`, {
      port,
      environment: config!.app.nodeEnv,
      version: APP_VERSION,
    });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Failed to start server', error);
    process.exit(1);
  });
}

export { app, initialize };
