-- Sprint 3.1: job leases with an owner token, heartbeat and fencing counter.
-- Additive only; existing rows keep working (token NULL = no live owner).
ALTER TABLE "background_job_runs"
    ADD COLUMN "runToken" TEXT,
    ADD COLUMN "fence" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);
