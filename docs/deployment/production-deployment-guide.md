# Production Deployment Guide (Terraform and ECS Fargate)

This guide walks a DevOps engineer through provisioning and deploying the full StellarKraal stack
(backend API, frontend, database, cache) to production on AWS. It covers the Terraform
workflow, the ECS Fargate deployment checklist, the IAM permissions required, and a post-deployment
smoke test.

> **Read first: two Terraform trees.** The repository has two Terraform roots, and they do different things:
>
> | Path | What it defines | How it is applied |
> |------|-----------------|-------------------|
> | `infrastructure/` | VPC, ALB, EC2 Auto Scaling group, RDS PostgreSQL, ElastiCache Redis, DynamoDB, Secrets Manager, S3 | CI: `.github/workflows/terraform.yml` (staging and production on push to `main`) |
> | `terraform/` | ECS cluster, Fargate task definition and service, RDS, backups, CloudWatch alarms, SNS | Manually, from a workstation (no remote state backend is configured here) |
>
> The app deployment workflow (`.github/workflows/deploy.yml`) deploys to an **ECS Fargate** cluster and
> service, which are defined in `terraform/`. The `infrastructure/` root does not create that cluster.
> Until the two trees are consolidated, provision both: `infrastructure/` for the network, database and
> cache, and `terraform/` for the ECS cluster and service.

---

## 1. Prerequisites

- Terraform `>= 1.0.0` and the AWS CLI v2, authenticated to the target account.
- Docker, for building images that match CI.
- Access to the GitHub repository's **production** environment (required reviewers apply to the
  production Terraform apply job).
- A registered ACM certificate in the target region, for the ALB HTTPS listener (`acm_certificate_arn`).

---

## 2. Terraform: `infrastructure/`

### 2.1 Bootstrap the remote state (once per account)

`infrastructure/backend.tf` stores state in S3 with a DynamoDB lock. Create those resources first:

```bash
cd infrastructure/bootstrap
terraform init
terraform apply
terraform output   # note state_bucket_name, lock_table_name, kms_key_alias
```

Then make sure the `backend "s3"` block in `infrastructure/backend.tf` uses the names from the outputs
(`bucket`, `dynamodb_table`, `kms_key_id`). Do not put the workspace name in the state key.

### 2.2 Initialise and select the environment workspace

```bash
cd infrastructure
terraform init
terraform workspace select production || terraform workspace new production
```

Workspaces isolate staging and production state. Always confirm the workspace before a plan or apply:

```bash
terraform workspace show   # must print: production
```

### 2.3 Plan and apply

```bash
terraform fmt -check -recursive
terraform validate
terraform plan  -var-file="envs/production.tfvars" -out=production.tfplan
# Review the plan. Confirm no unexpected destroys of RDS, ElastiCache, or S3 resources.
terraform apply production.tfplan
```

`envs/production.tfvars` sets production sizing: three AZs, one NAT gateway per AZ, Multi-AZ RDS and Redis,
deletion protection and Performance Insights on. Review it before the first apply.

### 2.4 What CI does

On every pull request, `terraform.yml` runs `fmt`, `init`, `validate` and `plan` for `staging` and
`production`, and posts the plan to the PR. On push to `main`, it applies staging, then production
(production runs only after staging succeeds, and waits for approval if required reviewers are configured on the `production` environment). Do not apply production from a workstation once CI owns it,
because a local apply can conflict with the state lock.

---

## 3. ECS Fargate: `terraform/` and the app deployment

### 3.1 Provision the cluster and task definition

`terraform/compute.tf` defines:

- `aws_ecs_cluster.main`: `stellarkraal-cluster-<environment>`
- `aws_ecs_task_definition.app`: family `stellarkraal-app-<environment>`, Fargate, 256 CPU / 512 MiB,
  containers `backend` (port 3001) and `frontend` (port 3000)
- `aws_ecs_service.main`: runs the task on Fargate in the public subnets with a public IP (see gap 3.4)

```bash
cd terraform
terraform init
terraform plan  -var="environment=production" -var="image_tag=<tag>" -out=production.tfplan
terraform apply production.tfplan
```

`image_tag` must match the tag you intend to deploy (see section 4). The default is `latest`, which is
fine for a first bootstrap but should not be used for ongoing releases.

### 3.2 Required GitHub Actions secrets

`deploy.yml` runs on every push to `main`. It needs these repository secrets:

| Secret | Purpose |
|--------|---------|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Deploy principal (see section 5) |
| `AWS_REGION` | Region of the ECR repository and ECS cluster |
| `ECR_REPOSITORY` | ECR repository name the image is pushed to |
| `ECS_CLUSTER` | Cluster name, e.g. `stellarkraal-cluster-production` |
| `ECS_SERVICE` | Service name created by `aws_ecs_service.main` |
| `ECS_TASK_DEFINITION` | Task family to download and re-render, e.g. `stellarkraal-app-production` |
| `ECS_CONTAINER_NAME` | Container whose image is replaced, e.g. `backend` |
| `SLACK_WEBHOOK_URL` | Optional. Failure notification |

The ECR repository is not created by Terraform. Create it once:

```bash
aws ecr create-repository --repository-name stellarkraal --image-scanning-configuration scanOnPush=true
```

### 3.3 Deployment checklist

Complete each step in order. Stop at the first failure.

1. **Green CI on `main`.** The backend, frontend, contract, and parity workflows pass for the commit.
2. **Environment parity.** Run `npm run check:env-parity` and confirm it passes.
3. **Secrets present.** Every secret in section 3.2 exists in the production environment.
4. **Terraform in sync.** `terraform plan` in `infrastructure/` and `terraform/` shows no changes you did not expect.
5. **Image built and pushed.** `deploy.yml` pushes `"$ECR_REGISTRY/$ECR_REPOSITORY:<git-sha>"`.
6. **Task definition rendered.** The `ECS_CONTAINER_NAME` container image is replaced with the new SHA image.
7. **Service updated and stable.** `amazon-ecs-deploy-task-definition` waits for stability
   (`wait-for-service-stability: true`). Confirm locally:

   ```bash
   aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE"
   ```

8. **Smoke tests pass** (section 6).
9. **Rollback plan ready.** Keep the previous task definition revision. To roll back:

   ```bash
   aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" \
     --task-definition "<previous-task-definition-arn>"
   ```

### 3.4 Known gaps to fix before relying on this path

These were found while writing this guide. They are not fixed here:

- `deploy.yml` runs `docker build -t ... .` from the **repository root**, but there is no `Dockerfile` at the root.
  The backend image is built from `backend/Dockerfile` and the frontend from `frontend/Dockerfile`. A build from the root will fail.
- `deploy.yml` replaces the image on a single container (`ECS_CONTAINER_NAME`), while the task definition has
  two containers. The frontend image is never updated by this workflow.
- `deploy.yml` authenticates with long-lived access keys, while `terraform.yml` uses OIDC. Prefer OIDC for both.
- The `infrastructure/` default `app_port` is `8080`, while the backend listens on `3001`. Set `app_port` explicitly
  in `envs/production.tfvars` so the ALB target group matches the container.
- `aws_ecs_service.main` places tasks in the **public** subnets with `assign_public_ip = true`, and it has no load balancer.
  The API and frontend ports are therefore reachable directly from the internet. Move the service to private subnets behind an ALB
  before production traffic.

---

## 4. Image tagging conventions

| Context | Image name | Tag | Set by |
|---------|-----------|-----|--------|
| CI deploy to ECR | `$ECR_REGISTRY/$ECR_REPOSITORY` | Git commit SHA (`github.sha`) | `deploy.yml` |
| Local Compose and production Compose | `stellarkraal-backend`, `stellarkraal-frontend` | `IMAGE_TAG` (default `latest`) | `docker-compose*.yml` |
| Terraform ECS task definition | `stellarkraal-backend`, `stellarkraal-frontend` | `image_tag` (default `latest`) | `terraform/variables.tf` |

Rules:

- Deploy only **immutable** tags (the git SHA). Never deploy `latest` to production.
- When you build locally for a release, set `IMAGE_TAG` to the same value you pass to Terraform as `image_tag`.
- `scripts/check-environment-parity.js` enforces that the compose and Terraform image names and default tags match.

---

## 5. IAM permissions

### 5.1 Deploy principal (GitHub Actions, used by `deploy.yml`)

This policy covers the actions `deploy.yml` performs: ECR login and push, reading and registering the task
definition, updating the service and waiting for stability, and passing the task execution role.
Replace the placeholders and scope resources to your account.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrLogin",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "EcrPushImage",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage",
        "ecr:BatchGetImage"
      ],
      "Resource": "arn:aws:ecr:<region>:<account-id>:repository/<ecr-repository>"
    },
    {
      "Sid": "EcsTaskDefinition",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:DeregisterTaskDefinition"
      ],
      "Resource": "*"
    },
    {
      "Sid": "EcsServiceDeploy",
      "Effect": "Allow",
      "Action": [
        "ecs:UpdateService",
        "ecs:DescribeServices"
      ],
      "Resource": "arn:aws:ecs:<region>:<account-id>:service/<cluster-name>/<service-name>"
    },
    {
      "Sid": "PassTaskExecutionRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<account-id>:role/<ecs-task-execution-role>",
      "Condition": {
        "StringEquals": { "iam:PassedToService": "ecs-tasks.amazonaws.com" }
      }
    }
  ]
}
```

`ecs:RegisterTaskDefinition` and `ecs:DeregisterTaskDefinition` do not support resource-level scoping, so they remain
`"*"`.

### 5.2 Terraform principal (applies `infrastructure/` and `terraform/`)

The Terraform principal creates the resources listed below. Scope each action to the `stellarkraal-*` name prefix
or the account's resource ARNs where the service supports it. Start from these services and tighten the policy
with IAM Access Analyzer after the first successful apply:

| Area | Services and actions to allow |
|------|-------------------------------|
| Networking | `ec2:*Vpc*`, `ec2:*Subnet*`, `ec2:*RouteTable*`, `ec2:*InternetGateway*`, `ec2:*NatGateway*`, `ec2:*Address*`, `ec2:*SecurityGroup*` |
| Compute | `autoscaling:*`, `ec2:*LaunchTemplate*`, `ec2:Describe*`, `ec2:RunInstances` (launch template only) |
| Load balancing | `elasticloadbalancing:*` |
| Database | `rds:*` on `db:stellarkraal-*` and the subnet and parameter groups |
| Cache | `elasticache:*` on the replication group, subnet and parameter groups |
| ECS | `ecs:*` on `stellarkraal-*` clusters, services and task definitions |
| Storage and state | `s3:*` on the state bucket and `stellarkraal-*` buckets; `dynamodb:GetItem`, `PutItem`, `DeleteItem` on the lock table |
| Encryption | `kms:Create*`, `kms:Describe*`, `kms:Put*`, `kms:Get*`, `kms:List*`, `kms:Enable*`, `kms:TagResource` |
| Secrets | `secretsmanager:*` on `stellarkraal-*` secrets |
| Monitoring | `cloudwatch:*Alarm*`, `logs:*`, `sns:*` on `stellarkraal-*` topics, `events:*` for backup and alarm rules |
| Backup | `backup:*` |
| IAM | `iam:CreateRole`, `iam:DeleteRole`, `iam:GetRole`, `iam:TagRole`, `iam:Attach/DetachRolePolicy`, `iam:PutRolePolicy`, `iam:CreateInstanceProfile`, `iam:AddRoleToInstanceProfile`, `iam:PassRole` for the roles Terraform creates |

Do not grant `AdministratorAccess` to either principal in production.

---

## 6. Post-deployment smoke test

Run after the service is stable. Replace the hostnames with your production values.

```bash
API=https://api.<your-domain>
WEB=https://<your-domain>

# 1. Backend liveness and dependencies (200 = healthy; 503 = a dependency is down)
curl -fsS -o /dev/null -w "backend /health: %{http_code}\n" "$API/health"

# 2. Frontend serves the app shell
curl -fsS -o /dev/null -w "frontend /: %{http_code}\n" "$WEB/"

# 3. A paginated read returns data (exercises the database)
curl -fsS "$API/api/v1/loans?page=1&pageSize=10" | head -c 300; echo

# 4. ECS service has the expected number of running tasks
aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" \
  --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}'

# 5. ALB target health (infrastructure/ tree; the ECS service in terraform/ has no load balancer)
aws elbv2 describe-target-health --target-group-arn "<target-group-arn>" \
  --query 'TargetHealthDescriptions[].TargetHealth.State'
```

Pass criteria:

- Steps 1 and 2 return `200`.
- Step 3 returns JSON with a `data` array.
- Step 4 shows `running` equal to `desired`, and `pending` at `0`.
- Step 5 shows every target `healthy`.
- The CloudWatch alarms from `terraform/monitoring.tf` are not in `ALARM`.

If any step fails, roll back using section 3.3, step 9, and open an incident.

---

## Related

- [Environment parity](../development/environment-parity.md)
- [Environment variables](../guides/environment-variables.md)
- [Docker guide](../guides/docker.md)
- [Staging deployment](./staging-deployment.md)
- [Deployment guide (container logs)](./deployment-guide.md)
