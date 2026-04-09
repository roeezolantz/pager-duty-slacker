output "cloud_run_job_name" {
  description = "Name of the Cloud Run job"
  value       = google_cloud_run_v2_job.pd_slacker.name
}

output "scheduler_job_name" {
  description = "Name of the Cloud Scheduler job"
  value       = google_cloud_scheduler_job.weekly_notification.name
}

output "service_account_email" {
  description = "Email of the Cloud Run service account"
  value       = google_service_account.pd_slacker.email
}

output "artifact_registry_repository" {
  description = "Artifact Registry repository URL"
  value       = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.pd_slacker.repository_id}"
}

output "secret_pagerduty_name" {
  description = "Name of the PagerDuty API key secret"
  value       = google_secret_manager_secret.pagerduty_api_key.secret_id
}

output "secret_slack_name" {
  description = "Name of the Slack bot token secret"
  value       = google_secret_manager_secret.slack_bot_token.secret_id
}
