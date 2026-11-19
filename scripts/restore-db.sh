#!/usr/bin/env bash
#
# restore-db.sh - Restore a PostgreSQL dump from S3 to a target database.
#
# Part of issue #1473: Document and automate database backup and restore procedures.
#
# Usage:
#   restore-db.sh <s3-dump-uri> [target-database-url]
#
# Arguments:
#   <s3-dump-uri>          S3 URI of the dump, e.g. s3://my-bucket/backups/db.dump
#                          Supported formats:
#                            - custom-format dumps (.dump, .backup, .tar) -> pg_restore
#                            - plain SQL dumps (.sql)                     -> psql
#   [target-database-url]  PostgreSQL connection URL to restore into.
#                          Defaults to the DATABASE_URL environment variable.
#
# Environment:
#   DATABASE_URL           Target PostgreSQL connection URL (if not passed as arg).
#   AWS_REGION             Optional AWS region for the S3 download.
#   AWS_PROFILE            Optional AWS profile for the S3 download.
#   RESTORE_WORK_DIR      Optional working directory for the temporary download.
#                          Defaults to a mktemp -d directory.
#   KEEP_DUMP              If set to "1", keep the downloaded dump file on exit.
#
# Exit codes:
#   0  Restore completed successfully.
#   1  Invalid usage or missing arguments.
#   2  Missing required tooling (aws, pg_restore/psql, psql for validation).
#   3  Failed to download the dump from S3.
#   4  Failed to validate connectivity to the target database.
#   5  Restore failed.
#
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} <s3-dump-uri> [target-database-url]

Restore a PostgreSQL dump from S3 to a target database.

Arguments:
  <s3-dump-uri>          S3 URI of the dump (e.g. s3://bucket/path/db.dump).
                         Custom-format dumps (.dump, .backup, .tar) are restored
                         with pg_restore; plain SQL dumps (.sql) with psql.
  [target-database-url]  PostgreSQL connection URL to restore into.
                         Defaults to the DATABASE_URL environment variable.

Environment:
  DATABASE_URL           Target PostgreSQL connection URL (if not passed as arg).
  AWS_REGION             Optional AWS region for the S3 download.
  AWS_PROFILE            Optional AWS profile for the S3 download.
  RESTORE_WORK_DIR      Optional working directory for the temporary download.
  KEEP_DUMP              Set to "1" to keep the downloaded dump file on exit.

Examples:
  ${SCRIPT_NAME} s3://my-bucket/backups/prod-2024-01-01.dump
  ${SCRIPT_NAME} s3://my-bucket/backups/prod-2024-01-01.sql postgres://user:pass@host:5432/db

Exit codes:
  0 success, 1 usage error, 2 missing tooling, 3 download failure,
  4 connectivity failure, 5 restore failure.
EOF
}

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

die() {
  local code="$1"
  shift
  log "ERROR: $*"
  exit "${code}"
}

# --- Argument parsing -------------------------------------------------------

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

S3_URI="$1"
TARGET_DB_URL="${2:-${DATABASE_URL:-}}"

if [[ -z "${S3_URI}" ]]; then
  usage
  die 1 "missing S3 dump URI"
fi

if [[ "${S3_URI}" != s3://* ]]; then
  die 1 "S3 dump URI must start with s3:// (got: ${S3_URI})"
fi

if [[ -z "${TARGET_DB_URL}" ]]; then
  die 1 "no target database URL provided (pass as argument or set DATABASE_URL)"
fi

# --- Tooling checks ---------------------------------------------------------

command -v aws >/dev/null 2>&1 || die 2 "'aws' CLI not found in PATH"
command -v psql >/dev/null 2>&1 || die 2 "'psql' not found in PATH"

# --- Determine dump format --------------------------------------------------

DUMP_BASENAME="$(basename "${S3_URI}")"
DUMP_EXT="${DUMP_BASENAME##*.}"
DUMP_EXT_LOWER="$(printf '%s' "${DUMP_EXT}" | tr '[:upper:]' '[:lower:]')"

case "${DUMP_EXT_LOWER}" in
  sql)
    RESTORE_FORMAT="plain"
    ;;
  dump|backup|tar)
    RESTORE_FORMAT="custom"
    ;;
  *)
    # Default to custom format; pg_restore can usually detect the format.
    log "WARNING: unrecognized dump extension '${DUMP_EXT}', assuming custom format"
    RESTORE_FORMAT="custom"
    ;;
esac

if [[ "${RESTORE_FORMAT}" == "custom" ]]; then
  command -v pg_restore >/dev/null 2>&1 || die 2 "'pg_restore' not found in PATH (required for custom-format dumps)"
fi

# --- Prepare working directory ---------------------------------------------

if [[ -n "${RESTORE_WORK_DIR:-}" ]]; then
  mkdir -p "${RESTORE_WORK_DIR}"
  WORK_DIR="${RESTORE_WORK_DIR}"
  CLEANUP_WORK_DIR=0
else
  WORK_DIR="$(mktemp -d)"
  CLEANUP_WORK_DIR=1
fi

DUMP_PATH="${WORK_DIR}/${DUMP_BASENAME}"

cleanup() {
  if [[ "${KEEP_DUMP:-0}" != "1" && -f "${DUMP_PATH}" ]]; then
    rm -f "${DUMP_PATH}"
  fi
  if [[ "${CLEANUP_WORK_DIR}" == "1" && -d "${WORK_DIR}" ]]; then
    rm -rf "${WORK_DIR}"
  fi
}
trap cleanup EXIT

# --- Download dump from S3 --------------------------------------------------

AWS_ARGS=()
if [[ -n "${AWS_REGION:-}" ]]; then
  AWS_ARGS+=(--region "${AWS_REGION}")
fi
if [[ -n "${AWS_PROFILE:-}" ]]; then
  AWS_ARGS+=(--profile "${AWS_PROFILE}")
fi

log "Downloading dump from ${S3_URI} to ${DUMP_PATH}"
if ! aws "${AWS_ARGS[@]}" s3 cp "${S3_URI}" "${DUMP_PATH}"; then
  die 3 "failed to download dump from ${S3_URI}"
fi

if [[ ! -s "${DUMP_PATH}" ]]; then
  die 3 "downloaded dump is empty or missing: ${DUMP_PATH}"
fi

log "Downloaded $(wc -c < "${DUMP_PATH}" | tr -d ' ') bytes"

# --- Validate connectivity to target database ------------------------------

log "Validating connectivity to target database"
if ! psql "${TARGET_DB_URL}" -v ON_ERROR_STOP=1 -tAc "SELECT 1;" >/dev/null; then
  die 4 "could not connect to target database"
fi

# --- Restore -----------------------------------------------------------------

log "Restoring (${RESTORE_FORMAT} format) into target database"

if [[ "${RESTORE_FORMAT}" == "custom" ]]; then
  # --clean drops objects before recreating them; --no-owner and
  # --no-privileges avoid failures when roles/owners differ in the target.
  if ! pg_restore \
      --clean \
      --if-exists \
      --no-owner \
      --no-privileges \
      --dbname="${TARGET_DB_URL}" \
      "${DUMP_PATH}"; then
    die 5 "pg_restore failed"
  fi
else
  # Plain SQL: run through psql. Use ON_ERROR_STOP so failures are surfaced.
  if ! psql "${TARGET_DB_URL}" -v ON_ERROR_STOP=1 -f "${DUMP_PATH}"; then
    die 5 "psql restore failed"
  fi
fi

# --- Post-restore validation ------------------------------------------------

log "Validating restored database"
if ! psql "${TARGET_DB_URL}" -v ON_ERROR_STOP=1 -tAc "SELECT 1;" >/dev/null; then
  die 5 "post-restore validation failed"
fi

log "Restore completed successfully"
exit 0