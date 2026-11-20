#!/usr/bin/env bash
# One-shot initialisation of the document bucket (run before the API starts).
#   - creates the bucket with the admin identity (idempotent)
#   - checks that the API identity can write/read/delete in it
#   - checks that anonymous access is refused (bucket is not public)
LOG_COMPONENT=storage-init
source /opt/backup/lib.sh
require_env S3_ENDPOINT S3_BUCKET S3_ADMIN_ACCESS_KEY S3_ADMIN_SECRET_KEY \
  S3_ACCESS_KEY S3_SECRET_KEY

for attempt in $(seq 1 30); do
  if curl -fsS -o /dev/null "${S3_ENDPOINT}/status" 2>/dev/null \
    || curl -sS -o /dev/null -w '%{http_code}' "${S3_ENDPOINT}/" 2>/dev/null | grep -qE '^(200|403)$'; then
    break
  fi
  [ "$attempt" -eq 30 ] && fail "object storage not reachable"
  sleep 2
done

configure_s3_remote admin S3_ADMIN_ACCESS_KEY S3_ADMIN_SECRET_KEY admin
configure_s3_remote app S3_ACCESS_KEY S3_SECRET_KEY

rclone mkdir "admin:${S3_BUCKET}" --quiet || fail "bucket creation"
rclone lsd admin: 2>/dev/null | awk '{print $NF}' | grep -qx "$S3_BUCKET" || fail "bucket ${S3_BUCKET} does not exist after creation"
log "bucket=ready"

probe="$(mktemp)"
echo "storage-init probe" > "$probe"
rclone copyto "$probe" "app:${S3_BUCKET}/.healthcheck/probe.txt" --quiet || fail "API identity cannot write"
rclone cat "app:${S3_BUCKET}/.healthcheck/probe.txt" > /dev/null || fail "API identity cannot read"
rclone deletefile "app:${S3_BUCKET}/.healthcheck/probe.txt" --quiet || fail "API identity cannot delete"
rm -f "$probe"
log "api_identity=read-write"

status=$(curl -s -o /dev/null -w '%{http_code}' "${S3_ENDPOINT}/${S3_BUCKET}/")
case "$status" in
  401|403) log "anonymous_access=denied" ;;
  *) fail "anonymous listing returned HTTP ${status}; bucket must not be public" ;;
esac
log "status=succeeded"
