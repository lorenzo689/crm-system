#!/usr/bin/env bash
# Shared helpers for the staging infrastructure tests (local Docker and CI).
# Everything runs against throw-away compose projects with random secrets and
# synthetic data. Nothing here talks to a tailnet or any external service.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOCKER_DIR="${ROOT}/infrastructure/docker"
WORK_ROOT="${DOCKER_DIR}/.staging-test"
STAGING_HOST="${STAGING_HOST:-staging.bissinger.test}"
TLS_PORT="${STAGING_TLS_PORT:-18443}"
PROXY_PORT="${STAGING_PROXY_PORT:-18080}"
ORIGIN="https://${STAGING_HOST}:${TLS_PORT}"
API="${ORIGIN}/api/v1"
ADMIN_EMAIL="admin@staging.test"
ADMIN_NAME="Staging Admin"

FAILURES=0
PASSES=0

pass() { PASSES=$((PASSES + 1)); printf 'PASS  %s\n' "$*"; }
failed() { FAILURES=$((FAILURES + 1)); printf 'FAIL  %s\n' "$*"; }
check() {
  # check "description" command...
  local description="$1"
  shift
  if "$@"; then pass "$description"; else failed "$description"; fi
}
summary() {
  printf '\n%s passed, %s failed\n' "$PASSES" "$FAILURES"
  [ "$FAILURES" -eq 0 ]
}

random_hex() { openssl rand -hex "${1:-24}"; }

# Writes an env file with fresh random secrets for project $1 into dir $2.
write_test_env() {
  local project="$1" dir="$2"
  mkdir -p "${dir}/backups"
  chmod 700 "$dir"
  if [ ! -f "${dir}/age-identity.txt" ]; then
    docker run --rm --entrypoint age-keygen "${BACKUP_IMAGE}" > "${dir}/age-identity.txt" 2>/dev/null
    grep -o 'age1[0-9a-z]*' "${dir}/age-identity.txt" | head -1 > "${dir}/age-recipients.txt"
  fi
  # Backups are written by the container user `postgres` (uid 70).
  chmod 777 "${dir}/backups"
  cat > "${dir}/env" <<EOF
COMPOSE_PROJECT_NAME=${project}
STAGING_ORIGIN=${ORIGIN}
STAGING_HOST=${STAGING_HOST}
STAGING_PROXY_PORT=${PROXY_PORT}
STAGING_TLS_PORT=${TLS_PORT}
POSTGRES_USER=bos_test
POSTGRES_PASSWORD=$(random_hex 24)
POSTGRES_DB=bissinger_os_staging
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
S3_BUCKET=bissinger-os-test
S3_ADMIN_ACCESS_KEY=admin$(random_hex 8)
S3_ADMIN_SECRET_KEY=$(random_hex 24)
S3_ACCESS_KEY=api$(random_hex 8)
S3_SECRET_KEY=$(random_hex 24)
S3_BACKUP_ACCESS_KEY=backup$(random_hex 8)
S3_BACKUP_SECRET_KEY=$(random_hex 24)
BACKGROUND_JOBS=maintenance
# Test login only (the account is created by the tests themselves).
TEST_ADMIN_PASSWORD=Staging!Test-$(random_hex 8)
STAGING_BACKUP_DIR=${dir}/backups
BACKUP_AGE_RECIPIENTS=${dir}/age-recipients.txt
BACKUP_INITIAL_DELAY_SECONDS=86400
API_IMAGE=${API_IMAGE}
WEB_IMAGE=${WEB_IMAGE}
MIGRATE_IMAGE=${MIGRATE_IMAGE}
BACKUP_IMAGE=${BACKUP_IMAGE}
EOF
  chmod 600 "${dir}/env"
}

# compose <env-dir> args...
compose() {
  local dir="$1"
  shift
  docker compose --env-file "${dir}/env" \
    -f "${DOCKER_DIR}/docker-compose.staging.yml" \
    -f "${DOCKER_DIR}/docker-compose.staging-test.yml" "$@"
}

env_value() { grep "^$2=" "$1/env" | head -1 | cut -d= -f2-; }

start_stack() {
  local dir="$1"
  compose "$dir" up -d --wait --wait-timeout 300
  compose "$dir" cp tls-gateway:/data/caddy/pki/authorities/local/root.crt "${dir}/ca.crt" >/dev/null
}

# HTTPS request against the test origin with full certificate verification.
# Usage: https <env-dir> curl-args...
# Windows (Git Bash) curl uses Schannel, which insists on a revocation check
# that a private test CA cannot answer; the chain is still verified.
CURL_TLS_OPTS=()
if curl --version | grep -q Schannel; then CURL_TLS_OPTS=(--ssl-no-revoke); fi

https() {
  local dir="$1"
  shift
  curl -sS "${CURL_TLS_OPTS[@]}" --resolve "${STAGING_HOST}:${TLS_PORT}:127.0.0.1" --cacert "${dir}/ca.crt" "$@"
}

json_get() {
  # json_get <field.path> < json
  node -e '
    let data = JSON.parse(require("fs").readFileSync(0, "utf8"));
    for (const key of process.argv[1].split(".")) data = data == null ? undefined : data[key];
    process.stdout.write(data == null ? "" : String(data));
  ' "$1"
}

admin_password() { env_value "$1" TEST_ADMIN_PASSWORD; }

bootstrap_admin() {
  local dir="$1"
  admin_password "$dir" | compose "$dir" exec -T api node dist/src/cli/user-admin.js bootstrap \
    --email "$ADMIN_EMAIL" --name "$ADMIN_NAME" --password-stdin
}

# login <env-dir> -> sets COOKIE (name=value) and CSRF
login() {
  local dir="$1" headers body
  headers="$(mktemp)"
  body="$(https "$dir" -D "$headers" -H "Origin: ${ORIGIN}" -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"$(admin_password "$dir")\"}" "${API}/auth/login")"
  LOGIN_SET_COOKIE="$(grep -i '^set-cookie: __Host-bissinger_session=' "$headers" | head -1 | tr -d '\r')"
  COOKIE="$(printf '%s' "$LOGIN_SET_COOKIE" | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]*).*/\1/')"
  CSRF="$(printf '%s' "$body" | json_get csrfToken)"
  rm -f "$headers"
  [ -n "$COOKIE" ] && [ -n "$CSRF" ]
}

# authed <env-dir> curl-args... (cookie + CSRF + Origin like the browser)
authed() {
  local dir="$1"
  shift
  https "$dir" -H "Cookie: ${COOKIE}" -H "X-CSRF-Token: ${CSRF}" -H "Origin: ${ORIGIN}" "$@"
}

psql_value() {
  local dir="$1" sql="$2"
  compose "$dir" exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"' sh "$sql" | tr -d '\r'
}

make_pdf() {
  # make_pdf <file> <kilobytes>: a valid PDF header followed by random bytes.
  { printf '%%PDF-1.4\n'; head -c "$(( $2 * 1024 ))" /dev/urandom; printf '\n%%%%EOF\n'; } > "$1"
}

sha256_of() { sha256sum "$1" | cut -d' ' -f1; }

# Path as the curl binary understands it (Windows curl under Git Bash needs a
# native path inside "-F file=@..."; on Linux this is a no-op).
native_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

# Absolute path INSIDE a container. Git Bash would rewrite "/opt/..." into a
# Windows path before docker sees it; a leading "//" prevents that and is a
# valid POSIX path on Linux as well.
cpath() {
  case "$(uname -s)" in MINGW*|MSYS*) printf '/%s' "$1" ;; *) printf '%s' "$1" ;; esac
}
