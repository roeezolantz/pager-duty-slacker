import { WebClient, ChatPostMessageResponse, UsersLookupByEmailResponse } from '@slack/web-api';
import CircuitBreaker from 'opossum';
import { Config, SlackUser, SlackError, NotificationResult } from '../types';
import { createLogger } from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuit-breaker';
import { retryWithBackoff } from '../utils/retry';
import { generateCorrelationId } from '../utils/correlation-id';

const logger = createLogger({ service: 'slack-service' });

export class SlackService {
  private client: WebClient;
  private config: Config;
  private postMessageBreaker: CircuitBreaker;
  private lookupUserBreaker: CircuitBreaker;

  constructor(config: Config) {
    this.config = config;

    this.client = new WebClient(config.slack.botToken, {
      retryConfig: {
        retries: 3,
        factor: 2,
      },
    });

    this.postMessageBreaker = createCircuitBreaker(this.postMessageInternal.bind(this), {
      name: 'slack-post-message',
    });

    this.lookupUserBreaker = createCircuitBreaker(this.lookupUserByEmailInternal.bind(this), {
      name: 'slack-lookup-user',
    });

    logger.info('Slack service initialized');
  }

  async postOnCallNotification(
    name: string,
    email: string,
    scheduleStart: Date,
    scheduleEnd: Date,
  ): Promise<NotificationResult> {
    const correlationId = generateCorrelationId('slack');
    const log = logger.child({ correlationId, method: 'postOnCallNotification' });

    log.info('Posting on-call notification', { name, email });

    try {
      const slackUserId = await this.getSlackUserIdByEmail(email);
      const slackHandle = slackUserId ? `<@${slackUserId}>` : undefined;

      const message = this.formatOnCallMessage(
        name,
        slackHandle,
        scheduleStart,
        scheduleEnd,
      );

      const result = (await this.postMessageBreaker.fire(
        message,
        correlationId,
      )) as NotificationResult;

      log.info('Successfully posted on-call notification', {
        channel: this.config.slack.channel,
        messageTs: result.messageTimestamp,
      });

      return result;
    } catch (error) {
      log.error('Failed to post on-call notification', error);
      throw this.handleError(error, 'Failed to post on-call notification');
    }
  }

  private async postMessageInternal(
    message: string,
    correlationId: string,
  ): Promise<NotificationResult> {
    const log = logger.child({ correlationId });

    return retryWithBackoff(
      async () => {
        const response: ChatPostMessageResponse = await this.client.chat.postMessage({
          channel: this.config.slack.channel,
          text: message,
          mrkdwn: true,
          unfurl_links: false,
          unfurl_media: false,
        });

        if (!response.ok) {
          throw new SlackError(`Failed to post message: ${response.error}`, 500, response);
        }

        return {
          success: true,
          messageTimestamp: response.ts,
        };
      },
      {
        maxRetries: 3,
        retryableErrors: ['ratelimited', 'timeout', 'network'],
      },
      log,
    );
  }

  async getSlackUserIdByEmail(email: string): Promise<string | undefined> {
    const correlationId = generateCorrelationId('slack');
    const log = logger.child({ correlationId, method: 'getSlackUserIdByEmail' });

    log.debug('Looking up Slack user by email', { email });

    try {
      const user = (await this.lookupUserBreaker.fire(email, correlationId)) as
        | SlackUser
        | undefined;

      if (user?.id) {
        log.debug('Found Slack user', { email, userId: user.id });
        return user.id;
      }

      log.warn('Slack user not found', { email });
      return undefined;
    } catch (error) {
      log.warn('Failed to lookup Slack user, continuing without handle', { email, error });
      return undefined;
    }
  }

  async updateOnCallUserGroup(email: string): Promise<{ success: boolean; error?: string }> {
    const correlationId = generateCorrelationId('slack');
    const log = logger.child({ correlationId, method: 'updateOnCallUserGroup' });

    try {
      log.info('Updating @oncall usergroup', { email });

      // Find the Slack user by email
      const slackUserId = await this.getSlackUserIdByEmail(email);
      if (!slackUserId) {
        log.warn('Cannot update @oncall usergroup - user not found in Slack', { email });
        return { success: false, error: `User not found in Slack: ${email}` };
      }

      // Find the @oncall usergroup
      const usergroupsResponse = await this.client.usergroups.list({
        include_users: false,
      });

      if (!usergroupsResponse.ok || !usergroupsResponse.usergroups) {
        log.warn('Failed to list usergroups', { error: usergroupsResponse.error });
        return { success: false, error: 'Failed to list usergroups' };
      }

      const oncallGroup = usergroupsResponse.usergroups.find(
        (group) => group.handle === 'oncall',
      );

      if (!oncallGroup?.id) {
        log.warn('Could not find @oncall usergroup - please create it first');
        return { success: false, error: '@oncall usergroup not found - please create it first' };
      }

      // Update usergroup with only this user
      const updateResponse = await this.client.usergroups.users.update({
        usergroup: oncallGroup.id,
        users: slackUserId,
      });

      if (!updateResponse.ok) {
        log.error('Failed to update @oncall usergroup', { error: updateResponse.error });
        return { success: false, error: `Failed to update usergroup: ${updateResponse.error}` };
      }

      log.info('Successfully updated @oncall usergroup', {
        usergroupId: oncallGroup.id,
        userId: slackUserId,
        email,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('missing_scope')) {
        log.error(
          'Missing Slack OAuth scope for usergroups. Add "usergroups:read" and "usergroups:write" scopes to your Slack app.',
          { error: errorMessage },
        );
        return {
          success: false,
          error: 'Missing Slack OAuth scope. Add "usergroups:read" and "usergroups:write" scopes.',
        };
      }
      log.error('Error updating @oncall usergroup', error);
      return { success: false, error: errorMessage };
    }
  }

  private async lookupUserByEmailInternal(
    email: string,
    correlationId: string,
  ): Promise<SlackUser | undefined> {
    const log = logger.child({ correlationId });

    try {
      return await retryWithBackoff(
        async () => {
          const response: UsersLookupByEmailResponse = await this.client.users.lookupByEmail({
            email,
          });

          if (!response.ok || !response.user) {
            log.warn('User not found in Slack', {
              email,
              error: response.error,
              responseOk: response.ok
            });
            return undefined;
          }

          return response.user as SlackUser;
        },
        { maxRetries: 2 },
        log,
      );
    } catch (error) {
      log.warn('Error looking up user by email', {
        email,
        error: error instanceof Error ? error.message : String(error)
      });
      return undefined;
    }
  }

  private formatOnCallMessage(
    name: string,
    slackHandle: string | undefined,
    scheduleStart: Date,
    scheduleEnd: Date,
  ): string {
    const formatDate = (date: Date): string => {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: this.config.app.timezone,
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      const formatted = formatter.format(date);

      // Add ordinal suffix to day (1st, 2nd, 3rd, 4th, etc.)
      const day = date.toLocaleDateString('en-US', {
        timeZone: this.config.app.timezone,
        day: 'numeric',
      });
      const dayNum = parseInt(day, 10);
      const suffix = this.getOrdinalSuffix(dayNum);

      return formatted.replace(day, `${day}${suffix}`);
    };

    const slackMention = slackHandle || name;

    return `Next on call : ${slackMention}, don't forget :nerd_face:
Shift: ${formatDate(scheduleStart)} - ${formatDate(scheduleEnd)}`;
  }

  private getOrdinalSuffix(day: number): string {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  async testConnection(): Promise<boolean> {
    const log = logger.child({ method: 'testConnection' });

    try {
      const response = await this.client.auth.test();
      log.info('Slack connection test successful', { team: response.team });
      return response.ok;
    } catch (error) {
      log.error('Slack connection test failed', error);
      return false;
    }
  }

  private handleError(error: unknown, context: string): SlackError {
    if (error instanceof SlackError) {
      return error;
    }

    if (error instanceof Error) {
      return new SlackError(`${context}: ${error.message}`, 500);
    }

    return new SlackError(context, 500);
  }
}
