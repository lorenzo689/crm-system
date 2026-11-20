#!/usr/bin/env bash
# Restores one backup set into an EMPTY database and bucket.
#
#   restore.sh <backup-file.tar.age> <age-identity-file>
#
# Steps: archive checksum -> decrypt -> per-file checksums -> refuse a
# non-empty target -> pg_restore (single transaction) -> upload documents ->
# verify every referenced object and every file hash in the bucket.
# Any failed step aborts with a non-zero exit code.
LOG_COMPONENT=restore
source /opt/backup/lib.sh

archive="${1:-}"
identity="${2:-}"
[ -f "$archive" ] || fail "backup file not found"
[ -r "$identity" ] || fail "identity file not readable"
require_env PGHOST PGUSER PGPASSWORD PGDATABASE S3_ENDPOINT S3_BUCKET \
  S3_ADMIN_ACCESS_KEY S3_ADMIN_SECRET_KEY

started=$(date +%s)
log "status=started file=$(basename "$archive")"

if [ -f "${archive}.sha256" ]; then
  ( cd "$(dirname "$archive")" && sha256sum -c --status "$(basename "$archive").sha256" ) \
    || fail "archive checksum mismatch"
  log "archive_checksum=ok"
else
  log "archive_checksum=absent"
fi

work="$(mktemp -d /tmp/restore.XXXXXX)"
trap 'rm -rf "$work"' EXIT
age -d -i "$identity" "$archive" | tar -C "$work" -xf - || fail "decryption or archive"
[ -f "${work}/database.dump" ] || fail "database.dump missing in backup"
[ -f "${work}/checksums.sha256" ] || fail "checksums missing in backup"
( cd "$work" && sha256sum -c --status checksums.sha256 ) || fail "file checksum mismatch"
pg_restore --list "${work}/database.dump" > /dev/null || fail "invalid database dump"
log "contents=verified $(tr '\n' ' ' < "${work}/manifest.txt")"

tables=$(psql -tAc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
[ "$tables" = "0" ] || fail "target database is not empty (${tables} tables); restore only into a fresh database"

pg_restore --no-owner --no-privileges --exit-on-error --single-transaction \
  --dbname="$PGDATABASE" "${work}/database.dump" || fail "pg_restore"
log "database=restored"

configure_s3_remote dst S3_ADMIN_ACCESS_KEY S3_ADMIN_SECRET_KEY admin
rclone mkdir "dst:${S3_BUCKET}" --quiet || fail "bucket"
rclone copy "${work}/objects" "dst:${S3_BUCKET}" --quiet || fail "object upload"
# Every file of the backup must be in the bucket with the same content.
rclone check "${work}/objects" "dst:${S3_BUCKET}" --one-way --download --quiet \
  || fail "object verification"

missing=0
while IFS= read -r key; do
  [ -z "$key" ] && continue
  [ -f "${work}/objects/${key}" ] || missing=$((missing + 1))
done < <(storage_keys_from_dump "${work}/database.dump")
[ "$missing" -eq 0 ] || fail "${missing} referenced objects missing"

log "status=succeeded durationSec=$(( $(date +%s) - started ))"
