# ECS Fargate Resource Review Runbook

Review ECS task CPU and memory allocations quarterly to avoid OOM-killed containers or
unnecessary spend from over-provisioning.

## Cadence

Perform this review at the start of each quarter (January, April, July, October). The
Infrastructure owner schedules it in the quarterly ops calendar.

## Step 1 — Pull utilisation data from Container Insights

Container Insights is enabled on the `stellarkraal-cluster-<env>` ECS cluster. Open the
CloudWatch console → **Container Insights** → **ECS Clusters** → select the cluster → switch
to the **Tasks** view.

For the `backend` and `frontend` task families, record the following for the past 90 days:

| Metric | Threshold to watch |
|---|---|
| `CpuUtilized` p99 | > 80 % of allocated CPU units |
| `MemoryUtilized` p99 | > 80 % of allocated memory |
| `CpuReserved` | Consistently < 30 % — may be over-provisioned |
| `MemoryReserved` | Consistently < 30 % — may be over-provisioned |

You can query these metrics directly with the AWS CLI:

```bash
aws cloudwatch get-metric-statistics \
  --namespace ECS/ContainerInsights \
  --metric-name CpuUtilized \
  --dimensions Name=ClusterName,Value=stellarkraal-cluster-production \
               Name=TaskDefinitionFamily,Value=stellarkraal-backend-production \
  --start-time "$(date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --period 86400 \
  --statistics p99 Average Maximum
```

## Step 2 — Decide whether to change allocations

Apply these rules when interpreting the data:

- **Scale up** if p99 utilisation for either metric exceeds 80 % of the current allocation.
  Increase by one Fargate size step (e.g. 512 → 1024 CPU units, 1024 → 2048 MB memory).
- **Scale down** if average utilisation is consistently below 30 % of the allocation for the
  entire 90-day window. Decrease by one step, but do not go below the minimums:
  - Backend: 512 CPU units, 1024 MB memory.
  - Frontend: 256 CPU units, 512 MB memory.
- **No change** if utilisation falls between 30 % and 80 %.

## Step 3 — Update Terraform variables

Edit `terraform/variables.tf` to change the defaults, or override them in the per-environment
`terraform/envs/<env>/terraform.tfvars` file:

```hcl
# Example: scale backend up after sustained high utilisation
backend_task_cpu    = 1024
backend_task_memory = 2048
```

Valid Fargate CPU/memory pairings are documented in the
[AWS Fargate task size table](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html).

## Step 4 — Apply and verify

```bash
cd terraform
terraform plan -var-file=envs/production/terraform.tfvars
# Review the plan output — only the task definition should change.
terraform apply -var-file=envs/production/terraform.tfvars
```

After the new task definition is registered, force a service redeployment:

```bash
aws ecs update-service \
  --cluster stellarkraal-cluster-production \
  --service stellarkraal-service-production \
  --force-new-deployment
```

Monitor the service's **Events** tab in the ECS console to confirm the new tasks start
successfully. Check the CloudWatch memory and CPU alarms in the first 24 hours to confirm no
regressions.

## Step 5 — Document the outcome

Add a row to the table below each time a review is completed.

| Date | Reviewer | Backend CPU | Backend Mem | Frontend CPU | Frontend Mem | Reason |
|---|---|---|---|---|---|---|
| 2026-Q4 | infrastructure | 512 | 1024 | 256 | 512 | Initial right-sizing from issue #1497 |

## Related

- `terraform/compute.tf` — task definition resources.
- `terraform/variables.tf` — `backend_task_cpu`, `backend_task_memory`, `frontend_task_cpu`,
  `frontend_task_memory` variables.
- [CloudWatch Container Insights for ECS](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html)
