# Development Guide

This guide covers local development, testing, and contributing to PD-Slacker.

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+
- Docker (optional, for containerized development)
- Git

### Initial Setup

```bash
# Clone repository
git clone https://github.com/roeezolantz/pd-slacker.git
cd pd-slacker

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your development credentials

# Install git hooks
npm run prepare
```

## Development Workflow

### Running Locally

```bash
# Development mode with hot reload
npm run dev

# Build TypeScript
npm run build

# Run built version
npm start
```

The server will start on `http://localhost:8080`.

### Available Scripts

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Compile TypeScript
npm start            # Run production build
npm test             # Run tests once
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors
npm run format       # Format code with Prettier
npm run format:check # Check formatting
npm run typecheck    # Run TypeScript compiler checks
```

### Docker Development

```bash
# Build image
docker build -t pd-slacker-dev .

# Run container
docker run -p 8080:8080 --env-file .env pd-slacker-dev

# Or use docker-compose
docker-compose up

# Run tests in container
docker-compose run --rm pd-slacker npm test
```

## Project Structure

```
pd-slacker/
├── src/
│   ├── config/          # Configuration management
│   ├── middleware/      # Express middleware
│   ├── services/        # Business logic services
│   │   ├── pagerduty.service.ts
│   │   ├── slack.service.ts
│   │   └── oncall.service.ts
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   │   ├── logger.ts
│   │   ├── retry.ts
│   │   └── circuit-breaker.ts
│   └── index.ts         # Application entry point
├── tests/
│   ├── fixtures/        # Test data
│   ├── unit/            # Unit tests
│   └── integration/     # Integration tests
├── infrastructure/
│   ├── terraform/       # Infrastructure as Code
│   └── scripts/         # Deployment scripts
├── docs/                # Documentation
└── .github/             # GitHub Actions workflows
```

## Testing

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# Specific test file
npm test -- tests/unit/oncall.service.test.ts
```

### Writing Tests

#### Unit Tests

```typescript
import { OnCallService } from '../../src/services/oncall.service';
import { mockConfig } from '../fixtures/mock-data';

describe('OnCallService', () => {
  let service: OnCallService;

  beforeEach(() => {
    service = new OnCallService(mockConfig);
  });

  it('should send weekly notification', async () => {
    // Arrange
    const mockData = { ... };

    // Act
    const result = await service.sendWeeklyOnCallNotification();

    // Assert
    expect(result.success).toBe(true);
  });
});
```

#### Integration Tests

```typescript
import request from 'supertest';
import { app } from '../../src/index';

describe('POST /notify', () => {
  it('should send notification', async () => {
    const response = await request(app)
      .post('/notify')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
  });
});
```

### Test Coverage

We aim for 80%+ code coverage:

```bash
npm run test:coverage

# View HTML report
open coverage/lcov-report/index.html
```

## Code Quality

### ESLint

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

Configuration: `.eslintrc.js`

### Prettier

```bash
# Format all files
npm run format

# Check formatting
npm run format:check
```

Configuration: `.prettierrc`

### TypeScript

We use strict mode for maximum type safety:

```bash
# Type check
npm run typecheck
```

Configuration: `tsconfig.json`

### Pre-commit Hooks

Husky runs linting and formatting before commits:

```bash
# Manually run pre-commit
npx lint-staged
```

## Adding New Features

### 1. Create a Branch

```bash
git checkout -b feature/amazing-feature
```

### 2. Implement Feature

Follow existing patterns:

- Services in `src/services/`
- Types in `src/types/`
- Tests in `tests/unit/` or `tests/integration/`

### 3. Add Tests

```typescript
// tests/unit/my-feature.test.ts
describe('MyFeature', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
```

### 4. Update Documentation

Update relevant docs:
- `README.md` for user-facing changes
- `ARCHITECTURE.md` for architectural changes
- Inline JSDoc comments for code

### 5. Commit Changes

```bash
git add .
git commit -m "feat: add amazing feature"
```

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `test:` - Tests
- `refactor:` - Code refactoring
- `chore:` - Maintenance

### 6. Push and Create PR

```bash
git push origin feature/amazing-feature
```

Then create a Pull Request on GitHub.

## Debugging

### VS Code

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug App",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "program": "${workspaceFolder}/node_modules/jest/bin/jest",
      "args": ["--runInBand"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Logging

Use the logger for debugging:

```typescript
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'my-service' });

logger.debug('Debug message', { data: 'value' });
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', error);
```

Set `LOG_LEVEL=debug` in `.env` for verbose logging.

### Manual Testing

Test endpoints manually:

```bash
# Health check
curl http://localhost:8080/health

# Readiness check
curl http://localhost:8080/ready

# Trigger notification
curl -X POST http://localhost:8080/notify
```

## Common Tasks

### Add a New Service

1. Create service file:
```typescript
// src/services/my.service.ts
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'my-service' });

export class MyService {
  async doSomething(): Promise<void> {
    logger.info('Doing something');
  }
}
```

2. Add tests:
```typescript
// tests/unit/my.service.test.ts
import { MyService } from '../../src/services/my.service';

describe('MyService', () => {
  it('should do something', async () => {
    const service = new MyService();
    await expect(service.doSomething()).resolves.not.toThrow();
  });
});
```

### Add New Configuration

1. Update types:
```typescript
// src/types/index.ts
export interface Config {
  // ... existing
  myNewConfig: {
    value: string;
  };
}
```

2. Update config loader:
```typescript
// src/config/config.ts
const config: Config = {
  // ... existing
  myNewConfig: {
    value: getEnvOrThrow('MY_NEW_VALUE'),
  },
};
```

3. Update `.env.example`:
```bash
MY_NEW_VALUE=default-value
```

### Update Dependencies

```bash
# Check for updates
npm outdated

# Update specific package
npm update package-name

# Update all (be careful!)
npm update

# Security audit
npm audit
npm audit fix
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 8080
lsof -i :8080

# Kill process
kill -9 <PID>
```

### TypeScript Errors

```bash
# Clean build
rm -rf dist
npm run build
```

### Test Failures

```bash
# Clear Jest cache
npm test -- --clearCache

# Run single test
npm test -- --testNamePattern="test name"
```

### Node Modules Issues

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

## Best Practices

1. **Type Safety**: Use TypeScript strict mode, avoid `any`
2. **Error Handling**: Always handle errors, use custom error classes
3. **Logging**: Use structured logging with context
4. **Testing**: Write tests for new features and bug fixes
5. **Code Style**: Follow existing patterns, use linter
6. **Documentation**: Update docs when changing behavior
7. **Commits**: Use conventional commits, keep commits atomic
8. **Dependencies**: Keep dependencies up to date, audit regularly

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Google Cloud Run Docs](https://cloud.google.com/run/docs)
- [PagerDuty API](https://developer.pagerduty.com/docs/ZG9jOjExMDI5NTUw-api-reference)
- [Slack API](https://api.slack.com/)

## Getting Help

- Create an issue on GitHub
- Check existing issues and discussions
- Review the documentation
