# Database Restore Runbook

This runbook documents the full procedure for restoring a PostgreSQL database from an S3 or RDS backup. It is the operational companion to issue #1473, which automates and periodically tests restore procedures.

- **Automation:** `scripts/restore-db.sh`
- **Backup infrastructure:** `terraform/backup.tf` (backup vault and backup plan)
- **Monthly restore test:** `.github/workflows/restore-test.yml` (scheduled GitHub Actions workflow)

---

## 1. Overview

Backups are produced by the AWS Backup plan defined in `terraform/backup.tf` and stored in the backup vault configured there. PostgreSQL logical dumps are also written to S3. This runbook covers restoring a PostgreSQL dump from S3 into a target database using `scripts/restore-db.sh`, verifying the restore, and rolling back if needed.

> **During an incident:** follow the steps in order. Do not skip verification. If any step fails, stop and escalate (see [Escalation](#8-escalation-contacts)).

---

## 2. Recovery Objectives

| Objective | Target | Notes |
|-----------|--------|-------|
| **RTO** (Recovery Time Objective) | 2 hours | Time from incident declaration to restored, verified database serving traffic. |
| **RPO** (Recovery Point Objective) | 24 hours | Maximum acceptable data loss. Backups run daily; point-in-time recovery (PITR) via RDS reduces this to minutes where enabled. |

These targets are validated by the monthly automated restore test. If a test run exceeds RTO, treat it as a failure and investigate.

---

## 3. Prerequisites

Before starting a restore, confirm the following:

### 3.1 AWS credentials and access
- Valid AWS credentials with permission to read from the backup S3 bucket and the backup vault defined in `terraform/backup.tf`.
- Confirm identity and region:
  ```bash
  aws sts get-caller-identity
  aws configure get region
  ```

### 3.2 Tooling
- **AWS CLI** v2 installed and configured.
- **PostgreSQL client tools** matching (or newer than) the source database major version. `pg_restore` must be compatible with the dump format:
  ```bash
  pg_restore --version
  psql --version
  ```
  > A `pg_restore` older than the server that produced the dump will fail. Match the major version.

### 3.3 Target database
- A target PostgreSQL instance/database exists and is reachable.
- You have superuser (or sufficient) privileges on the target to create roles, extensions, and objects.
- The target is **not** the production primary unless you are performing an in-place recovery (see [Rollback](#7-rollback)).
- Connection details are available (host, port, database name, user, password).

### 3.4 Locate the backup
- Identify the dump object in S3. List recent backups:
  ```bash
  aws s3 ls s3://<backup-bucket>/<prefix>/ --recursive | sort | tail -n 20
  ```
- Note the exact S3 URI of the dump you intend to restore, e.g. `s3://<backup-bucket>/<prefix>/db-YYYY-MM-DD.dump`.
- For RDS automated backups / snapshots, see the RDS section in `terraform/backup.tf` and use the RDS console or `aws rds restore-db-instance-from-db-snapshot` as an alternative path.

---

## 4. Restore Procedure

### Step 1 — Announce and freeze writes
Notify the team in the incident channel that a restore is starting. If restoring over a live database, stop application writes / put the app in maintenance mode to prevent conflicting writes.

### Step 2 — (Optional) Snapshot the current target
Before overwriting anything, take a safety snapshot of the current target so you can roll back:
```bash
pg_dump -Fc -h <target-host> -U <user> -d <target-db> -f pre-restore-$(date +%Y%m%d%H%M%S).dump
```

### Step 3 — Run the restore script
Use `scripts/restore-db.sh` to download the dump from S3 and restore it into the target database:
```bash
./scripts/restore-db.sh \
  --s3-uri s3://<backup-bucket>/<prefix>/db-YYYY-MM-DD.dump \
  --target-host <target-host> \
  --target-port 5432 \
  --target-db <target-db> \
  --target-user <user>
```
The script will:
1. Download the dump from S3 to a temporary location.
2. Verify the object exists and is non-empty.
3. Run `pg_restore` against the target database.
4. Report success/failure with a non-zero exit code on failure.

> Provide the target password via `PGPASSWORD` environment variable or a `.pgpass` file — never on the command line.

### Step 4 — Review script output
Confirm the script exits `0`. Review any `pg_restore` warnings. Warnings about already-existing objects are expected when restoring into a non-empty database; errors are not.

---

## 5. Verification

Run these checks against the target database before declaring the restore complete.

### 5.1 Connectivity and basic sanity
```bash
psql -h <target-host> -U <user> -d <target-db> -c "SELECT version();"
psql -h <target-host> -U <user> -d <target-db> -c "\dt"
```

### 5.2 Row counts on key tables
Compare against expected values (from the source or the last known-good metrics):
```sql
SELECT relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 20;
```

### 5.3 Recent data check
Confirm the most recent records are present and timestamps are within the expected RPO window:
```sql
SELECT max(created_at) FROM <key_table>;
```

### 5.4 Integrity checks
```sql
-- Check for invalid indexes
SELECT indexrelid::regclass
FROM pg_index
WHERE NOT indisvalid;

-- Check for unlogged/failed constraints (if applicable)
SELECT conname, conrelid::regclass
FROM pg_constraint
WHERE NOT convalidated;
```

### 5.5 Application smoke test
Point a staging application instance at the restored database and exercise the critical read paths. Confirm expected responses.

Record the restore start time, completion time, and total duration. Compare against the RTO target (2 hours).

---

## 6. Post-Restore

- Re-enable application writes / take the app out of maintenance mode.
- Update DNS or connection strings if the restore targeted a new instance.
- Confirm monitoring and alerting are green.
- Document the incident: backup used, restore duration, any issues encountered.
- File a follow-up if the restore exceeded RTO/RPO or revealed gaps.

---

## 7. Rollback

If the restore is incorrect or causes problems:

1. **If you snapshotted the target (Step 2):** restore the pre-restore dump:
   ```bash
   pg_restore -h <target-host> -U <user> -d <target-db> --clean --if-exists pre-restore-<timestamp>.dump
   ```
2. **If restoring to a new instance:** simply repoint the application back to the original instance and decommission the new one.
3. **If restoring in place without a snapshot:** restore from the most recent known-good backup following this same procedure.
4. Re-enable traffic only after verification (Section 5) passes.

---

## 8. Escalation Contacts

| Role | Contact | When to escalate |
|------|---------|------------------|
| On-call Engineer | PagerDuty / `#oncall` | Immediately on any restore failure |
| Database Owner | `#database-team` | Restore errors, version mismatches, data integrity concerns |
| Platform / Infrastructure | `#platform-team` | AWS access, backup vault, or S3 issues |
| Engineering Manager | See team roster | RTO breach or data loss confirmed |

> Keep this table current. Update it whenever ownership changes.

---

## 9. Automated Restore Testing

The restore procedure is validated automatically:

- **On every backup workflow run:** the backup workflow runs `scripts/restore-db.sh` against a throwaway test database in CI to confirm the dump is restorable.
- **Monthly scheduled test:** `.github/workflows/restore-test.yml` runs on a monthly schedule, performs a full restore into a test database, runs the verification queries in Section 5, and **alerts on failure** (via the configured notification channel).

If the monthly test fails, treat it as a production-readiness defect: investigate immediately, since it indicates the documented recovery procedure may not work during a real incident.

### Backup infrastructure reference
The backup vault, backup plan, and retention rules are defined in `terraform/backup.tf`. Changes to backup frequency or retention must be reflected in the RPO targets in Section 2 and in the CI test expectations.

---

## 10. Quick Reference

```bash
# List recent backups
aws s3 ls s3://<backup-bucket>/<prefix>/ --recursive | sort | tail -n 20

# Restore
./scripts/restore-db.sh --s3-uri s3://<bucket>/<key> \
  --target-host <host> --target-db <db> --target-user <user>

# Verify
psql -h <host> -U <user> -d <db> -c "SELECT max(created_at) FROM <key_table>;"