import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import CircuitBreaker from 'opossum';
import { Config, PagerDutyUser, PagerDutyScheduleEntry, PagerDutyError } from '../types';
import { createLogger } from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuit-breaker';
import { retryWithBackoff } from '../utils/retry';
import { generateCorrelationId } from '../utils/correlation-id';

const logger = createLogger({ service: 'pagerduty-service' });

export class PagerDutyService {
  private client: AxiosInstance;
  private config: Config;
  private getScheduleBreaker: CircuitBreaker;
  private getUserBreaker: CircuitBreaker;

  constructor(config: Config) {
    this.config = config;

    this.client = axios.create({
      baseURL: 'https://api.pagerduty.com',
      headers: {
        Accept: 'application/vnd.pagerduty+json;version=2',
        Authorization: `Token token=${config.pagerduty.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    axiosRetry(this.client, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429 ||
          (error.response?.status ?? 0) >= 500
        );
      },
    });

    this.getScheduleBreaker = createCircuitBreaker(
      this.getScheduleEntriesInternal.bind(this),
      { name: 'pagerduty-get-schedule' },
    );

    this.getUserBreaker = createCircuitBreaker(this.getUserDetailsInternal.bind(this), {
      name: 'pagerduty-get-user',
    });

    logger.info('PagerDuty service initialized');
  }

  async getCurrentOnCall(): Promise<PagerDutyScheduleEntry | null> {
    const correlationId = generateCorrelationId('pd');
    const log = logger.child({ correlationId, method: 'getCurrentOnCall' });

    const now = new Date();
    // Query a small window around now to find current on-call
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    log.info('Fetching current on-call person', {
      scheduleId: this.config.pagerduty.scheduleId,
      since: oneHourAgo.toISOString(),
      until: oneHourLater.toISOString(),
    });

    try {
      const entries = (await this.getScheduleBreaker.fire(
        oneHourAgo,
        oneHourLater,
        correlationId,
      )) as PagerDutyScheduleEntry[];

      if (!entries || entries.length === 0) {
        log.warn('No one is currently on-call');
        return null;
      }

      // Find the entry that covers "now"
      const currentEntry = entries.find((entry) => {
        const start = new Date(entry.start);
        const end = new Date(entry.end);
        return start <= now && now < end;
      });

      if (!currentEntry) {
        log.warn('No active on-call entry found for current time');
        return null;
      }

      log.info('Successfully fetched current on-call', {
        start: currentEntry.start,
        end: currentEntry.end,
        userId: currentEntry.user.id,
      });

      return currentEntry;
    } catch (error) {
      log.error('Failed to fetch current on-call', error);
      throw this.handleError(error, 'Failed to fetch current on-call');
    }
  }

  async getNextOnCallShift(): Promise<PagerDutyScheduleEntry> {
    const correlationId = generateCorrelationId('pd');
    const log = logger.child({ correlationId, method: 'getNextOnCallShift' });

    // Query from now to 30 days ahead to find the next shift
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    log.info('Fetching next on-call shift', {
      scheduleId: this.config.pagerduty.scheduleId,
      since: now.toISOString(),
      until: thirtyDaysLater.toISOString(),
    });

    try {
      const entries = (await this.getScheduleBreaker.fire(
        now,
        thirtyDaysLater,
        correlationId,
      )) as PagerDutyScheduleEntry[];

      if (!entries || entries.length === 0) {
        log.warn('No on-call entries found');
        throw new PagerDutyError('No on-call entries found', 404);
      }

      // Sort entries by start time
      const sortedEntries = entries.sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );

      // Find the next shift (first one that starts after now)
      // If no future shift exists, there might be a current shift - skip it and get the one after
      let nextShift = sortedEntries.find((entry) => new Date(entry.start) > now);

      // If no future shift found but we have entries, the first entry is current
      // and the second entry (if exists) is the next shift
      if (!nextShift && sortedEntries.length > 1) {
        nextShift = sortedEntries[1];
      }

      if (!nextShift) {
        log.warn('No upcoming on-call shift found');
        throw new PagerDutyError('No upcoming on-call shift found', 404);
      }

      log.info('Successfully fetched next on-call shift', {
        start: nextShift.start,
        end: nextShift.end,
        userId: nextShift.user.id,
      });

      return nextShift;
    } catch (error) {
      log.error('Failed to fetch next on-call shift', error);
      throw this.handleError(error, 'Failed to fetch next on-call shift');
    }
  }

  private async getScheduleEntriesInternal(
    startDate: Date,
    endDate: Date,
    correlationId: string,
  ): Promise<PagerDutyScheduleEntry[]> {
    const log = logger.child({ correlationId });

    return retryWithBackoff(
      async () => {
        // Use the schedule endpoint to get actual shift times
        const response = await this.client.get(
          `/schedules/${this.config.pagerduty.scheduleId}`,
          {
            params: {
              since: startDate.toISOString(),
              until: endDate.toISOString(),
            },
          },
        );

        const entries = response.data?.schedule?.final_schedule
          ?.rendered_schedule_entries as PagerDutyScheduleEntry[] | undefined;

        if (!entries || entries.length === 0) {
          throw new PagerDutyError('No schedule entries found', 404);
        }

        return entries;
      },
      { maxRetries: 3 },
      log,
    );
  }

  async getUserDetails(userId: string): Promise<PagerDutyUser> {
    const correlationId = generateCorrelationId('pd');
    const log = logger.child({ correlationId, method: 'getUserDetails' });

    log.info('Fetching user details', { userId });

    try {
      const user = (await this.getUserBreaker.fire(userId, correlationId)) as PagerDutyUser;
      log.info('Successfully fetched user details', { userId, userName: user.name });
      return user;
    } catch (error) {
      log.error('Failed to fetch user details', error, { userId });
      throw this.handleError(error, `Failed to fetch user details for ${userId}`);
    }
  }

  private async getUserDetailsInternal(
    userId: string,
    correlationId: string,
  ): Promise<PagerDutyUser> {
    const log = logger.child({ correlationId });

    return retryWithBackoff(
      async () => {
        const response = await this.client.get(`/users/${userId}`, {
          params: {
            include: ['contact_methods'],
          },
        });

        if (!response.data?.user) {
          throw new PagerDutyError(`User ${userId} not found`, 404);
        }

        return response.data.user as PagerDutyUser;
      },
      { maxRetries: 3 },
      log,
    );
  }

  async testConnection(): Promise<boolean> {
    const log = logger.child({ method: 'testConnection' });

    try {
      const response = await this.client.get('/abilities');
      log.info('PagerDuty connection test successful');
      return response.status === 200;
    } catch (error) {
      log.error('PagerDuty connection test failed', error);
      return false;
    }
  }

  private handleError(error: unknown, context: string): PagerDutyError {
    if (error instanceof PagerDutyError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.error?.message || error.message;
      return new PagerDutyError(`${context}: ${message}`, status, error.response?.data);
    }

    if (error instanceof Error) {
      return new PagerDutyError(`${context}: ${error.message}`, 500);
    }

    return new PagerDutyError(context, 500);
  }
}
