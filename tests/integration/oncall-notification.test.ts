import request from 'supertest';
import nock from 'nock';
import { app, initialize } from '../../src/index';
import { mockPagerDutyUser, mockPagerDutyScheduleEntry } from '../fixtures/mock-data';

describe('On-Call Notification Integration', () => {
  beforeAll(async () => {
    await initialize();
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /ready', () => {
    it('should return readiness status', async () => {
      nock('https://api.pagerduty.com').get('/abilities').reply(200, { abilities: [] });

      nock('https://slack.com').post('/api/auth.test').reply(200, { ok: true, team: 'Test' });

      const response = await request(app).get('/ready');

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
    });
  });

  describe('POST /notify', () => {
    it('should send on-call notification successfully', async () => {
      const scheduleId = process.env.PAGERDUTY_SCHEDULE_ID;

      // Create a future schedule entry (next shift must start after now)
      const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // tomorrow
      const futureEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // next week
      const futureEntry = {
        ...mockPagerDutyScheduleEntry,
        start: futureStart,
        end: futureEnd,
      };

      nock('https://api.pagerduty.com')
        .get(`/schedules/${scheduleId}/users`)
        .query(true)
        .reply(200, { users: [] });

      nock('https://api.pagerduty.com')
        .get(`/schedules/${scheduleId}`)
        .query(true)
        .reply(200, {
          schedule: {
            final_schedule: {
              rendered_schedule_entries: [futureEntry],
            },
          },
        });

      nock('https://api.pagerduty.com')
        .get(`/users/${mockPagerDutyUser.id}`)
        .query(true)
        .reply(200, {
          user: mockPagerDutyUser,
        });

      nock('https://slack.com')
        .post('/api/users.lookupByEmail')
        .reply(200, {
          ok: true,
          user: {
            id: 'U123456',
            name: 'johndoe',
          },
        });

      nock('https://slack.com')
        .post('/api/usergroups.list')
        .reply(200, {
          ok: true,
          usergroups: [{ id: 'UG123', handle: 'oncall' }],
        });

      nock('https://slack.com')
        .post('/api/usergroups.users.update')
        .reply(200, { ok: true });

      nock('https://slack.com')
        .post('/api/chat.postMessage')
        .reply(200, {
          ok: true,
          ts: '1234567890.123456',
          channel: '#test-channel',
        });

      const response = await request(app).post('/notify');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('messageTimestamp');
    });

    it(
      'should handle errors gracefully',
      async () => {
        const scheduleId = process.env.PAGERDUTY_SCHEDULE_ID;

        nock('https://api.pagerduty.com')
          .get(`/schedules/${scheduleId}/users`)
          .query(true)
          .times(4)
          .reply(500, { error: { message: 'Internal Server Error' } });

        const response = await request(app).post('/notify');

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error');
      },
      15000,
    );
  });

  describe('404 handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    });
  });
});
