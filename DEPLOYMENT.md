# PD-Slacker Deployment Guide

## Architecture

PD-Slacker runs as a **Cloud Run Job** that executes once per trigger:

```
┌─────────────────────┐
│  Cloud Scheduler    │ Every Monday 9 AM Israel Time
│  (Cron: 0 9 * * 1)  │
└──────────┬──────────┘
           │ Triggers
           ▼
┌─────────────────────┐
│   Cloud Run Job     │
│   (pd-slacker)      │
├─────────────────────┤
│ 1. Fetch on-call    │ ──► PagerDuty API
│ 2. Get user details │ ──► PagerDuty API
│ 3. Lookup Slack ID  │ ──► Slack API
│ 4. Post notification│ ──► Slack Channel
│ 5. Exit (success)   │
└─────────────────────┘
```

## How It Works

### Job Mode (Production - Cloud Run Jobs)
- **Entry Point:** `src/job.ts` → `dist/job.js`
- **Trigger:** Cloud Scheduler executes the job
- **Behavior:** Runs once, sends notification, exits
- **Cost:** Pay only for execution time (~5-30 seconds)

### Server Mode (Development - Local testing)
- **Entry Point:** `src/index.ts` → `dist/index.js`
- **Usage:** Local testing with HTTP endpoints
- **Endpoints:**
  - `GET /health` - Health check
  - `GET /ready` - Readiness check (tests API connections)
  - `POST /notify` - Manually trigger notification

## Local Testing

### Test Job Mode (Recommended)
```bash
# Run once and exit (simulates production)
pnpm dev:job
```

### Test Server Mode (For debugging)
```bash
# Start server on port 8080
pnpm dev

# Trigger notification manually
curl -X POST http://localhost:8080/notify
```

## Prerequisites

### 1. Fix Slack App Permissions

Your Slack bot needs these OAuth scopes:

1. Go to https://api.slack.com/apps → Your App → **OAuth & Permissions**
2. Add **Bot Token Scopes**:
   - ✅ `chat:write` - Post messages to channels
   - ✅ `users:read` - Look up users
   - ✅ `users:read.email` - Find users by email
3. Click **Reinstall App** to workspace

### 2. Add Bot to Channel

```
# In Slack channel #roee-tests
/invite @YourBotName
```

## Deployment to GCP

### 1. Set Up GCP Secrets

```bash
# Set your PagerDuty API key
echo -n "YOUR_API_KEY" | gcloud secrets create pagerduty-api-key \
  --data-file=- \
  --replication-policy="automatic"

# Set your Slack bot token
echo -n "xoxb-YOUR-TOKEN" | gcloud secrets create slack-bot-token \
  --data-file=- \
  --replication-policy="automatic"
```

### 2. Build and Push Docker Image

```bash
# Set your GCP project
export GCP_PROJECT_ID="your-project-id"
export GCP_REGION="us-central1"

# Build and tag image
docker build -t ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/pd-slacker/pd-slacker:latest .

# Push to Artifact Registry
docker push ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/pd-slacker/pd-slacker:latest
```

### 3. Deploy Infrastructure with Terraform

```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Create terraform.tfvars
cat > terraform.tfvars <<EOF
gcp_project_id       = "your-project-id"
gcp_region           = "us-central1"
pagerduty_schedule_id = "YOUR_SCHEDULE_ID"
slack_channel        = "#roee-tests"
timezone             = "Asia/Jerusalem"
log_level            = "info"
EOF

# Preview changes
terraform plan

# Deploy
terraform apply
```

### 4. Verify Deployment

```bash
# Manually trigger the job
gcloud run jobs execute pd-slacker --region=us-central1

# View logs
gcloud run jobs logs read pd-slacker --region=us-central1

# Check scheduler
gcloud scheduler jobs list --location=us-central1
```

## How Cloud Scheduler Triggers the Job

The scheduler uses the Cloud Run Jobs API:

```
POST https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/pd-slacker:run
```

- **Authentication:** OAuth token from scheduler service account
- **Permissions:** `roles/run.invoker` on the project
- **Schedule:** `0 9 * * 1` (Monday 9 AM)
- **Timezone:** `Asia/Jerusalem`

## Environment Variables

### Required (Production)
- `NODE_ENV=production` - Loads secrets from GCP Secret Manager
- `PAGERDUTY_SCHEDULE_ID` - Your PagerDuty schedule ID
- `SLACK_CHANNEL` - Target Slack channel (e.g., `#on-call`)
- `TIMEZONE` - Timezone for week calculations (e.g., `Asia/Jerusalem`)
- `GCP_PROJECT_ID` - Your GCP project ID

### Optional
- `LOG_LEVEL` - Logging level (default: `info`)

### Development Only (.env file)
- `NODE_ENV=development` - Loads secrets from .env file
- `PAGERDUTY_API_KEY` - Your PagerDuty API key
- `SLACK_BOT_TOKEN` - Your Slack bot token
- `SLACK_CHANNEL='#roee-tests'` - Note: Single quotes required for `#`

## Cost Estimation

### Cloud Run Jobs
- **Execution Time:** ~5-30 seconds per run
- **Frequency:** Once per week (52 times/year)
- **Cost:** < $0.01/month (Free tier covers it)

### Other GCP Services
- **Cloud Scheduler:** $0.10/month per job
- **Secret Manager:** $0.06/month for 2 secrets
- **Artifact Registry:** Free for first 0.5 GB

**Total:** ~$0.16/month

## Troubleshooting

### Job Fails Immediately
```bash
# Check logs
gcloud run jobs logs read pd-slacker --region=us-central1 --limit=50
```

Common issues:
- Missing Slack permissions → See "Fix Slack App Permissions" above
- Bot not in channel → Invite bot to channel
- Invalid secrets → Verify secret values in Secret Manager

### Scheduler Not Triggering
```bash
# Check scheduler status
gcloud scheduler jobs describe pd-slacker-weekly-notification --location=us-central1

# Manually trigger to test
gcloud scheduler jobs run pd-slacker-weekly-notification --location=us-central1
```

### Test Connection to APIs
```bash
# Start server locally
pnpm dev

# Test readiness (checks PagerDuty + Slack)
curl http://localhost:8080/ready
```

## Architecture Benefits

✅ **Cost Effective:** Only pay for execution time (~30s/week)
✅ **Reliable:** Built-in retries, circuit breakers, exponential backoff
✅ **Observable:** Structured logging with correlation IDs
✅ **Secure:** Secrets in GCP Secret Manager, not in code
✅ **Scalable:** Cloud Run auto-scales (though we only need 1 execution)
✅ **Simple:** No server to maintain, just a scheduled job

## Next Steps

1. ✅ Fix Slack app permissions
2. ✅ Add bot to channel
3. ✅ Test locally: `pnpm dev:job`
4. ⬜ Deploy to GCP
5. ⬜ Verify first Monday notification
