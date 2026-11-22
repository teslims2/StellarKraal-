# Remote state backend — issue #1478
#
# Terraform state is stored in S3 with server-side encryption and versioning.
# A DynamoDB table provides state locking so concurrent runs never corrupt state.
#
# IMPORTANT — bootstrap first
# The S3 bucket and DynamoDB table must exist before Terraform can initialise
# this backend. Run the one-time bootstrap script before `terraform init`:
#
#   cd terraform/bootstrap
#   terraform init && terraform apply
#
# Then initialise the main root module:
#
#   cd ..
#   terraform init \
#     -backend-config="bucket=<state-bucket-name>" \
#     -backend-config="dynamodb_table=<lock-table-name>" \
#     -backend-config="region=<aws-region>"
#
# See terraform/README.md for the full first-time setup guide.

terraform {
  backend "s3" {
    # All values are supplied at `terraform init` time via -backend-config flags
    # or a backend.hcl file so that different environments can share the same
    # configuration without hard-coding account-specific names here.
    #
    # Required keys:
    #   bucket         — name of the S3 state bucket (created by bootstrap)
    #   key            — path inside the bucket, e.g. "stellarkraal/production/terraform.tfstate"
    #   region         — AWS region of the bucket
    #   dynamodb_table — name of the DynamoDB lock table (created by bootstrap)
    #   encrypt        — must be true; enforced below

    encrypt = true
  }
}
