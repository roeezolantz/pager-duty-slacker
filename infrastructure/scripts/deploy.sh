#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting PD-Slacker deployment...${NC}"

# Check required tools
command -v gcloud >/dev/null 2>&1 || { echo -e "${RED}gcloud CLI is required but not installed. Aborting.${NC}" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo -e "${RED}docker is required but not installed. Aborting.${NC}" >&2; exit 1; }

# Load environment variables
if [ -f .env ]; then
    source .env
else
    echo -e "${RED}.env file not found. Please create it based on .env.example${NC}"
    exit 1
fi

# Check required environment variables
: "${GCP_PROJECT_ID:?Need to set GCP_PROJECT_ID in .env}"
: "${PAGERDUTY_SCHEDULE_ID:?Need to set PAGERDUTY_SCHEDULE_ID in .env}"
: "${PAGERDUTY_API_KEY:?Need to set PAGERDUTY_API_KEY in .env}"
: "${SLACK_BOT_TOKEN:?Need to set SLACK_BOT_TOKEN in .env}"

# Set default region if not set
GCP_REGION=${GCP_REGION:-us-central1}

echo -e "${GREEN}Configuration:${NC}"
echo "  Project ID: $GCP_PROJECT_ID"
echo "  Region: $GCP_REGION"
echo "  Schedule ID: $PAGERDUTY_SCHEDULE_ID"

# Configure gcloud
echo -e "${YELLOW}Configuring gcloud...${NC}"
gcloud config set project $GCP_PROJECT_ID

# Build Docker image
echo -e "${YELLOW}Building Docker image...${NC}"
docker build -t pd-slacker:latest .

# Tag image for Artifact Registry
IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/pd-slacker/pd-slacker:latest"
docker tag pd-slacker:latest $IMAGE_URI

# Configure Docker to use gcloud as credential helper
echo -e "${YELLOW}Configuring Docker authentication...${NC}"
gcloud auth configure-docker ${GCP_REGION}-docker.pkg.dev

# Push image
echo -e "${YELLOW}Pushing Docker image to Artifact Registry...${NC}"
docker push $IMAGE_URI

# Deploy with Terraform
echo -e "${YELLOW}Deploying infrastructure with Terraform...${NC}"
cd infrastructure/terraform

if [ ! -f terraform.tfvars ]; then
    echo -e "${RED}terraform.tfvars not found. Creating from example...${NC}"
    cp terraform.tfvars.example terraform.tfvars
    echo -e "${YELLOW}Please update terraform.tfvars with your values and run this script again.${NC}"
    exit 1
fi

terraform init
terraform plan
terraform apply -auto-approve

cd ../..

echo -e "${GREEN}Deployment complete!${NC}"
echo -e "${GREEN}Run 'terraform output' in infrastructure/terraform to see deployment details${NC}"
