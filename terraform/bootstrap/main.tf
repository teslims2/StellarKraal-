# Bootstrap — issue #1478
#
# Provisions the S3 bucket and DynamoDB table that the root Terraform module
# uses as its remote state backend. This module must be applied exactly once,
# before `terraform init` is run in the parent directory.
#
# State for this bootstrap module is intentionally kept LOCAL (the default)
# because there is no remote backend yet when it first runs.

terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ── S3 state bucket ──────────────────────────────────────────────────────────

resource "aws_s3_bucket" "terraform_state" {
  bucket = var.state_bucket_name

  # Prevent accidental deletion of the bucket while state files live in it.
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name        = var.state_bucket_name
    Environment = var.environment
    ManagedBy   = "terraform-bootstrap"
    Purpose     = "terraform-remote-state"
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    # Versioning preserves a full history of state files so that any accidental
    # mutation or deletion can be recovered.
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      # AES-256 (SSE-S3) is sufficient for state files. Switch to aws:kms and
      # supply kms_master_key_id if your security policy requires customer-managed keys.
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "terraform_state_policy" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    resources = [
      aws_s3_bucket.terraform_state.arn,
      "${aws_s3_bucket.terraform_state.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  policy = data.aws_iam_policy_document.terraform_state_policy.json

  depends_on = [aws_s3_bucket_public_access_block.terraform_state]
}

# ── DynamoDB lock table ──────────────────────────────────────────────────────

resource "aws_dynamodb_table" "terraform_state_lock" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  # Protect the lock table from accidental deletion.
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name        = var.lock_table_name
    Environment = var.environment
    ManagedBy   = "terraform-bootstrap"
    Purpose     = "terraform-state-locking"
  }
}

# ── Outputs ──────────────────────────────────────────────────────────────────

output "state_bucket_name" {
  description = "Name of the S3 bucket that holds Terraform state files."
  value       = aws_s3_bucket.terraform_state.id
}

output "state_bucket_arn" {
  description = "ARN of the S3 state bucket."
  value       = aws_s3_bucket.terraform_state.arn
}

output "lock_table_name" {
  description = "Name of the DynamoDB table used for state locking."
  value       = aws_dynamodb_table.terraform_state_lock.name
}

output "lock_table_arn" {
  description = "ARN of the DynamoDB state-lock table."
  value       = aws_dynamodb_table.terraform_state_lock.arn
}

output "terraform_init_command" {
  description = "terraform init command to run in the root module after bootstrapping."
  value       = <<-EOT
    terraform init \
      -backend-config="bucket=${aws_s3_bucket.terraform_state.id}" \
      -backend-config="key=stellarkraal/${var.environment}/terraform.tfstate" \
      -backend-config="region=${var.aws_region}" \
      -backend-config="dynamodb_table=${aws_dynamodb_table.terraform_state_lock.name}" \
      -backend-config="encrypt=true"
  EOT
}
