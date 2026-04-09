import nock from 'nock';
import { PagerDutyService } from '../../src/services/pagerduty.service';
import { PagerDutyError } from '../../src/types';
import { mockConfig, mockPagerDutyUser, mockPagerDutyScheduleEntry } from '../fixtures/mock-data';

describe('PagerDutyService', () => {
  let service: PagerDutyService;

  beforeEach(() => {
    service = new PagerDutyService(mockConfig);
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('getNextOnCallShift', () => {
    it('should fetch next on-call shift successfully', async () => {
      // Create a future schedule entry
      const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // tomorrow
      const futureEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // next week
      const futureEntry = {
        ...mockPagerDutyScheduleEntry,
        start: futureStart,
        end: futureEnd,
      };

      nock('https://api.pagerduty.com')
        .get(`/schedules/${mockConfig.pagerduty.scheduleId}/users`)
        .query(true)
        .reply(200, {
          users: [],
        });

      nock('https://api.pagerduty.com')
        .get(`/schedules/${mockConfig.pagerduty.scheduleId}`)
        .query(true)
        .reply(200, {
          schedule: {
            final_schedule: {
              rendered_schedule_entries: [futureEntry],
            },
          },
        });

      const result = await service.getNextOnCallShift();

      expect(result).toEqual(futureEntry);
    });

    it('should throw error when no entries found', async () => {
      nock('https://api.pagerduty.com')
        .get(`/schedules/${mockConfig.pagerduty.scheduleId}/users`)
        .query(true)
        .times(4)
        .reply(200, { users: [] });

      nock('https://api.pagerduty.com')
        .get(`/schedules/${mockConfig.pagerduty.scheduleId}`)
        .query(true)
        .times(4)
        .reply(200, {
          schedule: {
            final_schedule: {
              rendered_schedule_entries: [],
            },
          },
        });

      await expect(service.getNextOnCallShift()).rejects.toThrow(PagerDutyError);
    }, 15000);

    it('should handle API errors gracefully', async () => {
      nock('https://api.pagerduty.com')
        .get(`/schedules/${mockConfig.pagerduty.scheduleId}/users`)
        .query(true)
        .times(4)
        .reply(500, { error: { message: 'Internal Server Error' } });

      await expect(service.getNextOnCallShift()).rejects.toThrow(PagerDutyError);
    }, 15000);
  });

  describe('getUserDetails', () => {
    it('should fetch user details successfully', async () => {
      nock('https://api.pagerduty.com')
        .get(`/users/${mockPagerDutyUser.id}`)
        .query(true)
        .reply(200, {
          user: mockPagerDutyUser,
        });

      const result = await service.getUserDetails(mockPagerDutyUser.id);

      expect(result).toEqual(mockPagerDutyUser);
      expect(result.name).toBe('John Doe');
      expect(result.email).toBe('john.doe@example.com');
    });

    it('should throw error when user not found', async () => {
      nock('https://api.pagerduty.com')
        .get('/users/INVALID')
        .query(true)
        .times(4)
        .reply(404, {
          error: { message: 'User not found' },
        });

      await expect(service.getUserDetails('INVALID')).rejects.toThrow(PagerDutyError);
    }, 15000);
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      nock('https://api.pagerduty.com').get('/abilities').reply(200, { abilities: [] });

      const result = await service.testConnection();

      expect(result).toBe(true);
    });

    it('should return false on failed connection', async () => {
      nock('https://api.pagerduty.com').get('/abilities').reply(401, { error: 'Unauthorized' });

      const result = await service.testConnection();

      expect(result).toBe(false);
    });
  });
});
