terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.40.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required services
resource "google_project_service" "services" {
  for_each = toset([
    "aiplatform.googleapis.com",
    "storage.googleapis.com",
    "firestore.googleapis.com",
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "logging.googleapis.com",
  ])
  project = var.project_id
  service = each.key
}

# GCS bucket for uploads and reports
resource "google_storage_bucket" "audit_bucket" {
  name                        = var.bucket_name
  location                    = var.location
  uniform_bucket_level_access = true
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 365
    }
  }
}

# Firestore (native mode) database
resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"
}

# Output values
output "bucket_name" {
  value = google_storage_bucket.audit_bucket.name
}
