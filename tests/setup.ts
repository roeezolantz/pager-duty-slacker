process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.PAGERDUTY_API_KEY = 'u+test-api-key';
process.env.PAGERDUTY_SCHEDULE_ID = 'TEST123';
process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
process.env.SLACK_CHANNEL = '#test-channel';
process.env.PORT = '8080';
process.env.TIMEZONE = 'Asia/Jerusalem';

jest.setTimeout(10000);
