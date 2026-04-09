variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "pagerduty_schedule_id" {
  description = "PagerDuty schedule ID to monitor"
  type        = string
}

variable "slack_channel" {
  description = "Slack channel for notifications"
  type        = string
  default     = "#roee-tests"
}

variable "timezone" {
  description = "Timezone for the scheduler"
  type        = string
  default     = "Asia/Jerusalem"
}

variable "log_level" {
  description = "Application log level"
  type        = string
  default     = "info"
  validation {
    condition     = contains(["error", "warn", "info", "debug"], var.log_level)
    error_message = "Log level must be one of: error, warn, info, debug"
  }
}
