import { WebClient } from '@slack/web-api';
import { SlackService } from '../../src/services/slack.service';
import { mockConfig, mockSlackUser } from '../fixtures/mock-data';

jest.mock('@slack/web-api');

describe('SlackService', () => {
  let service: SlackService;
  let mockPostMessage: jest.Mock;
  let mockLookupByEmail: jest.Mock;
  let mockAuthTest: jest.Mock;
  let mockUsergroupsList: jest.Mock;
  let mockUsergroupsUsersUpdate: jest.Mock;

  beforeEach(() => {
    mockPostMessage = jest.fn();
    mockLookupByEmail = jest.fn();
    mockAuthTest = jest.fn();
    mockUsergroupsList = jest.fn();
    mockUsergroupsUsersUpdate = jest.fn();

    (WebClient as jest.MockedClass<typeof WebClient>).mockImplementation(
      () =>
        ({
          chat: {
            postMessage: mockPostMessage,
          },
          users: {
            lookupByEmail: mockLookupByEmail,
          },
          auth: {
            test: mockAuthTest,
          },
          usergroups: {
            list: mockUsergroupsList,
            users: {
              update: mockUsergroupsUsersUpdate,
            },
          },
        }) as unknown,
    );

    service = new SlackService(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('postOnCallNotification', () => {
    it('should post notification successfully with Slack handle', async () => {
      mockLookupByEmail.mockResolvedValue({
        ok: true,
        user: mockSlackUser,
      });

      mockPostMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
        channel: '#test-channel',
      });

      const result = await service.postOnCallNotification(
        'John Doe',
        'john.doe@example.com',
        new Date('2025-12-24'),
        new Date('2025-12-31'),
      );

      expect(result.success).toBe(true);
      expect(result.messageTimestamp).toBe('1234567890.123456');
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: '#test-channel',
          mrkdwn: true,
        }),
      );
      // Should NOT update usergroup anymore
      expect(mockUsergroupsUsersUpdate).not.toHaveBeenCalled();
    });

    it('should post notification without Slack handle if user not found', async () => {
      mockLookupByEmail.mockResolvedValue({
        ok: false,
        user: undefined,
      });

      mockPostMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
        channel: '#test-channel',
      });

      const result = await service.postOnCallNotification(
        'John Doe',
        'john.doe@example.com',
        new Date('2025-12-24'),
        new Date('2025-12-31'),
      );

      expect(result.success).toBe(true);
    });

    it('should handle post message errors', async () => {
      mockLookupByEmail.mockResolvedValue({
        ok: true,
        user: mockSlackUser,
      });

      mockPostMessage.mockRejectedValue(new Error('API Error'));

      await expect(
        service.postOnCallNotification(
          'John Doe',
          'john.doe@example.com',
          new Date('2025-12-24'),
          new Date('2025-12-31'),
        ),
      ).rejects.toThrow();
    });
  });

  describe('updateOnCallUserGroup', () => {
    it('should update @oncall usergroup successfully', async () => {
      mockLookupByEmail.mockResolvedValue({
        ok: true,
        user: mockSlackUser,
      });

      mockUsergroupsList.mockResolvedValue({
        ok: true,
        usergroups: [
          {
            id: 'S12345',
            handle: 'oncall',
            name: 'On-Call',
          },
        ],
      });

      mockUsergroupsUsersUpdate.mockResolvedValue({
        ok: true,
      });

      const result = await service.updateOnCallUserGroup('john.doe@example.com');

      expect(result.success).toBe(true);
      expect(mockUsergroupsUsersUpdate).toHaveBeenCalledWith({
        usergroup: 'S12345',
        users: 'U123456',
      });
    });

    it('should return error when user not found in Slack', async () => {
      mockLookupByEmail.mockResolvedValue({
        ok: false,
        user: undefined,
      });

      const result = await service.updateOnCallUserGroup('unknown@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('User not found in Slack');
    });

    it('should return error when @oncall usergroup not found', async () => {
      mockLookupByEmail.mockResolvedValue({
        ok: true,
        user: mockSlackUser,
      });

      mockUsergroupsList.mockResolvedValue({
        ok: true,
        usergroups: [],
      });

      const result = await service.updateOnCallUserGroup('john.doe@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('@oncall usergroup not found');
    });
  });

  describe('getSlackUserIdByEmail', () => {
    it('should return Slack user ID when user found', async () => {
      mockLookupByEmail.mockResolvedValue({
        ok: true,
        user: mockSlackUser,
      });

      const result = await service.getSlackUserIdByEmail('john.doe@example.com');

      expect(result).toBe('U123456');
    });

    it('should return undefined when user not found', async () => {
      mockLookupByEmail.mockResolvedValue({
        ok: false,
        user: undefined,
      });

      const result = await service.getSlackUserIdByEmail('unknown@example.com');

      expect(result).toBeUndefined();
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      mockAuthTest.mockResolvedValue({
        ok: true,
        team: 'Test Team',
      });

      const result = await service.testConnection();

      expect(result).toBe(true);
    });

    it('should return false on failed connection', async () => {
      mockAuthTest.mockRejectedValue(new Error('Auth failed'));

      const result = await service.testConnection();

      expect(result).toBe(false);
    });
  });
});
