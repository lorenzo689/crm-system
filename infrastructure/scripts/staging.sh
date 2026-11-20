#!/usr/bin/env bash
# Operations for the private staging stack (run on the staging host).
#
#   staging.sh init <https-origin>     create .env.staging with random secrets
#   staging.sh validate                check configuration and compose file
#   staging.sh build                   build all images (tags :staging and :<git-sha>)
#   staging.sh up                      start/upgrade the stack and wait for health
#   staging.sh migrate                 run prisma migrate deploy (after a fresh backup)
#   staging.sh bootstrap-admin <email> <name>   create the first owner (password prompt)
#   staging.sh health                  readiness through the proxy + container states
#   staging.sh backup                  create an encrypted backup now
#   staging.sh restore <file> <age-identity>    DESTRUCTIVE: replace data with a backup
#   staging.sh update                  backup -> build -> migrate -> up (keeps volumes)
#   staging.sh rollback                start the previous image set (see docs for DB)
#   staging.sh diagnose                status, health, backups, jobs, recent errors
#   staging.sh monitor                 non-zero exit + message if something is wrong
#
# Never deletes volumes except in `restore`, which asks for confirmation.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER_DIR="${ROOT}/infrastructure/docker"
ENV_FILE="${STAGING_ENV_FILE:-${DOCKER_DIR}/.env.staging}"
COMPOSE_FILE="${DOCKER_DIR}/docker-compose.staging.yml"

log() { printf '%s staging %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "error: $*"; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
env_value() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }
project() { env_value COMPOSE_PROJECT_NAME || echo bissinger-staging; }

# Runs SQL read from the argument via stdin (no shell quoting of SQL).
sql() { compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA' <<< "$1" | tr -d '\r'; }

proxy_url() { printf 'http://127.0.0.1:%s' "$(env_value STAGING_PROXY_PORT || echo 8080)"; }

cmd_init() {
  local origin="${1:-}"
  [ -n "$origin" ] || die "usage: staging.sh init https://<host>.<tailnet>.ts.net"
  [ ! -f "$ENV_FILE" ] || die "$ENV_FILE exists; edit it instead of overwriting"
  case "$origin" in https://*) ;; *) die "origin must start with https://" ;; esac
  umask 077
  local hex
  hex() { openssl rand -hex "$1"; }
  sed \
    -e "s#^STAGING_ORIGIN=.*#STAGING_ORIGIN=${origin}#" \
    -e "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=$(hex 32)#" \
    -e "s#^JWT_SECRET=.*#JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n/+=')#" \
    -e "s#^S3_ADMIN_ACCESS_KEY=.*#S3_ADMIN_ACCESS_KEY=admin$(hex 8)#" \
    -e "s#^S3_ADMIN_SECRET_KEY=.*#S3_ADMIN_SECRET_KEY=$(hex 32)#" \
    -e "s#^S3_ACCESS_KEY=.*#S3_ACCESS_KEY=api$(hex 8)#" \
    -e "s#^S3_SECRET_KEY=.*#S3_SECRET_KEY=$(hex 32)#" \
    -e "s#^S3_BACKUP_ACCESS_KEY=.*#S3_BACKUP_ACCESS_KEY=backup$(hex 8)#" \
    -e "s#^S3_BACKUP_SECRET_KEY=.*#S3_BACKUP_SECRET_KEY=$(hex 32)#" \
    "${DOCKER_DIR}/.env.staging.example" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log "wrote $ENV_FILE (mode 600). Next: set STAGING_BACKUP_DIR and BACKUP_AGE_RECIPIENTS, then 'staging.sh validate'."
}

cmd_validate() {
  [ -f "$ENV_FILE" ] || die "missing $ENV_FILE (staging.sh init)"
  [ "$(stat -c %a "$ENV_FILE")" = 600 ] || die "$ENV_FILE must have mode 600"
  local origin
  origin="$(env_value STAGING_ORIGIN)"
  case "$origin" in https://*.ts.net|https://*.ts.net:*) ;; https://*) log "warning: origin is not a ts.net host: $origin" ;; *) die "STAGING_ORIGIN must be https" ;; esac
  if grep -qE '^(JWT_SECRET|POSTGRES_PASSWORD|S3_[A-Z_]*KEY)=(|replace-.*)$' "$ENV_FILE"; then
    die "empty or placeholder secrets in $ENV_FILE"
  fi
  [ -r "$(env_value BACKUP_AGE_RECIPIENTS)" ] || die "BACKUP_AGE_RECIPIENTS file not readable"
  grep -q '^AGE-SECRET-KEY' "$(env_value BACKUP_AGE_RECIPIENTS)" && die "BACKUP_AGE_RECIPIENTS contains a PRIVATE key; only the public key belongs on this host"
  compose config -q
  log "configuration ok"
}

cmd_build() {
  local sha
  sha="$(git -C "$ROOT" rev-parse --short HEAD)"
  compose build
  for image in api web migrate backup; do
    docker tag "bissinger-os/${image}:staging" "bissinger-os/${image}:${sha}"
  done
  log "built images (tag staging and ${sha})"
}

wait_ready() {
  local url
  url="$(proxy_url)/api/v1/health/ready"
  for _ in $(seq 1 60); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "$url")" = 200 ]; then
      log "ready"
      return 0
    fi
    sleep 5
  done
  die "not ready after 5 minutes (staging.sh diagnose)"
}

cmd_up() {
  cmd_validate
  compose up -d --remove-orphans
  wait_ready
}

# The backup directory belongs to uid 70 (mode 0700, files 0600), so an
# unprivileged operator or monitoring user cannot read it from the host. All
# reads therefore go through the backup container, which runs as that user.
# (MSYS2_ARG_CONV_EXCL only matters for Git Bash on Windows: container paths are kept.)
backup_exec() { MSYS2_ARG_CONV_EXCL="/opt/;/backups" compose exec -T backup "$@"; }

latest_backup_age_hours() {
  local stamp
  stamp="$(backup_exec cat /backups/last-success 2>/dev/null | tr -d '\r')" || stamp=""
  [ -n "$stamp" ] || { echo 99999; return; }
  echo $(( ( $(date +%s) - $(date -d "$stamp" +%s) ) / 3600 ))
}

cmd_backup() {
  backup_exec /opt/backup/backup.sh
}

cmd_migrate() {
  # A fresh, successful backup is mandatory before schema changes.
  if [ "$(latest_backup_age_hours)" -ge 1 ]; then
    log "creating a backup before migrating"
    cmd_backup
  fi
  compose run --rm migrate
}

cmd_bootstrap_admin() {
  [ $# -eq 2 ] || die "usage: staging.sh bootstrap-admin <email> <name>"
  # Interactive: the password is prompted without echo inside the container.
  compose exec api node dist/src/cli/user-admin.js bootstrap --email "$1" --name "$2"
}

cmd_health() {
  compose ps --format 'table {{.Service}}\t{{.Status}}'
  curl -s "$(proxy_url)/api/v1/health/ready"; echo
}

cmd_restore() {
  [ $# -eq 2 ] || die "usage: staging.sh restore <backup.tar.age> <age-identity-file>"
  local file identity dir
  file="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
  identity="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
  [ -f "$file" ] && [ -f "$identity" ] || die "file not found"
  echo "This DELETES the current staging database and documents of project '$(project)'."
  read -r -p "Type the project name to continue: " answer
  [ "$answer" = "$(project)" ] || die "aborted"
  compose stop proxy web api backup
  compose rm -f -s postgres seaweedfs
  docker volume rm "$(project)_pgdata" "$(project)_objects"
  compose up -d --wait postgres seaweedfs
  compose run --rm storage-init
  dir="$(dirname "$file")"
  compose run --rm --no-deps -v "${dir}:/restore-in:ro" -v "${identity}:/run/restore/identity.txt:ro" \
    backup /opt/backup/restore.sh "/restore-in/$(basename "$file")" /run/restore/identity.txt
  compose run --rm migrate
  compose up -d
  wait_ready
}

cmd_update() {
  cmd_validate
  log "backup before update"
  cmd_backup
  # Remember the running images for a rollback.
  for image in api web migrate backup; do
    if docker image inspect "bissinger-os/${image}:staging" >/dev/null 2>&1; then
      docker tag "bissinger-os/${image}:staging" "bissinger-os/${image}:previous"
    fi
  done
  cmd_build
  compose run --rm migrate
  compose up -d --remove-orphans
  wait_ready
}

cmd_rollback() {
  for image in api web migrate backup; do
    docker image inspect "bissinger-os/${image}:previous" >/dev/null 2>&1 || die "no previous image for ${image}"
    docker tag "bissinger-os/${image}:previous" "bissinger-os/${image}:staging"
  done
  log "previous images re-tagged. If the failed release applied a migration the old code cannot use, restore the pre-update backup (docs/deployment/operations-runbook.md)."
  compose up -d --no-build
  wait_ready
}

cmd_diagnose() {
  cmd_health || true
  echo "--- backups"
  backup_exec ls -lh /backups 2>/dev/null | tail -5 || true
  echo "last success age (h): $(latest_backup_age_hours)"
  echo "--- background jobs"
  sql 'SELECT name, "lastStatus", "lastSucceededAt", "consecutiveFailures" FROM background_job_runs ORDER BY name;' || true
  echo "--- disk"
  df -h / "$(env_value STAGING_BACKUP_DIR)" 2>/dev/null || true
  docker system df
  echo "--- recent errors (no request data is logged)"
  compose logs --since 1h --no-color api proxy backup 2>/dev/null | grep -E '"level":"(error|fatal)"|status=failed' | tail -30 || true
}

# Exit 0 = healthy. Otherwise prints one line per problem and exits 1, so a
# systemd timer / cron can alert (see operations runbook).
cmd_monitor() {
  local problems=() service state restarts ready age failed_jobs usage errors
  for service in postgres seaweedfs api web proxy mailpit backup; do
    state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$(project)-${service}-1" 2>/dev/null || echo missing)"
    case "$state" in healthy|running) ;; *) problems+=("container ${service} is ${state}") ;; esac
  done
  for service in api web proxy postgres seaweedfs; do
    restarts="$(docker inspect -f '{{.RestartCount}}' "$(project)-${service}-1" 2>/dev/null || echo 0)"
    [ "${restarts:-0}" -le "${MONITOR_MAX_RESTARTS:-3}" ] || problems+=("${service} restarted ${restarts} times")
  done
  ready="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$(proxy_url)/api/v1/health/ready" || echo 000)"
  [ "$ready" = 200 ] || problems+=("readiness HTTP ${ready}")
  age="$(latest_backup_age_hours)"
  [ "$age" -le "${MONITOR_MAX_BACKUP_AGE_HOURS:-26}" ] || problems+=("last successful backup ${age} h ago")
  failed_jobs="$(sql 'SELECT name FROM background_job_runs WHERE "consecutiveFailures" > 0;' | tr '\n' ' ' || true)"
  failed_jobs="${failed_jobs% }"
  [ -z "$failed_jobs" ] || problems+=("failing background jobs: ${failed_jobs}")
  for path in / "$(env_value STAGING_BACKUP_DIR)"; do
    usage="$(df --output=pcent "$path" 2>/dev/null | tail -1 | tr -dc '0-9')"
    [ -z "$usage" ] || [ "$usage" -lt "${MONITOR_MAX_DISK_PERCENT:-85}" ] || problems+=("disk ${path} ${usage}% used")
  done
  errors="$(compose logs --since "${MONITOR_WINDOW:-15m}" --no-color api 2>/dev/null | grep -c '"level":"error"' || true)"
  [ "${errors:-0}" -le "${MONITOR_MAX_API_ERRORS:-20}" ] || problems+=("${errors} API errors in ${MONITOR_WINDOW:-15m}")

  if [ ${#problems[@]} -eq 0 ]; then
    log "monitor ok"
    return 0
  fi
  for problem in "${problems[@]}"; do log "ALERT ${problem}"; done
  return 1
}

command="${1:-}"
shift || true
case "$command" in
  init) cmd_init "$@" ;;
  validate) cmd_validate ;;
  build) cmd_build ;;
  up) cmd_up ;;
  migrate) cmd_migrate ;;
  bootstrap-admin) cmd_bootstrap_admin "$@" ;;
  health) cmd_health ;;
  backup) cmd_backup ;;
  restore) cmd_restore "$@" ;;
  update) cmd_update ;;
  rollback) cmd_rollback ;;
  diagnose) cmd_diagnose ;;
  monitor) cmd_monitor ;;
  *) sed -n '2,18p' "$0"; exit 1 ;;
esac
