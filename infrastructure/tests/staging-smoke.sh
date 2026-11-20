#!/usr/bin/env bash
# End-to-end test of the private staging stack with synthetic data.
#
# Builds nothing itself: expects the images named in API_IMAGE, WEB_IMAGE,
# MIGRATE_IMAGE and BACKUP_IMAGE (see .github/workflows/ci.yml or
# infrastructure/scripts/staging.sh build). Exit code 0 only if all checks pass.
#
#   API_IMAGE=... WEB_IMAGE=... MIGRATE_IMAGE=... BACKUP_IMAGE=... \
#     infrastructure/tests/staging-smoke.sh
source "$(dirname "$0")/lib.sh"

: "${API_IMAGE:?}" "${WEB_IMAGE:?}" "${MIGRATE_IMAGE:?}" "${BACKUP_IMAGE:?}"
PROJECT="${SMOKE_PROJECT:-bos-smoke}"
DIR="${WORK_ROOT}/${PROJECT}"
purge_dir "$DIR"
write_test_env "$PROJECT" "$DIR"
cleanup() {
  if [ "${KEEP_STACK:-0}" != "1" ]; then
    compose "$DIR" down -v --remove-orphans >/dev/null 2>&1 || true
    # The backups belong to uid 70; remove them as root so the workspace stays
    # deletable for the CI runner.
    purge_dir "${DIR}/backups"
  fi
}
trap cleanup EXIT

echo "== configuration"
check "compose configuration is valid" compose "$DIR" config -q

echo "== start"
start_stack "$DIR"
pass "stack started (all health checks green)"

ready() { [ "$(https "$DIR" -o /dev/null -w '%{http_code}' "${API}/health/ready")" = "$1" ]; }
check "readiness 200 through HTTPS origin" ready 200
live() { [ "$(https "$DIR" -o /dev/null -w '%{http_code}' "${API}/health/live")" = 200 ]; }
check "liveness 200" live

headers="$(https "$DIR" -D - -o /dev/null "${ORIGIN}/login" | tr -d '\r')"
check "CSP with per-request nonce and strict-dynamic" grep -qiE "^content-security-policy: .*script-src 'self' 'nonce-[^']+' 'strict-dynamic'" <<< "$headers"
check "CSP keeps object-src none, base-uri self, frame-ancestors none" grep -qiE "object-src 'none'.*base-uri 'self'.*frame-ancestors 'none'" <<< "$headers"
check "HSTS header" grep -qi '^strict-transport-security:' <<< "$headers"
check "no Server header" bash -c "! grep -qi '^server:' <<< \"\$1\"" _ "$headers"

echo "== administrator bootstrap and login"
check "bootstrap admin via CLI (--password-stdin)" bootstrap_admin "$DIR"
check "login over the private HTTPS origin" login "$DIR"
cookie_ok() {
  printf '%s' "$LOGIN_SET_COOKIE" | grep -q '__Host-bissinger_session=' &&
  printf '%s' "$LOGIN_SET_COOKIE" | grep -qi '; *secure' &&
  printf '%s' "$LOGIN_SET_COOKIE" | grep -qi '; *httponly' &&
  printf '%s' "$LOGIN_SET_COOKIE" | grep -qi '; *samesite=lax' &&
  printf '%s' "$LOGIN_SET_COOKIE" | grep -qi '; *path=/' &&
  ! printf '%s' "$LOGIN_SET_COOKIE" | grep -qi 'domain='
}
check "session cookie is __Host-, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain" cookie_ok
check "session probe 200" bash -c "[ \"\$1\" = 200 ]" _ "$(authed "$DIR" -o /dev/null -w '%{http_code}' "${API}/auth/session")"

echo "== CSRF and origin checks (Sprint 2) behind the proxy"
code_without_token="$(https "$DIR" -o /dev/null -w '%{http_code}' -H "Cookie: ${COOKIE}" -H "Origin: ${ORIGIN}" -H 'Content-Type: application/json' -d '{"name":"X","customerNumber":"K-1"}' "${API}/customers")"
check "mutation without CSRF token -> 403" [ "$code_without_token" = 403 ]
foreign="$(authed "$DIR" -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{"name":"X","customerNumber":"K-1"}' "${API}/customers")"
check "foreign origin -> ORIGIN_REJECTED" bash -c "[ \"\$(printf '%s' \"\$1\" | node -e 'process.stdout.write(JSON.parse(require(\"fs\").readFileSync(0,\"utf8\")).code||\"\")')\" = ORIGIN_REJECTED ]" _ "$foreign"
customer="$(authed "$DIR" -H 'Content-Type: application/json' -d '{"name":"Staging Kunde","customerNumber":"K-1000"}' "${API}/customers")"
CUSTOMER_ID="$(printf '%s' "$customer" | json_get id)"
check "CSRF-protected mutation with token succeeds" [ -n "$CUSTOMER_ID" ]

echo "== documents: upload and streamed download through the proxy"
make_pdf "${DIR}/upload.pdf" 512
document="$(authed "$DIR" -H 'Content-Type: application/json' -d "{\"title\":\"Smoke\",\"type\":\"PLAN\",\"customerId\":\"${CUSTOMER_ID}\"}" "${API}/documents")"
DOCUMENT_ID="$(printf '%s' "$document" | json_get id)"
upload_code="$(authed "$DIR" -o /dev/null -w '%{http_code}' -F "file=@$(native_path "${DIR}/upload.pdf");type=application/pdf" "${API}/documents/${DOCUMENT_ID}/versions")"
check "multipart upload 201" [ "$upload_code" = 201 ]
download_headers="$(authed "$DIR" -D - -o "${DIR}/download.pdf" "${API}/documents/${DOCUMENT_ID}/download?disposition=attachment" | tr -d '\r')"
check "downloaded file is byte-identical" [ "$(sha256_of "${DIR}/upload.pdf")" = "$(sha256_of "${DIR}/download.pdf")" ]
check "download is an attachment with nosniff" bash -c "grep -qi '^content-disposition: attachment' <<< \"\$1\" && grep -qi '^x-content-type-options: nosniff' <<< \"\$1\"" _ "$download_headers"
check "download without session -> 401" [ "$(https "$DIR" -o /dev/null -w '%{http_code}' "${API}/documents/${DOCUMENT_ID}/download")" = 401 ]
check "object storage is not reachable from the host" bash -c "! curl -s -m 3 -o /dev/null http://127.0.0.1:8333/"

echo "== streaming (server-sent events) through the proxy"
stream="$(authed "$DIR" -N -m 30 -D - -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"Hallo"}]}' "${API}/ai/chat/stream" | tr -d '\r')"
check "AI stream answers text/event-stream (no AI key on staging -> error event)" bash -c "grep -qi '^content-type: text/event-stream' <<< \"\$1\" && grep -q '\"type\":\"error\"' <<< \"\$1\"" _ "$stream"

echo "== network exposure"
published="$(docker ps --filter "label=com.docker.compose.project=${PROJECT}" --format '{{.Label "com.docker.compose.service"}} {{.Ports}}')"
echo "$published"
only_loopback() {
  local line service ports
  while IFS= read -r line; do
    service="${line%% *}"
    ports="${line#* }"
    [ "$ports" = "$service" ] && ports=""
    if printf '%s' "$ports" | grep -q -- '->'; then
      case "$service" in proxy|tls-gateway) ;; *) return 1 ;; esac
      printf '%s' "$ports" | grep -oE '[0-9a-f.:\[\]]+:[0-9]+->' | grep -vqE '^127\.0\.0\.1:' && return 1
    fi
  done <<< "$published"
  return 0
}
check "only proxy (and test gateway) publish ports, all on 127.0.0.1" only_loopback
check "API container has no internet access" bash -c "! docker compose --env-file '$DIR/env' -f '$DOCKER_DIR/docker-compose.staging.yml' -f '$DOCKER_DIR/docker-compose.staging-test.yml' exec -T api node -e \"fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(0)).catch(()=>process.exit(1))\""

echo "== background jobs"
jobs_line() { compose "$DIR" logs api 2>/dev/null | grep -o 'Background jobs active: \[[^]]*\], disabled: \[[^]]*\]' | tail -1; }
line="$(jobs_line)"
echo "$line"
check "only session-purge is scheduled" grep -q 'active: \[session-purge\]' <<< "$line"
check "business jobs are disabled" bash -c "grep -q 'inbox-poll' <<< \"\$1\" && grep -q 'ai-agents' <<< \"\$1\" && grep -q 'recurring-invoices' <<< \"\$1\" && grep -q 'calendar-reminders' <<< \"\$1\"" _ "$line"
compose "$DIR" restart api >/dev/null
compose "$DIR" up -d --wait --wait-timeout 120 >/dev/null
check "after an API restart still only session-purge" grep -q 'active: \[session-purge\]' <<< "$(jobs_line)"
check "no business job has ever run" [ "$(psql_value "$DIR" "SELECT count(*) FROM background_job_runs WHERE name <> 'session-purge'")" = 0 ]
guard_log="$(compose "$DIR" run --rm --no-deps -e BACKGROUND_JOBS=all api 2>&1 || true)"
check "API refuses to start on staging with business jobs enabled" grep -q 'must not enable business jobs' <<< "$guard_log"

echo "== mail capture"
https "$DIR" -o /dev/null -H "Origin: ${ORIGIN}" -H 'Content-Type: application/json' -d "{\"email\":\"${ADMIN_EMAIL}\"}" "${API}/auth/forgot-password"
mail_captured() {
  local total
  total="$(compose "$DIR" exec -T mailpit wget -qO- http://127.0.0.1:8025/api/v1/messages | json_get total)"
  [ "${total:-0}" -ge 1 ]
}
check "password reset mail captured by Mailpit" mail_captured

echo "== client IP handling (no X-Forwarded-For spoofing)"
codes=""
for i in 1 2 3 4 5 6 7; do
  codes="${codes} $(https "$DIR" -o /dev/null -w '%{http_code}' -H "Origin: ${ORIGIN}" -H "X-Forwarded-For: 203.0.113.${i}" -H 'Content-Type: application/json' -d '{"email":"nobody@staging.test","password":"Wrong!Pass-123"}' "${API}/auth/login")"
done
echo "login codes:${codes}"
check "login rate limit still applies with spoofed X-Forwarded-For" grep -q 429 <<< "$codes"

echo "== readiness reacts to dependency failures"
compose "$DIR" stop seaweedfs >/dev/null
sleep 3
check "object storage down -> readiness 503" ready 503
compose "$DIR" start seaweedfs >/dev/null
for _ in $(seq 1 30); do ready 200 && break; sleep 2; done
check "object storage back -> readiness 200" ready 200
compose "$DIR" stop postgres >/dev/null
sleep 3
check "database down -> readiness 503" ready 503
compose "$DIR" start postgres >/dev/null
for _ in $(seq 1 30); do ready 200 && break; sleep 2; done
check "database back -> readiness 200" ready 200

echo "== backup"
check "encrypted backup succeeds" backup_exec "$DIR" /opt/backup/backup.sh
BACKUP_NAME="$(latest_backup_name "$DIR")"
# Backups are 0600 files owned by uid 70 in a 0700 directory: they are read
# through the backup container (as that user), never from the host side.
backup_files_exist() {
  backup_exec "$DIR" sh -c "test -s /backups/${BACKUP_NAME} && test -s /backups/${BACKUP_NAME}.sha256"
}
backup_is_age_encrypted() {
  backup_exec "$DIR" head -c 21 "/backups/${BACKUP_NAME}" | grep -q 'age-encryption.org'
}
check "backup file and checksum exist" backup_files_exist
check "backup is encrypted, not readable without the private key (age header)" backup_is_age_encrypted

# Permission model (Linux hosts enforce it; bind mounts of Docker Desktop on
# Windows/macOS do not, there permissions-test.sh covers it on a Docker volume).
backup_permissions_are_restrictive() {
  [ "$(backup_exec "$DIR" stat -c '%a:%U' "/backups/${BACKUP_NAME}" | tr -d '\r')" = "600:postgres" ] &&
    [ "$(backup_exec "$DIR" stat -c '%a' /backups | tr -d '\r')" = 700 ]
}
host_user_cannot_read_backups() {
  ! head -c 1 "${DIR}/backups/${BACKUP_NAME}" >/dev/null 2>&1 && ! ls "${DIR}/backups" >/dev/null 2>&1
}
if [ "$(uname -s)" = Linux ] && [ "$(id -u)" != 0 ]; then
  check "backup files are 0600 owned by the backup user, the directory 0700 (never 644/777)" backup_permissions_are_restrictive
  check "the unprivileged host user can neither read nor list the backups" host_user_cannot_read_backups
else
  echo "SKIP  host-side backup permission checks (needs an unprivileged Linux host; see permissions-test.sh)"
fi

echo "== persistence across a full restart"
compose "$DIR" down >/dev/null
start_stack "$DIR"
check "login after restart" login "$DIR"
authed "$DIR" -o "${DIR}/after-restart.pdf" "${API}/documents/${DOCUMENT_ID}/download"
check "document survives restart (same hash)" [ "$(sha256_of "${DIR}/upload.pdf")" = "$(sha256_of "${DIR}/after-restart.pdf")" ]

echo "== logs contain no secrets or session data"
# A reset link in the URL (as sent by e-mail) must not end up in access logs.
https "$DIR" -o /dev/null "${ORIGIN}/reset-password?token=leakcheck0123456789abcdef"
compose "$DIR" logs --no-color > "${DIR}/all.log" 2>&1
no_secret_in_logs() {
  local value
  for value in "${COOKIE#*=}" "$CSRF" "$(admin_password "$DIR")" "$(env_value "$DIR" JWT_SECRET)" \
    "$(env_value "$DIR" S3_SECRET_KEY)" "$(env_value "$DIR" POSTGRES_PASSWORD)"; do
    if [ -n "$value" ] && grep -qF -- "$value" "${DIR}/all.log"; then
      return 1
    fi
  done
  return 0
}
check "no cookie, CSRF token, password or secret in any container log" no_secret_in_logs
check "no reset token from URLs in any log" bash -c "! grep -q leakcheck0123456789abcdef \"\$1\"" _ "${DIR}/all.log"
check "no full e-mail address in any log" bash -c "! grep -qF \"\$1\" \"\$2\"" _ "$ADMIN_EMAIL" "${DIR}/all.log"
check "API logs are JSON with request ids" grep -q '"requestId=' "${DIR}/all.log"

summary
