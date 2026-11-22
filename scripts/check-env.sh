#!/usr/bin/env bash
# scripts/check-env.sh
#
# Validates that all required environment variables are set before running
# docker compose up. Run this after copying .env.example to .env.
#
# Usage:
#   chmod +x scripts/check-env.sh
#   ./scripts/check-env.sh
#
# Exit codes:
#   0 — all required variables are present
#   1 — one or more required variables are missing or empty

set -euo pipefail

# Resolve .env relative to the repo root (the script's parent directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${REPO_ROOT}/.env"

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Colour

ok()   { echo -e "${GREEN}  ✔${NC}  $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC}  $*"; }
fail() { echo -e "${RED}  ✖${NC}  $*"; }

# ── Load .env if it exists ────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  fail ".env file not found at ${ENV_FILE}"
  echo
  echo "  Create one with:"
  echo "    cp .env.example .env"
  echo "  Then edit .env and fill in the required values."
  exit 1
fi

# Source only lines of the form KEY=VALUE (skip comments and blank lines)
# shellcheck disable=SC1090
set -o allexport
# Strip inline comments and export each assignment
while IFS= read -r line; do
  # Skip blank lines and comment lines
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  # Only process lines that look like KEY=VALUE
  if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
    # Strip trailing inline comment  (# …)
    clean="${line%%#*}"
    clean="${clean%"${clean##*[![:space:]]}"}" # rtrim
    export "${clean?}" 2>/dev/null || true
  fi
done < "$ENV_FILE"
set +o allexport

# ── Required variables ────────────────────────────────────────────────────────
# Format: "VARIABLE_NAME|human-readable description"
REQUIRED_VARS=(
  "NEXT_PUBLIC_NETWORK|Stellar network (testnet or mainnet)"
  "RPC_URL|Soroban JSON-RPC endpoint URL"
  "CONTRACT_ID|Deployed Soroban contract address"
  "NEXT_PUBLIC_API_URL|Backend API base URL visible from the browser"
  "NEXT_PUBLIC_RPC_URL|Public Soroban RPC URL for browser-side SDK calls"
  "JWT_SECRET|Secret used to sign JWT access tokens (min 32 chars)"
)

# ── Optional but security-sensitive variables ─────────────────────────────────
SENSITIVE_VARS=(
  "GF_SECURITY_ADMIN_PASSWORD|Grafana admin password (should not be default)"
)

# ── Port conflict check ───────────────────────────────────────────────────────
PORTS=(3000 3001 5432 6379)

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  StellarKraal — environment pre-flight check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

ERRORS=0

# ── 1. Required variables ─────────────────────────────────────────────────────
echo "Required variables:"
for entry in "${REQUIRED_VARS[@]}"; do
  var="${entry%%|*}"
  desc="${entry##*|}"
  value="${!var:-}"
  if [[ -z "$value" ]]; then
    fail "${var}  — missing  (${desc})"
    ERRORS=$((ERRORS + 1))
  else
    ok "${var}"
  fi
done

echo

# ── 2. Security warnings ──────────────────────────────────────────────────────
echo "Security checks:"
for entry in "${SENSITIVE_VARS[@]}"; do
  var="${entry%%|*}"
  desc="${entry##*|}"
  value="${!var:-}"
  case "$var" in
    GF_SECURITY_ADMIN_PASSWORD)
      if [[ -z "$value" || "$value" == "change-me-grafana-password" || "$value" == "admin" ]]; then
        warn "${var}  — using an insecure default  (${desc})"
      else
        ok "${var}"
      fi
      ;;
    *)
      if [[ -z "$value" ]]; then
        warn "${var}  — not set  (${desc})"
      else
        ok "${var}"
      fi
      ;;
  esac
done

# JWT_SECRET length check
JWT_SECRET_VAL="${JWT_SECRET:-}"
if [[ -n "$JWT_SECRET_VAL" ]]; then
  if [[ ${#JWT_SECRET_VAL} -lt 32 ]]; then
    warn "JWT_SECRET is set but shorter than 32 characters — use a stronger secret in production"
  else
    ok "JWT_SECRET length (${#JWT_SECRET_VAL} chars)"
  fi
fi

echo

# ── 3. Port availability ──────────────────────────────────────────────────────
echo "Port availability:"
for port in "${PORTS[@]}"; do
  if command -v lsof &>/dev/null; then
    if lsof -iTCP:"$port" -sTCP:LISTEN -t &>/dev/null 2>&1; then
      warn "Port ${port} is already in use — stop the conflicting process or change the port in .env"
    else
      ok "Port ${port} is free"
    fi
  elif command -v ss &>/dev/null; then
    if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
      warn "Port ${port} is already in use"
    else
      ok "Port ${port} is free"
    fi
  else
    warn "Cannot check port ${port} — install lsof or iproute2"
  fi
done

echo

# ── Summary ───────────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ $ERRORS -gt 0 ]]; then
  fail "Pre-flight failed: ${ERRORS} required variable(s) missing."
  echo
  echo "  Edit .env and set the missing variables, then re-run:"
  echo "    ./scripts/check-env.sh"
  echo
  echo "  For the full variable reference, see:"
  echo "    docs/guides/environment-variables.md"
  exit 1
else
  ok "All required variables are set. You are ready to run:"
  echo
  echo "    docker compose up --build"
  echo
fi
