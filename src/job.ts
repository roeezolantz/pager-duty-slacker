import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

import { loadConfig } from './config/config';
import { OnCallService } from './services/oncall.service';
import { createLogger } from './utils/logger';

const logger = createLogger({ service: 'job' });
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('../package.json');
const APP_VERSION = packageJson.version;

async function runJob(): Promise<void> {
  try {
    logger.info('Starting PD-Slacker Job', { version: APP_VERSION });

    const useGCPSecrets = process.env.NODE_ENV === 'production';
    const config = await loadConfig(useGCPSecrets);

    const onCallService = new OnCallService(config);

    logger.info('Sending next on-call notification');
    const result = await onCallService.sendNextOnCallNotification();

    logger.info('Notification sent successfully', {
      messageTimestamp: result.messageTimestamp,
    });

    logger.info('Job completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Job failed', error);
    process.exit(1);
  }
}

runJob();
