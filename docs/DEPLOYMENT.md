# Deployment Guide

This guide covers deploying PD-Slacker to Google Cloud Platform.

## Deployment Methods

1. **Automated (Recommended)**: Use provided scripts
2. **Manual**: Step-by-step using gcloud and terraform
3. **CI/CD**: GitHub Actions automated deployment

## Method 1: Automated Deployment

### Prerequisites

- Completed [SETUP.md](SETUP.md)
- `.env` file configured
- GCP authentication configured

### Deploy

```bash
# 1. Set up secrets
./infrastructure/scripts/setup-secrets.sh

# 2. Deploy everything
./infrastructure/scripts/deploy.sh
```

The script will:
1. Build Docker image
2. Tag for Artifact Registry
3. Push to Artifact Registry
4. Run Terraform to provision infrastructure
5. Deploy Cloud Run service
6. Configure Cloud Scheduler

## Method 2: Manual Deployment

### Step 1: Build and Push Docker Image

```bash
# Set variables
export GCP_PROJECT_ID="your-project-id"
export GCP_REGION="us-central1"
export IMAGE_TAG="$(date +%Y%m%d-%H%M%S)"

# Build image
docker build -t pd-slacker:$IMAGE_TAG .

# Tag for Artifact Registry
IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/pd-slacker/pd-slacker:${IMAGE_TAG}"
docker tag pd-slacker:$IMAGE_TAG $IMAGE_URI
docker tag pd-slacker:$IMAGE_TAG ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/pd-slacker/pd-slacker:latest

# Configure Docker auth
gcloud auth configure-docker ${GCP_REGION}-docker.pkg.dev

# Push image
docker push $IMAGE_URI
docker push ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/pd-slacker/pd-slacker:latest
```

### Step 2: Deploy with Terraform

```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Review plan
terraform plan

# Apply
terraform apply
```

### Step 3: Verify Deployment

```bash
# Get Cloud Run URL
terraform output cloud_run_url

# Check service status
gcloud run services describe pd-slacker --region=$GCP_REGION

# Check scheduler
gcloud scheduler jobs describe pd-slacker-weekly-notification --location=$GCP_REGION
```

## Method 3: CI/CD with GitHub Actions

### Setup

1. **Create Workload Identity Federation**

```bash
# Create workload identity pool
gcloud iam workload-identity-pools create github-pool \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Create service account for GitHub Actions
gcloud iam service-accounts create github-actions-sa \
  --display-name="GitHub Actions Service Account"

# Grant necessary roles
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:github-actions-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:github-actions-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Allow GitHub Actions to impersonate the service account
gcloud iam service-accounts add-iam-policy-binding \
  github-actions-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_GITHUB_USERNAME/pd-slacker" \
  --role="roles/iam.workloadIdentityUser"
```

2. **Configure GitHub Secrets**

Add these secrets to your GitHub repository:

- `GCP_PROJECT_ID`: Your GCP project ID
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider`
- `GCP_SERVICE_ACCOUNT`: `github-actions-sa@PROJECT_ID.iam.gserviceaccount.com`

3. **Push to main branch** to trigger deployment

## Post-Deployment Configuration

### Update Secrets

```bash
# Update PagerDuty API key
echo -n "new-api-key" | gcloud secrets versions add pagerduty-api-key --data-file=-

# Update Slack bot token
echo -n "new-bot-token" | gcloud secrets versions add slack-bot-token --data-file=-

# Restart Cloud Run to pick up new secrets
gcloud run services update pd-slacker --region=$GCP_REGION
```

### Change Schedule

Edit `infrastructure/terraform/variables.tf` and update the schedule:

```hcl
# In main.tf, update the schedule cron expression
schedule = "0 9 * * 1"  # Every Monday at 9 AM
```

Then apply:

```bash
cd infrastructure/terraform
terraform apply
```

### Scale Configuration

```bash
# Update min/max instances
gcloud run services update pd-slacker \
  --region=$GCP_REGION \
  --min-instances=0 \
  --max-instances=5

# Update memory/CPU
gcloud run services update pd-slacker \
  --region=$GCP_REGION \
  --memory=1Gi \
  --cpu=2
```

## Monitoring

### View Logs

```bash
# Real-time logs
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=pd-slacker"

# Recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=pd-slacker" \
  --limit=100 \
  --format=json
```

### Set Up Alerts

Create log-based metrics:

```bash
# Create metric for errors
gcloud logging metrics create pd_slacker_errors \
  --description="Count of PD-Slacker errors" \
  --log-filter='resource.type="cloud_run_revision"
    resource.labels.service_name="pd-slacker"
    severity>=ERROR'

# Create alert policy
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="PD-Slacker Errors" \
  --condition-display-name="Error rate too high" \
  --condition-threshold-value=5 \
  --condition-threshold-duration=300s
```

## Cleanup

### Remove All Resources

```bash
cd infrastructure/terraform
terraform destroy
```

### Manual Cleanup

```bash
# Delete Cloud Run service
gcloud run services delete pd-slacker --region=$GCP_REGION

# Delete Cloud Scheduler job
gcloud scheduler jobs delete pd-slacker-weekly-notification --location=$GCP_REGION

# Delete secrets
gcloud secrets delete pagerduty-api-key
gcloud secrets delete slack-bot-token

# Delete Artifact Registry repository
gcloud artifacts repositories delete pd-slacker --location=$GCP_REGION
```

## Troubleshooting

### Deployment Fails

Check Terraform errors:
```bash
cd infrastructure/terraform
terraform plan
```

### Cloud Run Won't Start

View deployment logs:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=pd-slacker" \
  --limit=50 \
  --format=json
```

### Scheduler Not Working

Check scheduler logs:
```bash
gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_id=pd-slacker-weekly-notification" \
  --limit=20
```

### Permission Errors

Verify IAM bindings:
```bash
# Cloud Run invoker
gcloud run services get-iam-policy pd-slacker --region=$GCP_REGION

# Secret access
gcloud secrets get-iam-policy pagerduty-api-key
```

## Best Practices

1. **Use separate projects** for dev/staging/prod
2. **Enable Cloud Audit Logs** for compliance
3. **Set up monitoring** before going to production
4. **Use Terraform state backend** (GCS) for team collaboration
5. **Tag Docker images** with git commit SHA for traceability
6. **Set up alerting** for failures
7. **Regular backup** of Terraform state
8. **Document changes** in version control

## Next Steps

- Set up monitoring dashboards
- Configure error alerting
- Implement cost optimization
- Add backup schedules
- Set up disaster recovery
