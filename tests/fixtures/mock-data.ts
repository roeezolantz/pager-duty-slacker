import { PagerDutyUser, PagerDutyScheduleEntry, SlackUser } from '../../src/types';

export const mockPagerDutyUser: PagerDutyUser = {
  id: 'PUSER123',
  name: 'John Doe',
  email: 'john.doe@example.com',
  contact_methods: [
    {
      type: 'phone_contact_method',
      address: '+1-555-0100',
    },
    {
      type: 'email_contact_method',
      address: 'john.doe@example.com',
    },
  ],
};

export const mockPagerDutyScheduleEntry: PagerDutyScheduleEntry = {
  start: '2025-12-24T00:00:00Z',
  end: '2025-12-31T23:59:59Z',
  user: {
    id: 'PUSER123',
    summary: 'John Doe',
    self: 'https://api.pagerduty.com/users/PUSER123',
  },
};

export const mockSlackUser: SlackUser = {
  id: 'U123456',
  name: 'johndoe',
  profile: {
    email: 'john.doe@example.com',
    phone: '+1-555-0100',
    display_name: 'John Doe',
  },
};

export const mockConfig = {
  pagerduty: {
    apiKey: 'u+test-api-key',
    scheduleId: 'TEST123',
  },
  slack: {
    botToken: 'xoxb-test-token',
    channel: '#test-channel',
  },
  app: {
    port: 8080,
    nodeEnv: 'test',
    logLevel: 'error',
    timezone: 'Asia/Jerusalem',
  },
};
