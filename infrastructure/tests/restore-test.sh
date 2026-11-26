#!/usr/bin/env bash
# Real restore test: data -> encrypted backup -> source destroyed -> restore
# into a brand-new environment -> verify records, relations, file hashes,
# sessions and the Prisma migration state. Also proves that broken backups,
# wrong keys and non-empty targets are rejected.
#
# Writes a report with measured durations to $WORK_ROOT/restore-report.md.
source "$(dirname "$0")/lib.sh"

: "${API_IMAGE:?}" "${WEB_IMAGE:?}" "${MIGRATE_IMAGE:?}" "${BACKUP_IMAGE:?}"
SRC="${WORK_ROOT}/bos-restore-src"
DST="${WORK_ROOT}/bos-restore-dst"
# VAULT: host-owned test files (original and restored PDFs).
# STAGE: the backup archive, its checksum and the age identities, handed to the
# backup user (uid 70, mode 0700/0600) because the restore container reads them.
VAULT="${WORK_ROOT}/restore-vault"
STAGE="${WORK_ROOT}/restore-stage"
REPORT="${WORK_ROOT}/restore-report.md"
purge_dir "$SRC"
purge_dir "$DST"
purge_dir "$STAGE"
rm -rf "$VAULT"
mkdir -p "$VAULT" "$STAGE"
write_test_env bos-restore-src "$SRC"
cleanup() {
  if [ "${KEEP_STACK:-0}" != "1" ]; then
    compose "$SRC" down -v --remove-orphans >/dev/null 2>&1 || true
    compose "$DST" down -v --remove-orphans >/dev/null 2>&1 || true
    # Files owned by uid 70 are removed as root so the workspace stays deletable.
    purge_dir "${SRC}/backups"
    purge_dir "${DST}/backups"
    purge_dir "$STAGE"
  fi
}
trap cleanup EXIT
now() { date +%s; }

echo "== source environment with test data"
start_stack "$SRC"
bootstrap_admin "$SRC" >/dev/null
check "login (source)" login "$SRC"
customer="$(authed "$SRC" -H 'Content-Type: application/json' -d '{"name":"Restore Kunde GmbH","customerNumber":"K-4711"}' "${API}/customers")"
CUSTOMER_ID="$(printf '%s' "$customer" | json_get id)"
project="$(authed "$SRC" -H 'Content-Type: application/json' -d "{\"customerId\":\"${CUSTOMER_ID}\",\"name\":\"Restore Projekt\",\"projectNumber\":\"P-4711\"}" "${API}/projects")"
PROJECT_ID="$(printf '%s' "$project" | json_get id)"
check "customer and project created" bash -c "[ -n '$CUSTOMER_ID' ] && [ -n '$PROJECT_ID' ]"

declare -A FILE_HASH
DOC_IDS=()
for n in 1 2; do
  make_pdf "${VAULT}/original-${n}.pdf" $(( n * 300 ))
  doc="$(authed "$SRC" -H 'Content-Type: application/json' -d "{\"title\":\"Plan ${n}\",\"type\":\"PLAN\",\"customerId\":\"${CUSTOMER_ID}\",\"projectId\":\"${PROJECT_ID}\"}" "${API}/documents")"
  id="$(printf '%s' "$doc" | json_get id)"
  code="$(authed "$SRC" -o /dev/null -w '%{http_code}' -F "file=@$(native_path "${VAULT}/original-${n}.pdf");type=application/pdf" "${API}/documents/${id}/versions")"
  [ "$code" = 201 ] || failed "upload ${n} (HTTP ${code})"
  DOC_IDS+=("$id")
  FILE_HASH[$id]="$(sha256_of "${VAULT}/original-${n}.pdf")"
done
check "two documents uploaded" [ "${#DOC_IDS[@]}" = 2 ]

COUNT_SQL="SELECT (SELECT count(*) FROM users)||','||(SELECT count(*) FROM customers)||','||(SELECT count(*) FROM projects)||','||(SELECT count(*) FROM documents)||','||(SELECT count(*) FROM document_versions)||','||(SELECT count(*) FROM user_sessions)||','||(SELECT count(*) FROM _prisma_migrations)"
SOURCE_COUNTS="$(psql_value "$SRC" "$COUNT_SQL")"
echo "source counts (users,customers,projects,documents,versions,sessions,migrations): ${SOURCE_COUNTS}"

echo "== backup"
t0=$(now)
check "backup succeeds" backup_exec "$SRC" /opt/backup/backup.sh
BACKUP_SECONDS=$(( $(now) - t0 ))
BACKUP_NAME="$(latest_backup_name "$SRC")"
BACKUP_BYTES="$(backup_exec "$SRC" stat -c %s "/backups/${BACKUP_NAME}" | tr -d '\r')"
# The backups directory belongs to uid 70 (0700) and the files are 0600, so the
# host user cannot copy them directly. `compose cp` hands out host-owned copies
# with the original mode; the originals stay protected.
compose "$SRC" cp "backup:/backups/${BACKUP_NAME}" "${STAGE}/${BACKUP_NAME}" >/dev/null
compose "$SRC" cp "backup:/backups/${BACKUP_NAME}.sha256" "${STAGE}/${BACKUP_NAME}.sha256" >/dev/null
archive_copied() { [ -s "${STAGE}/${BACKUP_NAME}" ] && [ -s "${STAGE}/${BACKUP_NAME}.sha256" ]; }
check "backup archive and checksum copied out of the backup container" archive_copied
(umask 077 && cp "${SRC}/age-identity.txt" "${STAGE}/age-identity.txt")
# Inputs for the negative tests, created while the files are still ours.
cp "${STAGE}/${BACKUP_NAME}" "${STAGE}/corrupt.tar.age"
printf 'X' | dd of="${STAGE}/corrupt.tar.age" bs=1 seek=4000 conv=notrunc 2>/dev/null
(umask 077 && docker run --rm --entrypoint age-keygen "$BACKUP_IMAGE" > "${STAGE}/wrong-identity.txt" 2>/dev/null)
# The restore container (uid 70) reads the stage: owner 70, 0700/0600, never 644.
hand_to_backup_user "$STAGE"

echo "== destroy the source environment (containers and volumes)"
compose "$SRC" down -v --remove-orphans >/dev/null
check "source volumes are gone" bash -c "! docker volume ls --format '{{.Name}}' | grep -q '^bos-restore-src_'"

echo "== new, empty environment"
write_test_env bos-restore-dst "$DST"
# New secrets for the new environment, but users keep their passwords
# (the hashes are part of the restored database).
sed -i "s|^TEST_ADMIN_PASSWORD=.*|TEST_ADMIN_PASSWORD=$(admin_password "$SRC")|" "${DST}/env"
t_restore=$(now)
compose "$DST" up -d --wait postgres seaweedfs >/dev/null
compose "$DST" run --rm storage-init >/dev/null
restore() {
  compose_keep_container_paths "$DST" run --rm --no-deps -v "$(native_path "$STAGE"):/restore:ro" backup \
    /opt/backup/restore.sh "/restore/$1" "/restore/$2"
}
# A refused restore must fail for the EXPECTED reason (message of restore.sh),
# not for an unrelated one such as an unreadable input file.
restore_refused_because() {
  local pattern="$1" output
  shift
  if output="$(restore "$@" 2>&1)"; then
    return 1
  fi
  grep -qE "$pattern" <<< "$output"
}

# Negative tests first: nothing may be restored from a broken input.
check "corrupted backup is rejected (decryption or checksum)" \
  restore_refused_because 'reason=(decryption or archive|archive checksum mismatch|file checksum mismatch)' corrupt.tar.age age-identity.txt
check "wrong key is rejected (decryption)" \
  restore_refused_because 'reason=decryption or archive' "$BACKUP_NAME" wrong-identity.txt
check "target still empty after rejected restores" [ "$(psql_value "$DST" "SELECT count(*) FROM pg_tables WHERE schemaname='public'")" = 0 ]

check "restore succeeds" restore "$BACKUP_NAME" age-identity.txt
check "restore into a non-empty database is refused (target not empty)" \
  restore_refused_because 'reason=target database is not empty' "$BACKUP_NAME" age-identity.txt

compose "$DST" up -d --wait --wait-timeout 300 >/dev/null
compose "$DST" cp tls-gateway:/data/caddy/pki/authorities/local/root.crt "${DST}/ca.crt" >/dev/null
RESTORE_SECONDS=$(( $(now) - t_restore ))

echo "== verification"
RESTORED_COUNTS="$(psql_value "$DST" "$COUNT_SQL")"
echo "restored counts: ${RESTORED_COUNTS}"
check "all record counts equal (incl. sessions and migrations)" [ "$SOURCE_COUNTS" = "$RESTORED_COUNTS" ]
check "relations intact (documents -> project -> customer)" [ "$(psql_value "$DST" "SELECT count(*) FROM documents d JOIN projects p ON p.id = d.\"projectId\" JOIN customers c ON c.id = p.\"customerId\" WHERE c.\"customerNumber\" = 'K-4711'")" = 2 ]
migrate_status="$(compose "$DST" run --rm --no-deps migrate ./node_modules/.bin/prisma migrate status 2>&1 || true)"
check "prisma migrate status: schema up to date" grep -q 'Database schema is up to date' <<< "$migrate_status"
ready_after_restore() { [ "$(https "$DST" -o /dev/null -w '%{http_code}' "${API}/health/ready")" = 200 ]; }
check "readiness after restore" ready_after_restore
check "login with the restored account" login "$DST"
for id in "${DOC_IDS[@]}"; do
  authed "$DST" -o "${VAULT}/restored-${id}.pdf" "${API}/documents/${id}/download"
  check "document ${id} downloads with identical SHA-256" [ "$(sha256_of "${VAULT}/restored-${id}.pdf")" = "${FILE_HASH[$id]}" ]
done

cat > "$REPORT" <<EOF
# Restore test $(date -u +%Y-%m-%dT%H:%M:%SZ)

| Item | Value |
|---|---|
| Backup file | ${BACKUP_NAME} (${BACKUP_BYTES} bytes, age-encrypted) |
| Records (users,customers,projects,documents,versions,sessions,migrations) | source ${SOURCE_COUNTS} / restored ${RESTORED_COUNTS} |
| Backup duration | ${BACKUP_SECONDS} s |
| Restore incl. fresh environment start (measured RTO for this data size) | ${RESTORE_SECONDS} s |
| Checks | ${PASSES} passed, ${FAILURES} failed |
EOF
cat "$REPORT"
summary
