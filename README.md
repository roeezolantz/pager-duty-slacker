# PD-Slacker

Automated weekly on-call notifications from PagerDuty to Slack, with `@oncall` user group management. Never miss who's on-call again!

## Features

- **`@oncall` Group Management**: Automatically updates the Slack `@oncall` user group to point to the current on-call person — so `@oncall` always pings the right person
- **Automated Weekly Notifications**: Sends Slack messages every Monday at 9 AM (configurable timezone)
- **Rich Information**: Displays name, Slack handle, phone, email, and schedule duration
- **Production-Ready**: Built with retry logic, circuit breakers, and comprehensive error handling
- **Cloud-Native**: Runs on Google Cloud Run with Cloud Scheduler
- **Fully Tested**: 80%+ code coverage with unit and integration tests
- **Type-Safe**: Written in TypeScript with strict mode enabled
- **Observable**: Structured logging with correlation IDs
- **Secure**: Secrets managed via GCP Secret Manager

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Docker (for local development)
- Google Cloud account (for deployment)
- PagerDuty API token (read-only is sufficient)
- Slack bot token with the following OAuth scopes:
  - `chat:write` — post on-call notifications to channels
  - `users:read.email` — look up Slack users by their PagerDuty email
  - `users:read` — resolve user profiles
  - `usergroups:read` — find the `@oncall` user group
  - `usergroups:write` — update `@oncall` group membership
- An `@oncall` user group created in your Slack workspace (the bot updates it, but won't create it)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/roeezolantz/pager-duty-slacker.git
   cd pager-duty-slacker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Run in development mode**
   ```bash
   npm run dev
   ```

5. **Run tests**
   ```bash
   npm test
   npm run test:coverage
   ```

### Docker

```bash
# Build
docker build -t pd-slacker .

# Run
docker run -p 8080:8080 --env-file .env pd-slacker

# Or use docker-compose
docker-compose up
```

## Deployment

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.

Quick deploy to GCP:

```bash
# Set up secrets
./infrastructure/scripts/setup-secrets.sh

# Deploy everything
./infrastructure/scripts/deploy.sh
```

## Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PAGERDUTY_API_KEY` | PagerDuty API token | - | Yes |
| `PAGERDUTY_SCHEDULE_ID` | PagerDuty schedule ID | - | Yes |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token | - | Yes |
| `SLACK_CHANNEL` | Target Slack channel | #roee-tests | No |
| `TIMEZONE` | Timezone for scheduling | Asia/Jerusalem | No |
| `PORT` | HTTP server port | 8080 | No |
| `LOG_LEVEL` | Logging level | info | No |

## How `@oncall` Group Management Works

1. Fetches the current on-call person from the configured PagerDuty schedule
2. Looks up the user's Slack account by matching their email address
3. Finds the `@oncall` Slack user group (must already exist in your workspace)
4. Updates the user group membership so only the current on-call person is a member

This means mentioning `@oncall` in any Slack channel will always ping whoever is currently on-call.

**Required Slack scopes:** `usergroups:read` and `usergroups:write` (in addition to the standard bot scopes).

**Prerequisite:** Create an `@oncall` user group in your Slack workspace before using this feature.

## API Endpoints

- `GET /health` - Basic health check
- `GET /ready` - Readiness check (tests PagerDuty and Slack connections)
- `POST /notify` - Trigger on-call notification manually
- `POST /sync` - Sync the `@oncall` Slack user group with current on-call person

## Architecture

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

```
┌─────────────────┐
│ Cloud Scheduler │
│  (Every Monday) │
└────────┬────────┘
         │ POST /notify
         ▼
┌─────────────────────────┐
│   Cloud Run Service     │
│  ┌──────────────────┐   │
│  │  OnCall Service  │   │
│  └────┬───────┬─────┘   │
│       │       │          │
│  ┌────▼─────┐ │          │
│  │ PagerDuty│ │          │
│  │ Service  │ │          │
│  └──────────┘ │          │
│       │       │          │
│  ┌────▼───────▼─────┐   │
│  │  Slack Service   │   │
│  └──────────────────┘   │
└─────────────────────────┘
         │
         ▼
    ┌─────────┐
    │  Slack  │
    │ Channel │
    └─────────┘
```

## Development

See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for local development setup and guidelines.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Run linting (`npm run lint`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details

## Support

- **Issues**: [GitHub Issues](https://github.com/roeezolantz/pager-duty-slacker/issues)
- **Discussions**: [GitHub Discussions](https://github.com/roeezolantz/pager-duty-slacker/discussions)

## Acknowledgments

- Built with TypeScript, Express, and love
- Inspired by the need to automate on-call notifications
- Thanks to the PagerDuty and Slack teams for their excellent APIs
