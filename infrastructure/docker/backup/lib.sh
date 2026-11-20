#!/usr/bin/env bash
# Shared helpers for backup, restore and storage initialisation.
# Never prints secrets: credentials only travel in environment variables.
set -euo pipefail
umask 077

log() {
  printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${LOG_COMPONENT:-backup}" "$*"
}

fail() {
  log "status=failed reason=$*"
  exit 1
}

require_env() {
  local name
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      fail "missing environment variable ${name}"
    fi
  done
}

# rclone remotes are configured purely through the environment (no config
# file with credentials on disk).
# Usage: configure_s3_remote NAME KEYVAR SECRETVAR [admin]
configure_s3_remote() {
  local remote="$1" key_var="$2" secret_var="$3"
  local upper
  upper="$(printf '%s' "$remote" | tr '[:lower:]' '[:upper:]')"
  export "RCLONE_CONFIG_${upper}_TYPE=s3"
  export "RCLONE_CONFIG_${upper}_PROVIDER=${S3_PROVIDER:-SeaweedFS}"
  export "RCLONE_CONFIG_${upper}_ENDPOINT=${S3_ENDPOINT}"
  export "RCLONE_CONFIG_${upper}_REGION=${S3_REGION:-us-east-1}"
  export "RCLONE_CONFIG_${upper}_ACCESS_KEY_ID=${!key_var}"
  export "RCLONE_CONFIG_${upper}_SECRET_ACCESS_KEY=${!secret_var}"
  export "RCLONE_CONFIG_${upper}_FORCE_PATH_STYLE=true"
  # Identities without bucket-admin rights must not try to create buckets;
  # the admin remote (init, restore) needs mkdir to really create them.
  if [ "${4:-}" != admin ]; then
    export "RCLONE_CONFIG_${upper}_NO_CHECK_BUCKET=true"
  fi
}

# Storage keys referenced by document versions inside a pg_dump custom file.
# Reads the COPY block of public.document_versions and prints the storageKey
# column, one key per line.
storage_keys_from_dump() {
  local dump="$1"
  pg_restore --data-only --table=document_versions --file=- "$dump" | awk -F'\t' '
    /^COPY public\.document_versions / {
      header = $0
      sub(/^[^(]*\(/, "", header)
      sub(/\) FROM stdin;$/, "", header)
      n = split(header, cols, ", ")
      for (i = 1; i <= n; i++) {
        name = cols[i]
        gsub(/"/, "", name)
        if (name == "storageKey") column = i
      }
      inside = 1
      next
    }
    inside && $0 == "\\." { inside = 0; next }
    inside && column { print $column }
  '
}
