#!/usr/bin/env bash
# Runs backup.sh every BACKUP_INTERVAL_HOURS (default 24). A failed run is
# retried after BACKUP_RETRY_MINUTES (default 60). Monitoring reads the
# `last-success` file in the backup volume to judge the backup age.
LOG_COMPONENT=backup-scheduler
source /opt/backup/lib.sh

interval=$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))
retry=$(( ${BACKUP_RETRY_MINUTES:-60} * 60 ))
log "status=scheduled intervalHours=${BACKUP_INTERVAL_HOURS:-24}"

# Wait for the first slot without running at container start (restarts must
# not hammer the database).
sleep "${BACKUP_INITIAL_DELAY_SECONDS:-600}"
while true; do
  if /opt/backup/backup.sh; then
    sleep "$interval"
  else
    log "status=retry-scheduled inMinutes=$(( retry / 60 ))"
    sleep "$retry"
  fi
done
