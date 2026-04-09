# Setup Guide

This guide walks you through setting up PD-Slacker from scratch.

## Prerequisites

- Google Cloud account with billing enabled
- PagerDuty account with API access
- Slack workspace with admin permissions
- `gcloud` CLI installed and configured
- `terraform` installed (>= 1.0)
- Node.js 20+ and npm
- Docker (optional, for local testing)

## Step 1: PagerDuty Setup

### 1.1 Get API Token

1. Log in to PagerDuty
2. Navigate to **Configuration** → **API Access**
3. Click **Create New API Key**
4. Give it a name (e.g., "PD-Slacker")
5. Copy the API token (starts with `u+`)

### 1.2 Find Schedule ID

1. Navigate to **People** → **On-Call Schedules**
2. Click on your schedule (e.g., "on call")
3. The URL will look like: `https://yourcompany.pagerduty.com/schedules/PXXXXXX`
4. Copy the schedule ID (e.g., `PXXXXXX`)

## Step 2: Slack Setup

### 2.1 Create Slack App

1. Go to https://api.slack.com/apps
2. Click **Create New App** → **From scratch**
3. Name it "PD-Slacker" and select your workspace
4. Click **Create App**

### 2.2 Configure Bot Permissions

1. Navigate to **OAuth & Permissions**
2. Scroll to **Scopes** → **Bot Token Scopes**
3. Add these scopes:
   - `chat:write` - Post messages
   - `users:read` - View users
   - `users:read.email` - View email addresses
   - `usergroups:read` - View usergroups (for @oncall group)
   - `usergroups:write` - Update usergroups (to set @oncall members)

### 2.3 Install to Workspace

1. Scroll to **OAuth Tokens**
2. Click **Install to Workspace**
3. Authorize the app
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### 2.4 Invite Bot to Channel

1. Go to your Slack workspace
2. Navigate to the channel (e.g., `#roee-tests`)
3. Type `/invite @PD-Slacker`

## Step 3: Google Cloud Setup

### 3.1 Create GCP Project

```bash
# Set project ID
export GCP_PROJECT_ID="your-project-id"

# Create project
gcloud projects create $GCP_PROJECT_ID --name="PD-Slacker"

# Set as active project
gcloud config set project $GCP_PROJECT_ID

# Enable billing (replace with your billing account ID)
gcloud billing projects link $GCP_PROJECT_ID --billing-account=XXXXXX-XXXXXX-XXXXXX
```

### 3.2 Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com
```

### 3.3 Set Up Authentication

```bash
# Create service account for Terraform
gcloud iam service-accounts create terraform-sa \
  --display-name="Terraform Service Account"

# Grant necessary roles
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:terraform-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/editor"

# Create and download key
gcloud iam service-accounts keys create ~/terraform-key.json \
  --iam-account=terraform-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com

# Set credentials
export GOOGLE_APPLICATION_CREDENTIALS=~/terraform-key.json
```

## Step 4: Configure PD-Slacker

### 4.1 Clone and Setup

```bash
git clone https://github.com/roeezolantz/pd-slacker.git
cd pd-slacker
npm install
```

### 4.2 Create Environment File

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# PagerDuty
PAGERDUTY_API_KEY=u+your-pagerduty-api-key
PAGERDUTY_SCHEDULE_ID=PXXXXXX

# Slack
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_CHANNEL=#roee-tests

# GCP
GCP_PROJECT_ID=your-project-id
GCP_REGION=us-central1

# App Config
TIMEZONE=Asia/Jerusalem
LOG_LEVEL=info
PORT=8080
NODE_ENV=production
```

### 4.3 Create Terraform Variables

```bash
cp infrastructure/terraform/terraform.tfvars.example infrastructure/terraform/terraform.tfvars
```

Edit `infrastructure/terraform/terraform.tfvars`:

```hcl
gcp_project_id         = "your-project-id"
gcp_region             = "us-central1"
pagerduty_schedule_id  = "PXXXXXX"
slack_channel          = "#roee-tests"
timezone               = "Asia/Jerusalem"
log_level              = "info"
```

## Step 5: Deploy

### 5.1 Store Secrets in GCP

```bash
./infrastructure/scripts/setup-secrets.sh
```

This will create:
- `pagerduty-api-key` secret
- `slack-bot-token` secret

### 5.2 Deploy Infrastructure

```bash
./infrastructure/scripts/deploy.sh
```

This will:
1. Build Docker image
2. Push to Artifact Registry
3. Deploy with Terraform:
   - Cloud Run service
   - Cloud Scheduler job
   - IAM bindings
   - Secrets

### 5.3 Verify Deployment

```bash
# Get Cloud Run URL
cd infrastructure/terraform
terraform output cloud_run_url

# Test health endpoint
CLOUD_RUN_URL=$(terraform output -raw cloud_run_url)
gcloud run services proxy pd-slacker --region=us-central1 &
curl http://localhost:8080/health

# Manually trigger notification
curl -X POST http://localhost:8080/notify
```

## Step 6: Test

### 6.1 Manual Test

Trigger a notification manually to test:

```bash
gcloud scheduler jobs run pd-slacker-weekly-notification --location=us-central1
```

Check your Slack channel for the notification.

### 6.2 Verify Scheduler

```bash
# View scheduler job
gcloud scheduler jobs describe pd-slacker-weekly-notification --location=us-central1

# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=pd-slacker" --limit=50
```

## Troubleshooting

### Scheduler Not Triggering

1. Check scheduler status:
   ```bash
   gcloud scheduler jobs describe pd-slacker-weekly-notification --location=us-central1
   ```

2. Check IAM permissions:
   ```bash
   gcloud run services get-iam-policy pd-slacker --region=us-central1
   ```

### Cloud Run Errors

1. View logs:
   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=pd-slacker" --limit=50
   ```

2. Check environment variables:
   ```bash
   gcloud run services describe pd-slacker --region=us-central1 --format=yaml
   ```

### Secrets Not Accessible

1. Verify secrets exist:
   ```bash
   gcloud secrets list
   ```

2. Check IAM permissions:
   ```bash
   gcloud secrets get-iam-policy pagerduty-api-key
   gcloud secrets get-iam-policy slack-bot-token
   ```

## Next Steps

- Set up monitoring and alerting
- Configure custom schedules
- Add multiple teams/channels
- Set up CI/CD for automatic deployments

See [DEPLOYMENT.md](DEPLOYMENT.md) for advanced deployment options.
