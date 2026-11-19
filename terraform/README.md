# Terraform — Infrastructure as Code

This directory contains the Terraform configuration for all StellarKraal AWS
infrastructure. State is stored remotely in S3 with DynamoDB state locking so
that the whole team can apply infrastructure changes safely and collaboratively.

---

## Directory layout

```
terraform/
├── backend.tf          # Remote S3 backend declaration (issue #1478)
├── main.tf             # Provider, KMS key, and shared resources
├── variables.tf        # Input variables
├── outputs.tf          # Exported values
├── compute.tf          # ECS / EC2 compute resources
├── database.tf         # RDS configuration
├── networking.tf       # VPC, subnets, security groups
├── s3.tf               # Application S3 buckets
├── storage.tf          # EFS / other storage
├── backup.tf           # Backup plans
├── monitoring.tf       # CloudWatch / alerting
├── alerts.tf           # PagerDuty / SNS alerts
├── modules/
│   └── rds/            # Reusable RDS module
└── bootstrap/          # One-time backend provisioning (run first)
    ├── main.tf
    └── variables.tf
```

---

## First-time setup (bootstrapping the remote backend)

> **Run this once per AWS account / environment.** Once the state bucket and
> lock table exist, all subsequent `terraform init` calls use them automatically.

### 1 — Provision the state bucket and lock table

```bash
cd terraform/bootstrap

terraform init

terraform apply \
  -var="aws_region=us-east-1" \
  -var="environment=production" \
  -var="state_bucket_name=stellarkraal-terraform-state-prod"
```

Terraform prints the `terraform_init_command` output at the end. Copy it for
the next step.

### 2 — Initialise the root module with the remote backend

```bash
cd ..   # back to terraform/

terraform init \
  -backend-config="bucket=stellarkraal-terraform-state-prod" \
  -backend-config="key=stellarkraal/production/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=stellarkraal-terraform-lock" \
  -backend-config="encrypt=true"
```

You will be asked whether to copy any existing local state to the new backend.
Answer **yes** to migrate state, or **no** if starting fresh.

### 3 — Verify

```bash
terraform plan
```

A successful plan confirms that the remote backend is configured correctly.

---

## Day-to-day workflow

```bash
# Pull the latest remote state before making changes
terraform refresh

# Preview changes
terraform plan -out=tfplan

# Apply changes
terraform apply tfplan
```

Always run `terraform plan` before `apply`. Never run `apply` on `main` without
a plan file.

---

## Staging environment

Use a separate state key for staging so the two environments never share state:

```bash
terraform init \
  -backend-config="bucket=stellarkraal-terraform-state-staging" \
  -backend-config="key=stellarkraal/staging/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=stellarkraal-terraform-lock" \
  -backend-config="encrypt=true"
```

Or use Terraform workspaces:

```bash
terraform workspace new staging
terraform workspace select staging
terraform plan -var="environment=staging"
```

---

## Remote state backend details

| Resource | Name | Purpose |
|---|---|---|
| S3 bucket | `stellarkraal-terraform-state-<env>` | Stores state files, versioned and encrypted |
| DynamoDB table | `stellarkraal-terraform-lock` | Provides optimistic state locking |

Both resources are provisioned by `terraform/bootstrap/` and have
`prevent_destroy = true` so they cannot be accidentally deleted.

The backend configuration in `backend.tf` uses partial configuration — no
bucket names or keys are hard-coded there, so the same file works across all
environments. Supply the concrete values at `terraform init` time via
`-backend-config` flags or a `backend.hcl` file (do not commit `backend.hcl`
files that contain account-specific names to version control).

---

## Troubleshooting

**`Error acquiring the state lock`**  
Another process holds the lock. If you are certain no other apply is running,
release it with:
```bash
terraform force-unlock <lock-id>
```

**`NoSuchBucket` on `terraform init`**  
The bootstrap has not been run, or the bucket name is wrong. Re-run the
bootstrap step above.

**State drift after a failed apply**  
Run `terraform refresh` to reconcile the state file with what is actually
provisioned, then re-run `terraform plan` to review the diff.
