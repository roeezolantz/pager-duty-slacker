# Architecture Documentation

This document describes the architecture, design decisions, and patterns used in PD-Slacker.

## Overview

PD-Slacker is a cloud-native microservice that automates weekly on-call notifications from PagerDuty to Slack. It's built with production-ready patterns including retry logic, circuit breakers, structured logging, and comprehensive error handling.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Google Cloud Platform                    │
│                                                              │
│  ┌────────────────────┐         ┌────────────────────────┐  │
│  │  Cloud Scheduler   │         │   Secret Manager       │  │
│  │  (Cron: Mon 9 AM)  │         │  - PagerDuty API Key   │  │
│  └─────────┬──────────┘         │  - Slack Bot Token     │  │
│            │ POST /notify       └──────────┬─────────────┘  │
│            │                               │                │
│            ▼                               │ Read secrets   │
│  ┌─────────────────────────────────────────▼──────────────┐ │
│  │              Cloud Run Service                         │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │            Express HTTP Server                   │  │ │
│  │  │  - GET /health  - GET /ready  - POST /notify    │  │ │
│  │  └──────────────────┬───────────────────────────────┘  │ │
│  │                     │                                   │ │
│  │  ┌──────────────────▼───────────────────────────────┐  │ │
│  │  │           OnCall Service                         │  │ │
│  │  │  - Orchestrates workflow                         │  │ │
│  │  │  - Gets current week range                       │  │ │
│  │  │  - Coordinates PD & Slack services               │  │ │
│  │  └────┬─────────────────────────┬──────────────────┘  │ │
│  │       │                         │                      │ │
│  │  ┌────▼──────────────┐    ┌─────▼──────────────────┐  │ │
│  │  │ PagerDuty Service │    │   Slack Service        │  │ │
│  │  │ - API client      │    │   - API client         │  │ │
│  │  │ - Circuit breaker │    │   - Circuit breaker    │  │ │
│  │  │ - Retry logic     │    │   - Retry logic        │  │ │
│  │  └────┬──────────────┘    └─────┬──────────────────┘  │ │
│  │       │                         │                      │ │
│  └───────┼─────────────────────────┼──────────────────────┘ │
│          │                         │                        │
└──────────┼─────────────────────────┼────────────────────────┘
           │                         │
           ▼                         ▼
  ┌────────────────┐        ┌────────────────┐
  │  PagerDuty API │        │   Slack API    │
  └────────────────┘        └────────────────┘
```

## Components

### 1. HTTP Server (index.ts)

**Purpose**: Entry point and HTTP endpoint handler

**Responsibilities**:
- Start Express server
- Define health check endpoints
- Handle notification trigger endpoint
- Global error handling
- Application initialization

**Endpoints**:
- `GET /health` - Basic liveness probe
- `GET /ready` - Readiness probe (tests external dependencies)
- `POST /notify` - Trigger on-call notification

### 2. OnCall Service

**Purpose**: Core business logic orchestration

**Responsibilities**:
- Calculate current week range (Monday to Sunday)
- Fetch on-call person from PagerDuty
- Extract contact information
- Send formatted notification to Slack
- Health checks for dependencies

**Key Methods**:
- `sendWeeklyOnCallNotification()` - Main workflow
- `getCurrentOnCallPerson()` - Fetch on-call details
- `getCurrentWeekRange()` - Calculate week boundaries
- `healthCheck()` - Verify external services

### 3. PagerDuty Service

**Purpose**: PagerDuty API integration

**Responsibilities**:
- Fetch schedule entries for date range
- Get user details with contact methods
- Handle API errors and retries
- Circuit breaker for fault tolerance

**Features**:
- Axios client with retry configuration
- Circuit breaker pattern (Opossum)
- Exponential backoff retry logic
- Structured error handling

**Key Methods**:
- `getOnCallForWeek()` - Fetch schedule entries
- `getUserDetails()` - Get user contact info
- `testConnection()` - Health check

### 4. Slack Service

**Purpose**: Slack API integration

**Responsibilities**:
- Post formatted messages to Slack channel
- Look up users by email for @mentions
- Format on-call information
- Handle API errors and retries

**Features**:
- Official Slack Web API client
- Circuit breaker pattern
- Retry logic for rate limits
- Graceful degradation (works without @mentions)

**Key Methods**:
- `postOnCallNotification()` - Send notification
- `getSlackHandleByEmail()` - Find Slack user
- `testConnection()` - Health check

### 5. Configuration (config.ts)

**Purpose**: Centralized configuration management

**Responsibilities**:
- Load configuration from environment variables
- Fetch secrets from GCP Secret Manager (production)
- Validate configuration
- Cache configuration

**Features**:
- Environment-based configuration
- GCP Secret Manager integration
- Configuration validation
- Type-safe config object

## Cross-Cutting Concerns

### Logging

**Implementation**: Winston structured logger

**Features**:
- JSON formatted logs
- Correlation IDs for request tracing
- Contextual logging (service, method, etc.)
- Log levels: error, warn, info, debug

**Usage**:
```typescript
const logger = createLogger({ service: 'my-service' });
logger.info('Message', { key: 'value' });
```

### Error Handling

**Custom Error Classes**:
- `AppError` - Base error class
- `PagerDutyError` - PagerDuty-specific errors
- `SlackError` - Slack-specific errors
- `ConfigError` - Configuration errors

**Features**:
- Error codes for categorization
- HTTP status codes
- Error details for debugging
- Stack trace preservation

### Retry Logic

**Implementation**: Custom retry with exponential backoff

**Configuration**:
- Max retries: 3
- Base delay: 1000ms
- Max delay: 10000ms
- Backoff multiplier: 2x

**Features**:
- Configurable retry options
- Retryable error detection
- Network error handling
- Rate limit detection

### Circuit Breaker

**Implementation**: Opossum library

**Configuration**:
- Timeout: 10 seconds
- Error threshold: 50%
- Reset timeout: 30 seconds
- Rolling window: 10 seconds

**Features**:
- Prevents cascade failures
- Automatic recovery detection
- Fallback mechanisms
- State monitoring (open/closed/half-open)

## Data Flow

### Weekly Notification Flow

1. **Trigger**: Cloud Scheduler sends POST to `/notify`
2. **Handler**: Express endpoint calls `onCallService.sendWeeklyOnCallNotification()`
3. **Week Calculation**: Service calculates current week range (Monday-Sunday)
4. **Fetch Schedule**: PagerDuty service gets on-call entries
5. **Get User Details**: PagerDuty service fetches user contact info
6. **Lookup Slack User**: Slack service finds user by email for @mention
7. **Format Message**: Service formats notification message
8. **Send Notification**: Slack service posts message to channel
9. **Response**: HTTP 200 with result details

### Error Handling Flow

1. **Error Occurs**: Exception thrown in any service
2. **Retry Logic**: Automatic retry with exponential backoff
3. **Circuit Breaker**: Opens if error threshold reached
4. **Error Logging**: Structured log with correlation ID
5. **Error Response**: HTTP error with details
6. **Alerting**: (Optional) Alert sent to monitoring system

## Design Patterns

### 1. Service Layer Pattern

Each external dependency has a dedicated service:
- Encapsulation of API logic
- Clear separation of concerns
- Easy to mock for testing
- Reusable across application

### 2. Circuit Breaker Pattern

Prevents cascade failures:
- Fails fast when service is down
- Automatic recovery detection
- Prevents resource exhaustion

### 3. Retry Pattern

Handles transient failures:
- Exponential backoff
- Configurable retry attempts
- Selective retries (network errors, rate limits)

### 4. Dependency Injection

Services receive dependencies via constructor:
- Testability (easy to mock)
- Flexibility (swap implementations)
- Clear dependencies

### 5. Error Wrapping

Custom error classes wrap external errors:
- Consistent error handling
- Additional context
- Type safety

## Security

### Secrets Management

- **Production**: GCP Secret Manager
- **Development**: Environment variables
- **Never**: Committed to version control

### Authentication

- **Cloud Scheduler → Cloud Run**: OIDC token
- **PagerDuty API**: Bearer token authentication
- **Slack API**: Bot OAuth token

### Least Privilege

- Service accounts have minimal required permissions
- Secret access granted only to Cloud Run service
- Scheduler can only invoke Cloud Run

### Input Validation

- Configuration validated on startup
- API responses validated before use
- Type safety enforced by TypeScript

## Scalability

### Horizontal Scaling

- **Cloud Run**: Auto-scales based on traffic
- **Stateless**: No shared state between instances
- **Min instances**: 0 (scale to zero)
- **Max instances**: 1 (single weekly trigger)

### Performance

- **Cold Start**: ~2-3 seconds
- **Execution Time**: ~5-10 seconds
- **Memory**: 512MB allocated
- **CPU**: 1 vCPU allocated

### Rate Limiting

- **PagerDuty**: Handled by circuit breaker
- **Slack**: Retry logic for rate limits
- **No artificial throttling**: Single weekly execution

## Monitoring & Observability

### Logging

- **Format**: JSON structured logs
- **Destination**: Cloud Logging
- **Retention**: 30 days (configurable)
- **Correlation**: Request correlation IDs

### Metrics

- **Health Checks**: Liveness and readiness probes
- **Execution**: Cloud Run metrics (requests, latency, errors)
- **Custom**: Log-based metrics (optional)

### Alerting

Recommended alerts:
- Notification failures
- Service health check failures
- High error rates
- Scheduler job failures

## Testing Strategy

### Unit Tests

- **Coverage**: 80%+ target
- **Scope**: Individual services and functions
- **Mocking**: External dependencies mocked
- **Tools**: Jest, nock

### Integration Tests

- **Scope**: Full request/response cycle
- **Mocking**: External APIs mocked
- **Tools**: Supertest, Jest

### E2E Tests

- **Scope**: Full deployment (manual)
- **Environment**: Staging environment
- **Frequency**: Before production releases

## Infrastructure as Code

### Terraform Resources

- **Artifact Registry**: Docker image storage
- **Secret Manager**: Secrets storage
- **Cloud Run**: Service deployment
- **Cloud Scheduler**: Cron job
- **IAM**: Service accounts and permissions

### State Management

- **Backend**: GCS bucket (recommended)
- **Locking**: Enabled
- **Versioning**: Enabled

## Deployment Strategy

### CI/CD Pipeline

1. **CI** (on PR):
   - Lint & format check
   - Type check
   - Unit tests
   - Integration tests
   - Security scan
   - Docker build

2. **CD** (on merge to main):
   - Build Docker image
   - Push to Artifact Registry
   - Deploy to Cloud Run
   - Verify deployment

### Rollback Strategy

1. **Automatic**: Cloud Run revision history
2. **Manual**: Deploy previous Docker image
3. **Emergency**: Terraform state rollback

## Cost Optimization

- **Scale to Zero**: No cost when not running
- **Minimal Resources**: 512MB RAM, 1 vCPU
- **Regional**: Single region deployment
- **Logging**: Default retention (30 days)

**Estimated Monthly Cost**: <$5 (minimal Cloud Run execution + storage)

## Future Enhancements

Potential improvements:
- Multiple schedule support
- Multiple channel support
- Custom message templates
- Notification history
- Dashboard/UI
- Prometheus metrics
- Advanced alerting rules
- Multi-cloud support
