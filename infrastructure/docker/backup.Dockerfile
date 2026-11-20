# syntax=docker/dockerfile:1
# Backup / restore / storage-init tooling. Build context: repository root.
# Same PostgreSQL major version as the database (pg_dump must not be older).
FROM postgres:17.11-alpine

# age: file encryption to public recipient keys (private key stays offline).
# rclone: S3 copy/verify for the document bucket. curl: probes.
RUN apk add --no-cache bash coreutils curl tar age rclone \
    && mkdir -p /backups /opt/backup \
    && chown postgres:postgres /backups \
    && chmod 0700 /backups

COPY infrastructure/docker/backup/ /opt/backup/
RUN chmod 0555 /opt/backup/*.sh

USER postgres
WORKDIR /backups
ENTRYPOINT []
CMD ["/opt/backup/backup-scheduler.sh"]
