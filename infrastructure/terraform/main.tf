terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# Enable required APIs
resource "google_project_service" "cloud_run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloud_scheduler" {
  service            = "cloudscheduler.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "secret_manager" {
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifact_registry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

# Create Artifact Registry repository
resource "google_artifact_registry_repository" "pd_slacker" {
  location      = var.gcp_region
  repository_id = "pd-slacker"
  description   = "Docker repository for PD-Slacker"
  format        = "DOCKER"

  depends_on = [google_project_service.artifact_registry]
}

# Create secrets in Secret Manager
resource "google_secret_manager_secret" "pagerduty_api_key" {
  secret_id = "pagerduty-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.secret_manager]
}

resource "google_secret_manager_secret" "slack_bot_token" {
  secret_id = "slack-bot-token"

  replication {
    auto {}
  }

  depends_on = [google_project_service.secret_manager]
}

# Service account for Cloud Run
resource "google_service_account" "pd_slacker" {
  account_id   = "pd-slacker-sa"
  display_name = "PD-Slacker Service Account"
  description  = "Service account for PD-Slacker Cloud Run service"
}

# Grant secret access to service account
resource "google_secret_manager_secret_iam_member" "pagerduty_access" {
  secret_id = google_secret_manager_secret.pagerduty_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.pd_slacker.email}"
}

resource "google_secret_manager_secret_iam_member" "slack_access" {
  secret_id = google_secret_manager_secret.slack_bot_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.pd_slacker.email}"
}

# Cloud Run Job (runs once per execution)
resource "google_cloud_run_v2_job" "pd_slacker" {
  name     = "pd-slacker"
  location = var.gcp_region

  template {
    template {
      service_account = google_service_account.pd_slacker.email

      max_retries = 3
      timeout     = "300s"

      containers {
        image = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/pd-slacker/pd-slacker:latest"

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "LOG_LEVEL"
          value = var.log_level
        }

        env {
          name  = "PAGERDUTY_SCHEDULE_ID"
          value = var.pagerduty_schedule_id
        }

        env {
          name  = "SLACK_CHANNEL"
          value = var.slack_channel
        }

        env {
          name  = "TIMEZONE"
          value = var.timezone
        }

        env {
          name  = "GCP_PROJECT_ID"
          value = var.gcp_project_id
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.cloud_run,
    google_artifact_registry_repository.pd_slacker,
  ]
}

# Service account for Cloud Scheduler
resource "google_service_account" "scheduler" {
  account_id   = "pd-slacker-scheduler-sa"
  display_name = "PD-Slacker Scheduler Service Account"
  description  = "Service account for Cloud Scheduler to execute PD-Slacker job"
}

# Grant job runner role to scheduler service account
resource "google_project_iam_member" "scheduler_job_runner" {
  project = var.gcp_project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.scheduler.email}"
}

# Cloud Scheduler job to execute Cloud Run Job
resource "google_cloud_scheduler_job" "weekly_notification" {
  name             = "pd-slacker-weekly-notification"
  description      = "Execute PD-Slacker job every Monday at 9 AM Israel time"
  schedule         = "0 9 * * 1"
  time_zone        = var.timezone
  attempt_deadline = "320s"
  region           = var.gcp_region

  retry_config {
    retry_count          = 1
    min_backoff_duration = "5s"
    max_backoff_duration = "60s"
  }

  http_target {
    http_method = "POST"
    uri         = "https://${var.gcp_region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.gcp_project_id}/jobs/${google_cloud_run_v2_job.pd_slacker.name}:run"

    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  depends_on = [
    google_project_service.cloud_scheduler,
    google_cloud_run_v2_job.pd_slacker,
  ]
}
