import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Config, ConfigError } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'config' });

let cachedConfig: Config | null = null;
let configLoadPromise: Promise<Config> | null = null;

async function getSecretFromGCP(secretName: string): Promise<string> {
  const client = new SecretManagerServiceClient();
  const projectId = process.env.GCP_PROJECT_ID;

  if (!projectId) {
    throw new ConfigError('GCP_PROJECT_ID environment variable is required');
  }

  const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;

  try {
    const [version] = await client.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString();

    if (!payload) {
      throw new ConfigError(`Secret ${secretName} is empty`);
    }

    return payload;
  } catch (error) {
    logger.error(`Failed to fetch secret from GCP`, error, { secretName });
    throw new ConfigError(`Failed to fetch secret: ${secretName}`, error);
  }
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new ConfigError(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export async function loadConfig(useGCPSecrets = false): Promise<Config> {
  // If config is already cached, return it
  if (cachedConfig) {
    return cachedConfig;
  }

  // If a load is already in progress, wait for it (prevents race condition)
  if (configLoadPromise) {
    return configLoadPromise;
  }

  // Start loading config
  configLoadPromise = (async (): Promise<Config> => {
    logger.info('Loading configuration', { useGCPSecrets });

    try {
      let pagerdutyApiKey: string;
      let slackBotToken: string;

      if (useGCPSecrets && process.env.NODE_ENV === 'production') {
        logger.info('Loading secrets from GCP Secret Manager');
        [pagerdutyApiKey, slackBotToken] = await Promise.all([
          getSecretFromGCP('pagerduty-api-key'),
          getSecretFromGCP('slack-bot-token'),
        ]);
      } else {
        logger.info('Loading secrets from environment variables');
        pagerdutyApiKey = getEnvOrThrow('PAGERDUTY_API_KEY');
        slackBotToken = getEnvOrThrow('SLACK_BOT_TOKEN');
      }

      // Parse port and validate it's a number
      const portStr = getEnvOrDefault('PORT', '8080');
      const port = parseInt(portStr, 10);

      if (isNaN(port)) {
        throw new ConfigError(`PORT must be a valid number, got: ${portStr}`);
      }

      const config: Config = {
        pagerduty: {
          apiKey: pagerdutyApiKey,
          scheduleId: getEnvOrThrow('PAGERDUTY_SCHEDULE_ID'),
        },
        slack: {
          botToken: slackBotToken,
          channel: getEnvOrThrow('SLACK_CHANNEL'),
        },
        app: {
          port,
          nodeEnv: getEnvOrDefault('NODE_ENV', 'development'),
          logLevel: getEnvOrDefault('LOG_LEVEL', 'info'),
          timezone: getEnvOrDefault('TIMEZONE', 'Asia/Jerusalem'),
        },
      };

      if (process.env.GCP_PROJECT_ID) {
        config.gcp = {
          projectId: process.env.GCP_PROJECT_ID,
        };
      }

      validateConfig(config);

      cachedConfig = config;
      logger.info('Configuration loaded successfully');

      return config;
    } catch (error) {
      logger.error('Failed to load configuration', error);
      // Clear the promise so it can be retried
      configLoadPromise = null;
      throw error;
    }
  })();

  return configLoadPromise;
}

function validateConfig(config: Config): void {
  if (!config.pagerduty.apiKey || !config.pagerduty.apiKey.startsWith('u+')) {
    throw new ConfigError('Invalid PagerDuty API key format');
  }

  if (!config.slack.botToken || !config.slack.botToken.startsWith('xoxb-')) {
    throw new ConfigError('Invalid Slack bot token format');
  }

  if (!config.slack.channel.startsWith('#')) {
    throw new ConfigError('Slack channel must start with #');
  }

  if (config.app.port < 1 || config.app.port > 65535) {
    throw new ConfigError('Port must be between 1 and 65535');
  }

  logger.debug('Configuration validated successfully');
}

export function clearConfigCache(): void {
  cachedConfig = null;
  configLoadPromise = null;
}
