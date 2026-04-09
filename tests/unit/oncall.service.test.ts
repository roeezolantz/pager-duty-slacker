import { OnCallService } from '../../src/services/oncall.service';
import { PagerDutyService } from '../../src/services/pagerduty.service';
import { SlackService } from '../../src/services/slack.service';
import { mockConfig, mockPagerDutyUser, mockPagerDutyScheduleEntry } from '../fixtures/mock-data';

jest.mock('../../src/services/pagerduty.service');
jest.mock('../../src/services/slack.service');

describe('OnCallService', () => {
  let service: OnCallService;
  let mockPagerDutyService: jest.Mocked<PagerDutyService>;
  let mockSlackService: jest.Mocked<SlackService>;

  beforeEach(() => {
    mockPagerDutyService = {
      getNextOnCallShift: jest.fn(),
      getCurrentOnCall: jest.fn(),
      getUserDetails: jest.fn(),
      testConnection: jest.fn(),
    } as unknown as jest.Mocked<PagerDutyService>;

    mockSlackService = {
      postOnCallNotification: jest.fn(),
      updateOnCallUserGroup: jest.fn(),
      getSlackHandleByEmail: jest.fn(),
      testConnection: jest.fn(),
    } as unknown as jest.Mocked<SlackService>;

    (PagerDutyService as jest.MockedClass<typeof PagerDutyService>).mockImplementation(
      () => mockPagerDutyService,
    );
    (SlackService as jest.MockedClass<typeof SlackService>).mockImplementation(
      () => mockSlackService,
    );

    service = new OnCallService(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendNextOnCallNotification', () => {
    it('should send notification successfully', async () => {
      mockPagerDutyService.getNextOnCallShift.mockResolvedValue(mockPagerDutyScheduleEntry);
      mockPagerDutyService.getUserDetails.mockResolvedValue(mockPagerDutyUser);
      mockSlackService.postOnCallNotification.mockResolvedValue({
        success: true,
        messageTimestamp: '1234567890.123456',
      });

      const result = await service.sendNextOnCallNotification();

      expect(result.success).toBe(true);
      expect(mockPagerDutyService.getNextOnCallShift).toHaveBeenCalled();
      expect(mockPagerDutyService.getUserDetails).toHaveBeenCalledWith('PUSER123');
      expect(mockSlackService.postOnCallNotification).toHaveBeenCalledWith(
        'John Doe',
        'john.doe@example.com',
        expect.any(Date),
        expect.any(Date),
      );
    });

    it('should handle case when no on-call shift found', async () => {
      mockPagerDutyService.getNextOnCallShift.mockRejectedValue(
        new Error('No upcoming on-call shift found'),
      );

      await expect(service.sendNextOnCallNotification()).rejects.toThrow(
        'No upcoming on-call shift found',
      );
    });

    it('should handle PagerDuty service errors', async () => {
      mockPagerDutyService.getNextOnCallShift.mockRejectedValue(new Error('PagerDuty API error'));

      await expect(service.sendNextOnCallNotification()).rejects.toThrow('PagerDuty API error');
    });

    it('should handle Slack service errors', async () => {
      mockPagerDutyService.getNextOnCallShift.mockResolvedValue(mockPagerDutyScheduleEntry);
      mockPagerDutyService.getUserDetails.mockResolvedValue(mockPagerDutyUser);
      mockSlackService.postOnCallNotification.mockRejectedValue(new Error('Slack API error'));

      await expect(service.sendNextOnCallNotification()).rejects.toThrow('Slack API error');
    });
  });

  describe('updateOnCallGroup', () => {
    it('should update @oncall group successfully', async () => {
      mockPagerDutyService.getCurrentOnCall.mockResolvedValue(mockPagerDutyScheduleEntry);
      mockPagerDutyService.getUserDetails.mockResolvedValue(mockPagerDutyUser);
      mockSlackService.updateOnCallUserGroup.mockResolvedValue({ success: true });

      const result = await service.updateOnCallGroup();

      expect(result.success).toBe(true);
      expect(result.email).toBe('john.doe@example.com');
      expect(mockPagerDutyService.getCurrentOnCall).toHaveBeenCalled();
      expect(mockSlackService.updateOnCallUserGroup).toHaveBeenCalledWith('john.doe@example.com');
    });

    it('should return error when no one is on-call', async () => {
      mockPagerDutyService.getCurrentOnCall.mockResolvedValue(null);

      const result = await service.updateOnCallGroup();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No one is currently on-call');
    });

    it('should return error when Slack update fails', async () => {
      mockPagerDutyService.getCurrentOnCall.mockResolvedValue(mockPagerDutyScheduleEntry);
      mockPagerDutyService.getUserDetails.mockResolvedValue(mockPagerDutyUser);
      mockSlackService.updateOnCallUserGroup.mockResolvedValue({
        success: false,
        error: 'Slack API error',
      });

      const result = await service.updateOnCallGroup();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Slack API error');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when all services are up', async () => {
      mockPagerDutyService.testConnection.mockResolvedValue(true);
      mockSlackService.testConnection.mockResolvedValue(true);

      const result = await service.healthCheck();

      expect(result).toEqual({
        pagerduty: true,
        slack: true,
      });
    });

    it('should return unhealthy status when services are down', async () => {
      mockPagerDutyService.testConnection.mockResolvedValue(false);
      mockSlackService.testConnection.mockResolvedValue(false);

      const result = await service.healthCheck();

      expect(result).toEqual({
        pagerduty: false,
        slack: false,
      });
    });
  });
});
