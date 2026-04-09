export interface Config {
  pagerduty: {
    apiKey: string;
    scheduleId: string;
  };
  slack: {
    botToken: string;
    channel: string;
  };
  app: {
    port: number;
    nodeEnv: string;
    logLevel: string;
    timezone: string;
  };
  gcp?: {
    projectId: string;
  };
}

export interface OnCallPerson {
  name: string;
  email: string;
  phone?: string;
  slackUserId?: string;
  slackHandle?: string;
  scheduleStart: Date;
  scheduleEnd: Date;
  scheduleUrl: string;
}

export interface PagerDutyUser {
  id: string;
  name: string;
  email: string;
  contact_methods?: Array<{
    type: string;
    address: string;
  }>;
}

export interface PagerDutyScheduleEntry {
  start: string;
  end: string;
  user: {
    id: string;
    summary: string;
    self: string;
  };
}

export interface SlackUser {
  id: string;
  name: string;
  profile: {
    email?: string;
    phone?: string;
    display_name?: string;
  };
}

export interface NotificationResult {
  success: boolean;
  messageTimestamp?: string;
  error?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    pagerduty: boolean;
    slack: boolean;
  };
}

export interface LogContext {
  correlationId: string;
  service?: string;
  method?: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class PagerDutyError extends AppError {
  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message, statusCode, 'PAGERDUTY_ERROR', details);
  }
}

export class SlackError extends AppError {
  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message, statusCode, 'SLACK_ERROR', details);
  }
}

export class ConfigError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'CONFIG_ERROR', details);
  }
}
