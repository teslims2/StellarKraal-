variable "aws_region" {
  description = "AWS region where the state bucket and lock table are created."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment label applied to resource tags (e.g. production, staging)."
  type        = string
  default     = "production"
}

variable "state_bucket_name" {
  description = <<-EOT
    Globally unique name for the S3 bucket that stores Terraform state.
    Must be lowercase, 3-63 characters, and must not already exist.
    Example: "stellarkraal-terraform-state-prod"
  EOT
  type        = string
}

variable "lock_table_name" {
  description = <<-EOT
    Name of the DynamoDB table used for Terraform state locking.
    Example: "stellarkraal-terraform-lock"
  EOT
  type        = string
  default     = "stellarkraal-terraform-lock"
}
