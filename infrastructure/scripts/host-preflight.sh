#!/usr/bin/env bash
# Read-only preflight of the staging HOST. Changes nothing, prints one line per
# check: PASS, WARN (look at it, not a blocker) or FAIL (blocker). Exit code 1
# if any check failed.
#
#   host-preflight.sh            before the first start (host, Docker, config, Tailscale)
#   host-preflight.sh --post     after `staging.sh up` and `tailscale serve`
#                                (adds: running stack, listeners, restart policy,
#                                monitoring timer, Serve/Funnel state)
#
# Needs: bash, coreutils, ss, docker. Uses tailscale/systemctl when present.
# Secrets are never printed.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${STAGING_ENV_FILE:-${ROOT}/infrastructure/docker/.env.staging}"
POST=0
[ "${1:-}" = "--post" ] && POST=1

PASSES=0; WARNS=0; FAILS=0
pass() { PASSES=$((PASSES + 1)); printf 'PASS  %s\n' "$*"; }
warn() { WARNS=$((WARNS + 1)); printf 'WARN  %s\n' "$*"; }
fail() { FAILS=$((FAILS + 1)); printf 'FAIL  %s\n' "$*"; }
section() { printf '\n== %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
env_value() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

section "Host"
if [ "$(uname -s)" = Linux ]; then pass "Linux ($(uname -sr))"; else fail "not Linux: $(uname -s)"; fi
mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
[ "${mem_kb:-0}" -ge 3800000 ] && pass "RAM $((mem_kb / 1024)) MB (>= 4 GB)" || fail "RAM $((mem_kb / 1024)) MB, need >= 4 GB"
cpus="$(nproc 2>/dev/null || echo 0)"
[ "$cpus" -ge 2 ] && pass "${cpus} vCPU (>= 2)" || fail "${cpus} vCPU, need >= 2"
free_gb="$(df -BG --output=avail / 2>/dev/null | tail -1 | tr -dc '0-9')"
[ "${free_gb:-0}" -ge 20 ] && pass "${free_gb} GB free on /" || fail "${free_gb:-?} GB free on /, need >= 20 GB for images and volumes"
if have timedatectl; then
  [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" = yes ] && pass "clock is NTP-synchronized" || warn "clock not NTP-synchronized (cookies, TLS and backup timestamps depend on it)"
fi

section "Docker"
if have docker && docker info >/dev/null 2>&1; then
  pass "Docker daemon reachable ($(docker version --format '{{.Server.Version}}' 2>/dev/null))"
else
  fail "Docker daemon not reachable (installed? is this user in the docker group?)"
fi
docker compose version >/dev/null 2>&1 && pass "Compose plugin: $(docker compose version --short 2>/dev/null)" || fail "Docker Compose plugin missing"
if have systemctl; then
  [ "$(systemctl is-enabled docker 2>/dev/null)" = enabled ] && pass "docker.service enabled at boot" || fail "docker.service not enabled at boot (sudo systemctl enable docker)"
fi
have openssl && pass "openssl present" || fail "openssl missing (needed by staging.sh init)"
have curl && pass "curl present" || fail "curl missing"
have git && pass "git present" || fail "git missing"

section "Configuration (${ENV_FILE})"
if [ ! -f "$ENV_FILE" ]; then
  fail "missing ${ENV_FILE} (staging.sh init https://<host>.<tailnet>.ts.net)"
else
  [ "$(stat -c %a "$ENV_FILE")" = 600 ] && pass ".env.staging has mode 600" || fail ".env.staging must have mode 600"
  [ "$(stat -c %u "$ENV_FILE")" = "$(id -u)" ] || warn ".env.staging is owned by uid $(stat -c %u "$ENV_FILE"), not by the current user"
  origin="$(env_value STAGING_ORIGIN)"
  case "$origin" in
    https://*.ts.net) pass "STAGING_ORIGIN is a ts.net https origin" ;;
    *) fail "STAGING_ORIGIN must be https://<host>.<tailnet>.ts.net (is: ${origin:-empty})" ;;
  esac
  if grep -qE '^(JWT_SECRET|POSTGRES_PASSWORD|S3_[A-Z_]*KEY)=(|replace-.*)$' "$ENV_FILE"; then
    fail "empty or placeholder secrets in .env.staging"
  else
    pass "no empty or placeholder secrets"
  fi
  [ "$(env_value BACKGROUND_JOBS)" = maintenance ] && pass "BACKGROUND_JOBS=maintenance" || fail "BACKGROUND_JOBS must be 'maintenance' on staging"
  if grep -qE '^(ANTHROPIC_API_KEY|IMAP_[A-Z]*|SMTP_(USER|PASSWORD))=.+' "$ENV_FILE"; then
    fail ".env.staging contains AI, IMAP or SMTP credentials (not allowed on staging)"
  else
    pass "no AI, IMAP or SMTP credentials in .env.staging"
  fi
  recipients="$(env_value BACKUP_AGE_RECIPIENTS)"
  if [ -r "$recipients" ]; then
    if grep -q '^AGE-SECRET-KEY' "$recipients"; then
      fail "BACKUP_AGE_RECIPIENTS contains a PRIVATE key"
    elif grep -q '^age1' "$recipients"; then
      pass "BACKUP_AGE_RECIPIENTS holds a public age key only"
    else
      fail "BACKUP_AGE_RECIPIENTS has no age1... public key"
    fi
  else
    fail "BACKUP_AGE_RECIPIENTS not readable: ${recipients:-unset}"
  fi
  backup_dir="$(env_value STAGING_BACKUP_DIR)"
  if [ -d "$backup_dir" ]; then
    owner_mode="$(stat -c '%u %a' "$backup_dir")"
    [ "$owner_mode" = "70 700" ] && pass "backup dir ${backup_dir} is uid 70, mode 700" || fail "backup dir ${backup_dir} is '${owner_mode}', must be '70 700' (sudo install -d -m 700 -o 70 -g 70 ${backup_dir})"
    docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
    if [ "$(stat -c %d "$backup_dir")" = "$(stat -c %d "${docker_root}" 2>/dev/null)" ]; then
      warn "backup dir is on the same filesystem as ${docker_root}; a full disk or a lost disk takes data and backups together"
    else
      pass "backup dir is on a different filesystem than ${docker_root}"
    fi
  else
    fail "backup dir ${backup_dir:-unset} does not exist (Docker would create it root-owned and the backup user could not write)"
  fi
fi

section "Tailscale"
if have tailscale; then
  state="$(tailscale status --json 2>/dev/null | grep -o '"BackendState": *"[A-Za-z]*"' | head -1 | sed 's/.*: *"//; s/"//')"
  [ "$state" = Running ] && pass "tailscale is running and logged in" || fail "tailscale BackendState is '${state:-unknown}' (sudo tailscale up --hostname=bos-staging --advertise-tags=tag:bos-staging)"
  have systemctl && { [ "$(systemctl is-enabled tailscaled 2>/dev/null)" = enabled ] && pass "tailscaled enabled at boot" || fail "tailscaled not enabled at boot"; }
  dns="$(tailscale status --json 2>/dev/null | grep -o '"DNSName": *"[^"]*"' | head -1 | sed 's/.*: *"//; s/"//; s/\.$//')"
  origin_host="$(env_value STAGING_ORIGIN | sed 's#https://##; s#:.*##')"
  if [ -n "$dns" ] && [ -n "$origin_host" ]; then
    [ "$dns" = "$origin_host" ] && pass "STAGING_ORIGIN host equals the Tailscale DNS name (${dns})" || fail "STAGING_ORIGIN host '${origin_host}' differs from this node's name '${dns}'"
  fi
  serve_json="$(tailscale serve status --json 2>/dev/null || true)"
  if [ "$POST" = 1 ]; then
    port="$(env_value STAGING_PROXY_PORT)"; port="${port:-8080}"
    if printf '%s' "$serve_json" | grep -q "127.0.0.1:${port}"; then
      pass "tailscale serve forwards to 127.0.0.1:${port}"
    else
      fail "tailscale serve does not forward to 127.0.0.1:${port} (sudo tailscale serve --bg --https=443 http://127.0.0.1:${port})"
    fi
    if printf '%s' "$serve_json" | grep -q '"AllowFunnel": *{[^}]*true'; then
      fail "Tailscale FUNNEL is enabled: the service would be public (sudo tailscale serve reset, then set up Serve again)"
    else
      pass "Tailscale Funnel is not enabled"
    fi
  fi
else
  fail "tailscale not installed"
fi

if [ "$POST" = 1 ]; then
  section "Running stack"
  project="$(env_value COMPOSE_PROJECT_NAME)"; project="${project:-bissinger-staging}"
  for service in postgres seaweedfs api web proxy mailpit backup; do
    name="${project}-${service}-1"
    state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null)" || state=missing
    case "$state" in healthy|running) pass "${service}: ${state}" ;; *) fail "${service}: ${state}" ;; esac
    policy="$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$name" 2>/dev/null)" || policy=none
    [ "$state" = missing ] || [ "$policy" = unless-stopped ] || fail "${service}: restart policy is '${policy}', expected unless-stopped (no restart after a host reboot)"
  done
  ready="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://127.0.0.1:$(env_value STAGING_PROXY_PORT)/api/v1/health/ready" || true)"
  [ "$ready" = 200 ] && pass "readiness 200 on the loopback proxy" || fail "readiness answered '${ready}'"

  section "Network exposure"
  published="$(docker ps --filter "label=com.docker.compose.project=${project}" --format '{{.Names}} {{.Ports}}' | grep -E '0\.0\.0\.0|\[::\]' || true)"
  [ -z "$published" ] && pass "no container port is published on all interfaces" || fail "published on all interfaces: ${published}"
  if have ss; then
    listeners="$(ss -ltnH 2>/dev/null | awk '{print $4}' | grep -vE '^(127\.|\[::1\]|::1)' | sort -u | tr '\n' ' ')"
    echo "      non-loopback listeners: ${listeners:-none}"
    echo "$listeners" | grep -qE '(^|[: ])(80|443|8080|3000|4000|5432|8333|9333|8025|1025)( |$)' \
      && fail "an application port listens on a non-loopback address (see above)" \
      || pass "no application port listens on a non-loopback address"
  else
    warn "ss missing; listeners not checked"
  fi

  section "Monitoring and alerting"
  if have systemctl; then
    [ "$(systemctl is-enabled bos-monitor.timer 2>/dev/null)" = enabled ] && pass "bos-monitor.timer enabled" || fail "bos-monitor.timer not enabled (infrastructure/systemd/README.md)"
    [ "$(systemctl is-active bos-monitor.timer 2>/dev/null)" = active ] && pass "bos-monitor.timer active" || fail "bos-monitor.timer not active"
  fi
  if [ -r /etc/bissinger-staging/alert.env ] && grep -q '^ALERT_WEBHOOK_URL=.' /etc/bissinger-staging/alert.env; then
    pass "alert channel configured (delivery is proven only by: staging.sh alert-test)"
  else
    fail "no alert channel configured (/etc/bissinger-staging/alert.env)"
  fi
fi

printf '\n%s passed, %s warnings, %s failed\n' "$PASSES" "$WARNS" "$FAILS"
[ "$FAILS" -eq 0 ]
