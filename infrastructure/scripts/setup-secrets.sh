#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up secrets in GCP Secret Manager...${NC}"

# Load environment variables
if [ -f .env ]; then
    source .env
else
    echo -e "${RED}.env file not found. Please create it based on .env.example${NC}"
    exit 1
fi

# Check required environment variables
: "${GCP_PROJECT_ID:?Need to set GCP_PROJECT_ID in .env}"
: "${PAGERDUTY_API_KEY:?Need to set PAGERDUTY_API_KEY in .env}"
: "${SLACK_BOT_TOKEN:?Need to set SLACK_BOT_TOKEN in .env}"

echo -e "${YELLOW}Configuring gcloud...${NC}"
gcloud config set project $GCP_PROJECT_ID

# Create or update PagerDuty API key secret
echo -e "${YELLOW}Creating/updating PagerDuty API key secret...${NC}"
if gcloud secrets describe pagerduty-api-key >/dev/null 2>&1; then
    echo "Secret already exists, adding new version..."
    echo -n "$PAGERDUTY_API_KEY" | gcloud secrets versions add pagerduty-api-key --data-file=-
else
    echo "Creating new secret..."
    echo -n "$PAGERDUTY_API_KEY" | gcloud secrets create pagerduty-api-key --data-file=-
fi

# Create or update Slack bot token secret
echo -e "${YELLOW}Creating/updating Slack bot token secret...${NC}"
if gcloud secrets describe slack-bot-token >/dev/null 2>&1; then
    echo "Secret already exists, adding new version..."
    echo -n "$SLACK_BOT_TOKEN" | gcloud secrets versions add slack-bot-token --data-file=-
else
    echo "Creating new secret..."
    echo -n "$SLACK_BOT_TOKEN" | gcloud secrets create slack-bot-token --data-file=-
fi

echo -e "${GREEN}Secrets setup complete!${NC}"
echo -e "${YELLOW}Note: Make sure to grant the Cloud Run service account access to these secrets${NC}"
