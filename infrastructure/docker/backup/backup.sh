#!/usr/bin/env bash
# Creates one encrypted, self-verifying backup set of database + documents.
#
#   1. pg_dump (custom format, compressed) and a structural check (pg_restore --list)
#   2. copy of the document bucket
#   3. consistency check: every object referenced by the dump is in the copy.
#      The dump is taken first and documents are never deleted by the app,
#      so the copy is always a superset of what the dump references.
#   4. manifest with SHA-256 of every file
#   5. tar + age encryption to the public recipient key(s); the private key
#      never lives on this host
#   6. atomic rename, optional offsite copy, retention cleanup ONLY after the
#      new backup is complete; status file for monitoring
#
# Exit code is non-zero on any failure. Logs contain no secrets or data.
source /opt/backup/lib.sh

require_env PGHOST PGUSER PGPASSWORD PGDATABASE S3_ENDPOINT S3_BUCKET \
  S3_BACKUP_ACCESS_KEY S3_BACKUP_SECRET_KEY BACKUP_AGE_RECIPIENTS_FILE

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
MIN_KEEP="${BACKUP_MIN_KEEP:-3}"
[ -r "$BACKUP_AGE_RECIPIENTS_FILE" ] || fail "recipients file not readable"

started=$(date +%s)
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="bissinger-os-${timestamp}"
work="$(mktemp -d "${BACKUP_DIR}/.work-${timestamp}.XXXXXX")"
trap 'rm -rf "$work" "${BACKUP_DIR}/${name}.tar.age.partial"' EXIT

log "status=started name=${name}"

# 1. Database
pg_dump --format=custom --compress=6 --no-owner --no-privileges \
  --file="${work}/database.dump" || fail "pg_dump"
pg_restore --list "${work}/database.dump" > /dev/null || fail "dump unreadable"

# 2. Documents
configure_s3_remote src S3_BACKUP_ACCESS_KEY S3_BACKUP_SECRET_KEY
mkdir -p "${work}/objects"
rclone copy "src:${S3_BUCKET}" "${work}/objects" --quiet || fail "object copy"

# 3. Consistency
storage_keys_from_dump "${work}/database.dump" > "${work}/referenced-keys.txt" \
  || fail "reading storage keys from dump"
missing=0
while IFS= read -r key; do
  [ -z "$key" ] && continue
  if [ ! -f "${work}/objects/${key}" ]; then
    missing=$((missing + 1))
  fi
done < "${work}/referenced-keys.txt"
[ "$missing" -eq 0 ] || fail "${missing} referenced objects missing from the copy"

# 4. Manifest
objects=$(find "${work}/objects" -type f | wc -l | tr -d ' ')
referenced=$(grep -c . "${work}/referenced-keys.txt" || true)
(
  cd "$work"
  {
    echo "name=${name}"
    echo "created_at=${timestamp}"
    echo "database=${PGDATABASE}"
    echo "objects=${objects}"
    echo "referenced_objects=${referenced}"
    echo "format=pg_dump-custom+files"
  } > manifest.txt
  find . -type f ! -name checksums.sha256 -print0 | sort -z | xargs -0 sha256sum > checksums.sha256
)

# 5. Encrypt (stream: no unencrypted archive on disk)
tar -C "$work" -cf - . | age -R "$BACKUP_AGE_RECIPIENTS_FILE" \
  -o "${BACKUP_DIR}/${name}.tar.age.partial" || fail "encryption"

# 6. Publish atomically
mv "${BACKUP_DIR}/${name}.tar.age.partial" "${BACKUP_DIR}/${name}.tar.age"
( cd "$BACKUP_DIR" && sha256sum "${name}.tar.age" > "${name}.tar.age.sha256" )
size=$(stat -c %s "${BACKUP_DIR}/${name}.tar.age")

if [ -n "${BACKUP_OFFSITE_REMOTE:-}" ]; then
  # e.g. BACKUP_OFFSITE_REMOTE=offsite:bucket/path with RCLONE_CONFIG_OFFSITE_* set
  rclone copy "${BACKUP_DIR}/${name}.tar.age" "$BACKUP_OFFSITE_REMOTE" --quiet || fail "offsite copy"
  rclone copy "${BACKUP_DIR}/${name}.tar.age.sha256" "$BACKUP_OFFSITE_REMOTE" --quiet || fail "offsite copy"
  log "offsite=copied"
fi

# Retention: only now that the new set exists; always keep MIN_KEEP newest.
mapfile -t all < <(ls -1 "${BACKUP_DIR}"/bissinger-os-*.tar.age 2>/dev/null | sort -r)
index=0
for file in "${all[@]}"; do
  index=$((index + 1))
  [ "$index" -le "$MIN_KEEP" ] && continue
  if [ -n "$(find "$file" -mtime +"$RETENTION_DAYS" 2>/dev/null)" ]; then
    rm -f "$file" "${file}.sha256"
    log "retention=deleted file=$(basename "$file")"
  fi
done

date -u +%Y-%m-%dT%H:%M:%SZ > "${BACKUP_DIR}/last-success"
echo "${name}.tar.age" > "${BACKUP_DIR}/last-success-name"
log "status=succeeded name=${name} bytes=${size} objects=${objects} referenced=${referenced} durationSec=$(( $(date +%s) - started ))"
