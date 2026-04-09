import { Config, OnCallPerson, NotificationResult, AppError } from '../types';
import { PagerDutyService } from './pagerduty.service';
import { SlackService } from './slack.service';
import { createLogger } from '../utils/logger';
import { generateCorrelationId } from '../utils/correlation-id';

const logger = createLogger({ service: 'oncall-service' });

export class OnCallService {
  private pagerDutyService: PagerDutyService;
  private slackService: SlackService;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.pagerDutyService = new PagerDutyService(config);
    this.slackService = new SlackService(config);

    logger.info('OnCall service initialized');
  }

  async sendNextOnCallNotification(): Promise<NotificationResult> {
    const correlationId = generateCorrelationId('oncall');
    const log = logger.child({ correlationId, method: 'sendNextOnCallNotification' });

    log.info('Starting next on-call notification process');

    try {
      const onCallPerson = await this.getNextOnCallPerson();

      log.info('Sending notification to Slack', {
        onCallName: onCallPerson.name,
        onCallEmail: onCallPerson.email,
        scheduleStart: onCallPerson.scheduleStart.toISOString(),
        scheduleEnd: onCallPerson.scheduleEnd.toISOString(),
      });

      const result = await this.slackService.postOnCallNotification(
        onCallPerson.name,
        onCallPerson.email,
        onCallPerson.scheduleStart,
        onCallPerson.scheduleEnd,
      );

      log.info('Next on-call notification sent successfully', {
        messageTs: result.messageTimestamp,
      });

      return result;
    } catch (error) {
      log.error('Failed to send next on-call notification', error);
      throw this.handleError(error, 'Failed to send next on-call notification');
    }
  }

  private async getNextOnCallPerson(): Promise<OnCallPerson> {
    const log = logger.child({ method: 'getNextOnCallPerson' });

    const nextShift = await this.pagerDutyService.getNextOnCallShift();

    log.debug('Fetching user details from PagerDuty', { userId: nextShift.user.id });

    const userDetails = await this.pagerDutyService.getUserDetails(nextShift.user.id);

    const phone = this.extractPhoneNumber(userDetails.contact_methods);

    const onCallPerson: OnCallPerson = {
      name: userDetails.name,
      email: userDetails.email,
      phone,
      scheduleStart: new Date(nextShift.start),
      scheduleEnd: new Date(nextShift.end),
      scheduleUrl: `https://app.pagerduty.com/schedules/${this.config.pagerduty.scheduleId}`,
    };

    log.info('Successfully fetched next on-call person details', {
      name: onCallPerson.name,
      email: onCallPerson.email,
      scheduleStart: onCallPerson.scheduleStart.toISOString(),
      scheduleEnd: onCallPerson.scheduleEnd.toISOString(),
    });

    return onCallPerson;
  }

  private extractPhoneNumber(
    contactMethods?: Array<{ type: string; address: string }>,
  ): string | undefined {
    if (!contactMethods || contactMethods.length === 0) {
      return undefined;
    }

    const phoneContact = contactMethods.find(
      (method) => method.type === 'phone_contact_method' || method.type === 'sms_contact_method',
    );

    return phoneContact?.address;
  }

  async updateOnCallGroup(): Promise<{ success: boolean; error?: string; email?: string }> {
    const correlationId = generateCorrelationId('oncall');
    const log = logger.child({ correlationId, method: 'updateOnCallGroup' });

    log.info('Updating @oncall Slack group with current on-call person');

    try {
      const currentOnCall = await this.pagerDutyService.getCurrentOnCall();

      if (!currentOnCall) {
        log.warn('No one is currently on-call');
        return { success: false, error: 'No one is currently on-call' };
      }

      log.info('Found current on-call person', {
        userId: currentOnCall.user.id,
        userName: currentOnCall.user.summary,
      });

      const userDetails = await this.pagerDutyService.getUserDetails(currentOnCall.user.id);

      log.info('Updating Slack @oncall group', { email: userDetails.email });

      const result = await this.slackService.updateOnCallUserGroup(userDetails.email);

      if (result.success) {
        log.info('Successfully updated @oncall group', { email: userDetails.email });
      } else {
        log.error('Failed to update @oncall group', { error: result.error });
      }

      return { ...result, email: userDetails.email };
    } catch (error) {
      log.error('Failed to update on-call group', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  async healthCheck(): Promise<{
    pagerduty: boolean;
    slack: boolean;
  }> {
    const log = logger.child({ method: 'healthCheck' });

    log.info('Running health check');

    const [pagerdutyHealthy, slackHealthy] = await Promise.all([
      this.pagerDutyService.testConnection(),
      this.slackService.testConnection(),
    ]);

    const result = {
      pagerduty: pagerdutyHealthy,
      slack: slackHealthy,
    };

    log.info('Health check completed', result);

    return result;
  }

  private handleError(error: unknown, context: string): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      return new AppError(`${context}: ${error.message}`, 500);
    }

    return new AppError(context, 500);
  }
}
