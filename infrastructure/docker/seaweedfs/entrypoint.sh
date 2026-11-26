#!/bin/sh
# Starts a single-node SeaweedFS with only the S3 gateway reachable from the
# (internal) network. Identities come from the environment and are written
# to a private file at start; nothing secret is stored in the image or repo.
#
#   admin  : full rights (bucket creation by storage-init, restore)
#   api    : read/write/list/delete on the document bucket only
#   backup : read/list on the document bucket only
set -eu
umask 077

: "${S3_BUCKET:?}" "${S3_ADMIN_ACCESS_KEY:?}" "${S3_ADMIN_SECRET_KEY:?}"
: "${S3_ACCESS_KEY:?}" "${S3_SECRET_KEY:?}"
: "${S3_BACKUP_ACCESS_KEY:?}" "${S3_BACKUP_SECRET_KEY:?}"

config=/tmp/s3-identities.json
cat > "$config" <<EOF
{
  "identities": [
    {
      "name": "admin",
      "credentials": [{ "accessKey": "${S3_ADMIN_ACCESS_KEY}", "secretKey": "${S3_ADMIN_SECRET_KEY}" }],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"]
    },
    {
      "name": "api",
      "credentials": [{ "accessKey": "${S3_ACCESS_KEY}", "secretKey": "${S3_SECRET_KEY}" }],
      "actions": ["Read:${S3_BUCKET}", "Write:${S3_BUCKET}", "List:${S3_BUCKET}", "Tagging:${S3_BUCKET}"]
    },
    {
      "name": "backup",
      "credentials": [{ "accessKey": "${S3_BACKUP_ACCESS_KEY}", "secretKey": "${S3_BACKUP_SECRET_KEY}" }],
      "actions": ["Read:${S3_BUCKET}", "List:${S3_BUCKET}"]
    }
  ]
}
EOF

exec weed server \
  -dir=/data \
  -ip=seaweedfs \
  -ip.bind=0.0.0.0 \
  -volume.max=0 \
  -master.volumeSizeLimitMB=1024 \
  -s3 \
  -s3.port=8333 \
  -s3.config="$config"
