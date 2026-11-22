# Staging Environment Documentation

This document provides information about the StellarKraal staging environment.

> **Deployment how-to:** Step-by-step staging deploy, secrets, rollback, and verification are documented in **[docs/deployment/staging-deployment.md](docs/deployment/staging-deployment.md)**.

## Overview

The staging environment is a mirror of the production environment used for final testing and validation before deployment to production.

## Access Information

- **Staging URL:** `https://staging.stellarkraal.com` (Example)
- **Backend API:** `https://api-staging.stellarkraal.com` (Example)

## Creating the Staging GitHub Actions Environment

The staging deployment workflow targets a GitHub Actions environment named `staging`. Create it once per repository:

1. Open the repository on GitHub and go to **Settings → Environments**.
2. Click **New environment**, enter `staging` as the name, and click **Configure environment**.
3. Under **Deployment protection rules**, enable **Required reviewers** and add the team members (or the `@StellarKraal/release-managers` team) who must approve staging deploys.
4. Optionally enable **Wait timer** (e.g. 5 minutes) to allow cancellation of accidental deploys.
5. Under **Environment secrets**, add every secret listed in the rotation table below (use the **Add secret** button for each).
6. Under **Environment variables**, add the non-sensitive values used by the workflow (e.g. `ALLOWED_IPS`, `AWS_REGION`, `STAGING_URL`).
7. Click **Save protection rules**.

> Environment secrets are only exposed to jobs that declare `environment: staging`, which keeps them isolated from other workflows.

## Secret Rotation

All staging secrets live in **Settings → Environments → staging → Environment secrets**. To rotate a secret, click **Update** next to it, paste the new value, and save. Then re-run the staging deployment workflow so running tasks pick up the new value.

| Secret | How to rotate | Impact on the running system |
| --- | --- | --- |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Create a new IAM access key for the deploy user, update both secrets, then delete the old key in IAM. | In-flight deployments using the old key fail; no impact on running ECS tasks. |
| `AWS_ROLE_ARN` | Update the Terraform/CI role trust policy, then update the secret. | Next deployment assumes the new role; running services are unaffected. |
| `DATABASE_URL` | Rotate the RDS credentials, update the secret, and redeploy. | Backend tasks briefly fail DB connections until the new task definition is rolled out. |
| `JWT_SECRET` | Generate a new random value, update the secret, and redeploy. | All existing user sessions are invalidated; users must log in again. |
| `STELLAR_SECRET_KEY` | Create a new Stellar testnet keypair, fund it via Friendbot, update the secret, and redeploy. | Contract interactions signed with the old key fail until redeploy completes. |
| `SLACK_WEBHOOK_URL` | Create a new webhook in Slack, update the secret. | Only affects deployment notifications; no runtime impact. |
| `SENTRY_DSN` | Create a new project DSN in Sentry, update the secret, and redeploy. | Errors emitted before redeploy go to the old project. |

## Staging Deployment Verification Checklist

Run through this checklist after every staging deployment:

- [ ] **Health checks** — `curl -f https://api-staging.stellarkraal.com/health` returns `200` with `{"status":"ok"}`.
- [ ] **Smoke tests** — run `npm run test:smoke` against the staging URL; all tests pass.
- [ ] **Automated verification** — run `npx ts-node scripts/verify-deployment.ts --env staging`; the script checks health endpoints, contract connectivity, and reports a summary.
- [ ] **Stellar testnet** — confirm the deployed contract IDs resolve on testnet via [Stellar Expert (testnet)](https://stellar.expert/explorer/testnet) and that a sample transaction succeeds.
- [ ] **Logs** — no error-level entries in CloudWatch since the deployment started.
- [ ] **Notifications** — the Slack deployment notification reports success.

## Staging vs. Production Configuration

| Setting | Staging | Production |
| --- | --- | --- |
| Stellar network | Testnet | Mainnet (Public) |
| Stellar RPC / Horizon endpoint | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` |
| Soroban RPC endpoint | `https://soroban-testnet.stellar.org` | `https://soroban.stellar.org` |
| Instance size | Smaller (e.g. `t3.small`) | Larger (e.g. `t3.large` or bigger) |
| Multi-AZ | Single AZ | Multi-AZ across at least two AZs |
| Deletion protection | Disabled | Enabled on RDS and load balancer |
| Data | Anonymized copy of production | Live data |
| Access | IP allowlist restricted | Public |
=======

## Security & IP Allowlist

Access to the staging environment is restricted to the team via an IP Allowlist at the Load Balancer level.

### Current Allowed IPs
The list of allowed IPs is managed via GitHub Actions variables (`ALLOWED_IPS`). To add your IP:
1. Update the `ALLOWED_IPS` variable in GitHub Repository Settings.
2. The next deployment to staging will apply the new allowlist.

## CI/CD Pipeline

The staging environment is automatically updated whenever code is merged into the `develop` branch.
The pipeline follows these steps:
1. **Linting & Unit Tests**: All tests must pass.
2. **Infrastructure Provisioning**: Terraform applies changes to the `staging` workspace.
3. **Deployment**: The latest application code is deployed to ECS Staging.
4. **Notification**: A Slack notification is sent upon success/failure.

## Data Synchronization

The staging database is synchronized with production every Sunday at midnight.
- **PII Masking**: During synchronization, all Personally Identifiable Information (PII) is anonymized.
- **Masking Logic**: Refer to `scripts/mask-pii.sql` for the specific masking rules.

## Terraform Management

The staging infrastructure is managed using Terraform Workspaces.
To manage staging infrastructure locally:
```bash
cd terraform
terraform init
terraform workspace select staging
terraform plan -var="environment=staging"
```

> **Note:** The staging workspace uses the testnet RPC endpoints and reduced instance sizes shown in the comparison table above; never point staging at mainnet endpoints.
