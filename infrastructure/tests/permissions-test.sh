#!/usr/bin/env bash
# Regression test for the permission model of backup files.
#
# Background: the backup container runs as uid 70 (postgres) with umask 077, so
# its files are 0600 / owned by uid 70. A CI runner or operator (an
# unprivileged host user) cannot read them. An earlier test read them straight
# from the host and failed with "Permission denied" on Linux, while it passed
# on Windows/macOS, where Docker Desktop bind mounts do not enforce Unix
# permissions.
#
# This test runs on REAL Linux filesystems (Docker volumes), on any host OS:
#   1. the product's hand-over snippet gives a directory to uid 70 (0700);
#   2. files written by uid 70 are 0600 and stay unreadable for an unprivileged
#      user (the original failure, reproduced), but readable for uid 70;
#   3. the stage hand-over turns host-owned 644/777 leftovers into 0700/0600
#      owned by uid 70 and never opens anything up;
#   4. `docker cp` returns a readable, host-owned copy (how the restore test
#      moves archives out);
#   5. none of the infrastructure scripts widens backup permissions.
#
#   BACKUP_IMAGE=bissinger-os/backup:ci infrastructure/tests/permissions-test.sh
source "$(dirname "$0")/lib.sh"

: "${BACKUP_IMAGE:?}"
RUNNER_UID=1001 # stands in for the unprivileged CI runner / operator
SUFFIX="$$"
VOL_BACKUPS="bos-perm-backups-${SUFFIX}"
VOL_STAGE="bos-perm-stage-${SUFFIX}"
HOLDER="bos-perm-holder-${SUFFIX}"
SCRATCH="$(mktemp -d)"

cleanup() {
  docker rm -f "$HOLDER" >/dev/null 2>&1 || true
  docker volume rm -f "$VOL_BACKUPS" "$VOL_STAGE" >/dev/null 2>&1 || true
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

docker volume create "$VOL_BACKUPS" >/dev/null
docker volume create "$VOL_STAGE" >/dev/null

# as_uid <uid> <volume> <sh snippet>: run as that user with the volume at /d.
as_uid() {
  local uid="$1" volume="$2" snippet="$3"
  MSYS_NO_PATHCONV=1 docker run --rm --user "$uid" --entrypoint sh \
    -v "${volume}:/d" "$BACKUP_IMAGE" -c "$snippet"
}
# Same snippet the product uses; strict because a Docker volume is real Linux.
hand_over() { root_helper "$1" "$(backup_dir_prepare_cmd 1)"; }

echo "== directory handed to the backup user (as hand_to_backup_user does)"
check "hand-over succeeds on an empty volume" hand_over "$VOL_BACKUPS"
check "directory is 0700 and owned by uid ${BACKUP_UID}" \
  test "$(as_uid 0 "$VOL_BACKUPS" 'stat -c %a:%u /d')" = "700:${BACKUP_UID}"

echo "== files written by the backup user"
check "backup user writes archive and checksum with umask 077" \
  as_uid "$BACKUP_UID" "$VOL_BACKUPS" 'umask 077; echo secret > /d/bissinger-os-1.tar.age; echo sum > /d/bissinger-os-1.tar.age.sha256'
check "archive is 0600 owned by uid ${BACKUP_UID} (not 644/777)" \
  test "$(as_uid 0 "$VOL_BACKUPS" 'stat -c %a:%u /d/bissinger-os-1.tar.age')" = "600:${BACKUP_UID}"
check "backup user can read its own archive" \
  test "$(as_uid "$BACKUP_UID" "$VOL_BACKUPS" 'cat /d/bissinger-os-1.tar.age')" = secret

# The original CI failure: an unprivileged user must be refused ...
denied_message="$(as_uid "$RUNNER_UID" "$VOL_BACKUPS" 'head -c 1 /d/bissinger-os-1.tar.age' 2>&1 || true)"
check "unprivileged user cannot read the archive (Permission denied)" grep -qi 'permission denied' <<< "$denied_message"
listing_message="$(as_uid "$RUNNER_UID" "$VOL_BACKUPS" 'ls /d' 2>&1 || true)"
check "unprivileged user cannot list the backup directory" grep -qi 'permission denied' <<< "$listing_message"
write_message="$(as_uid "$RUNNER_UID" "$VOL_BACKUPS" 'echo x > /d/planted' 2>&1 || true)"
check "unprivileged user cannot write into the backup directory" grep -qi 'permission denied' <<< "$write_message"

echo "== stage hand-over (restore test inputs)"
# Simulate what `compose cp` and the test leave behind: host-owned, too open.
root_helper "$VOL_STAGE" 'set -e; echo a > /d/archive.tar.age; echo k > /d/identity.txt; mkdir /d/sub; echo b > /d/sub/inner; chown -R 1001:1001 /d; chmod 777 /d /d/sub; chmod 644 /d/archive.tar.age /d/sub/inner; chmod 666 /d/identity.txt'
check "hand-over of host-owned, world-accessible files succeeds" hand_over "$VOL_STAGE"
stage_modes="$(as_uid 0 "$VOL_STAGE" 'stat -c "%n %a:%u" /d /d/archive.tar.age /d/identity.txt /d/sub /d/sub/inner')"
echo "$stage_modes" | sed 's/^/    /'
check "directories are 0700, files 0600, all owned by uid ${BACKUP_UID}" \
  test "$stage_modes" = "$(printf '%s\n' "/d 700:${BACKUP_UID}" "/d/archive.tar.age 600:${BACKUP_UID}" "/d/identity.txt 600:${BACKUP_UID}" "/d/sub 700:${BACKUP_UID}" "/d/sub/inner 600:${BACKUP_UID}")"
unreadable_message="$(as_uid "$RUNNER_UID" "$VOL_STAGE" 'cat /d/identity.txt' 2>&1 || true)"
check "the identity file is no longer readable for others" grep -qi 'permission denied' <<< "$unreadable_message"
check "the backup user (restore container) can read the stage" \
  test "$(as_uid "$BACKUP_UID" "$VOL_STAGE" 'cat /d/archive.tar.age')" = a

echo "== docker cp: how the restore test takes archives out"
docker create --name "$HOLDER" -v "${VOL_BACKUPS}:/backups" "$BACKUP_IMAGE" true >/dev/null
check "docker cp copies the 0600 archive out" \
  env MSYS_NO_PATHCONV=1 docker cp "${HOLDER}:/backups/bissinger-os-1.tar.age" "$(native_path "${SCRATCH}/copy.tar.age")"
check "the host user can read the copy" test "$(cat "${SCRATCH}/copy.tar.age")" = secret
if [ "$(uname -s)" = Linux ] && [ "$(id -u)" != 0 ]; then
  check "the copy is host-owned and keeps mode 0600" \
    test "$(stat -c %a:%u "${SCRATCH}/copy.tar.age")" = "600:$(id -u)"
else
  echo "SKIP  copy ownership check (needs an unprivileged Linux host)"
fi

echo "== infrastructure scripts never widen backup permissions"
no_widening() {
  ! grep -nE 'chmod[^#]*(0?777|0?666|0?644|a\+r|o\+r|a\+w|o\+w)' \
    "${ROOT}/infrastructure/tests/lib.sh" \
    "${ROOT}/infrastructure/tests/staging-smoke.sh" \
    "${ROOT}/infrastructure/tests/restore-test.sh" \
    "${ROOT}/infrastructure/scripts/staging.sh" \
    "${ROOT}"/infrastructure/docker/backup/*.sh
}
check "no chmod 777/666/644 or o+r in test, ops or backup scripts" no_widening

summary
