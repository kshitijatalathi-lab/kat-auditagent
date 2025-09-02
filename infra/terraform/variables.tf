variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "Default region"
  type        = string
  default     = "us-central1"
}

variable "location" {
  description = "Bucket location"
  type        = string
  default     = "US"
}

variable "firestore_location" {
  description = "Firestore location ID (e.g., nam5)"
  type        = string
  default     = "nam5"
}

variable "bucket_name" {
  description = "GCS bucket name for uploads and reports"
  type        = string
}
