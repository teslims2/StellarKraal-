# Runbook: ECS One-Click Rollback

> **Closes #1456** — Use this runbook when a deployment introduces a regression
> and the ECS service must be reverted to the last known-good state.

---

## When to use this runbook

Trigger a rollback when **all** of the following are true:

- A recent deployment is the confirmed source of elevated error rates, crashes,
  or broken core flows.
- A forward fix is not ready within your SLA.
- Rolling back is safe (no breaking database migrations have been applied).

---

## One-click rollback via GitHub Actions (preferred)

The `rollback.yml` workflow handles the full lifecycle:

1. Posts a "rollback started" event to `#deployments` in Slack.
2. Reverts the ECS service to the target task-definition.
3. Waits for service stability.
4. Posts the outcome (success or failure) with the deployed revision to Slack.

### Steps

1. Open **Actions → ECS Rollback** in this repository.
2. Click **Run workflow** (top-right of the workflow run list).
3. Fill in the inputs:

   | Input | Required | Description |
   |---|---|---|
   | `image_tag` | No | ECR tag of the known-good image (e.g. `a1b2c3d`). Leave blank to auto-revert to the previous ECS task-definition revision. |
   | `reason` | No | Short description logged to Slack (e.g. `"P1 bug in payment flow"`). |

4. Click **Run workflow** to start.
5. Monitor progress in the workflow run log. The run will not finish until ECS
   confirms stability (`aws ecs wait services-stable`).
6. Verify the Slack `#deployments` channel shows a ✅ success message with the
   deployed revision ARN.

> **Tip:** If you do not know the previous image tag, leave `image_tag` blank.
> The workflow will automatically resolve the second-most-recent *active*
> task-definition revision and deploy it.

---

## Required secrets

| Secret | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM key with `ecs:UpdateService`, `ecs:DescribeServices`, `ecs:ListTaskDefinitions`, `ecs:DescribeTaskDefinition`, and `ecr:GetAuthorizationToken` permissions |
| `AWS_SECRET_ACCESS_KEY` | Corresponding IAM secret |
| `AWS_REGION` | AWS region (e.g. `us-east-1`) |
| `ECS_CLUSTER` | ECS cluster name |
| `ECS_SERVICE` | ECS service name |
| `ECS_TASK_DEFINITION` | Task-definition family name |
| `ECS_CONTAINER_NAME` | Container name inside the task definition |
| `ECR_REGISTRY` | ECR registry host (e.g. `123456789.dkr.ecr.us-east-1.amazonaws.com`) |
| `ECR_REPOSITORY` | ECR repository name |
| `SLACK_WEBHOOK_URL` | Incoming webhook URL for `#deployments` (optional but strongly recommended) |

---

## Manual rollback (fallback)

Use this only if the GitHub Actions workflow itself is unavailable.

### Identify the target revision

```bash
# List the five most-recent active revisions for the task-definition family
aws ecs list-task-definitions \
  --family-prefix <ECS_TASK_DEFINITION> \
  --status ACTIVE \
  --sort DESC \
  --query 'taskDefinitionArns[:5]' \
  --output table
```

The second entry in the list is typically the previous stable revision.

### Update the service

```bash
aws ecs update-service \
  --cluster <ECS_CLUSTER> \
  --service <ECS_SERVICE> \
  --task-definition <PREVIOUS_TASK_DEF_ARN> \
  --force-new-deployment

# Wait for stability (blocks until healthy or times out after ~10 min)
aws ecs wait services-stable \
  --cluster <ECS_CLUSTER> \
  --services <ECS_SERVICE>
```

### Verify

```bash
aws ecs describe-services \
  --cluster <ECS_CLUSTER> \
  --services <ECS_SERVICE> \
  --query 'services[0].{running:runningCount,desired:desiredCount,taskDef:taskDefinition}'
```

Confirm `running == desired` and the `taskDef` ARN matches the target revision.

---

## Post-rollback actions

1. **Confirm stability** — verify error rates return to baseline in Grafana
   (dashboard: *StellarKraal — Loan Service*).
2. **Notify stakeholders** — post a brief update in `#incidents` with the
   deployed revision and an estimated timeline for the forward fix.
3. **Prevent re-deployment** — open a PR that reverts or fixes the offending
   commit on `main` before the next deploy runs.
4. **Write a post-mortem** — document root cause, timeline, and follow-up
   actions within 48 hours of the incident.

---

## Escalation

| Condition | Escalate to |
|---|---|
| Rollback fails to stabilise within 15 minutes | On-call engineering lead |
| Data corruption suspected during the bad deployment | Engineering Manager + Lead DBA |
| Smart-contract state needs reverting | Protocol team (contracts cannot be rolled back; a new upgrade transaction deploying the previous WASM is required — see [contract invocation failure runbook](./contract-invocation-failure.md)) |

---

## Related runbooks

- [High error rate](./high-error-rate.md)
- [Database restore](./database-restore.md)
- [Contract invocation failure](./contract-invocation-failure.md)
- [On-call rotation](./on-call.md)
