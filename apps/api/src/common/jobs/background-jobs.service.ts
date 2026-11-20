import {
  Global,
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { hostname } from 'os';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertBackgroundJobConfig,
  BACKGROUND_JOBS,
  getEnabledJobs,
  HEARTBEAT_INTERVAL_MS,
  isJobName,
  SHUTDOWN_GRACE_MS,
  type JobName,
} from './background-jobs.config';

const MAX_ERROR_LENGTH = 300;

/** The job no longer (provably) owns its lease and must stop. */
export class JobLeaseLostError extends Error {
  constructor(name: string) {
    super(`Lease of job ${name} lost`);
    this.name = 'JobLeaseLostError';
  }
}

/** What a running job gets from the service. */
export interface JobContext {
  /** Aborted when the lease is lost or the process shuts down. */
  readonly signal: AbortSignal;
  /** Random per run; the only credential for renewing or finishing the lease. */
  readonly runToken: string;
  /** Fencing counter of this acquisition (grows with every takeover). */
  readonly fence: number;
  /** Throws JobLeaseLostError once the lease is lost / the run is aborted. */
  assertLeaseHeld(): void;
  /**
   * Runs `work` in ONE short database transaction that first proves, under a
   * row lock, that this run still owns the lease. While the transaction is
   * open no other instance can take the lease over, so a side effect written
   * here can never come from a run that has already been replaced.
   */
  runFenced<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}

interface ActiveRun {
  name: JobName;
  token: string;
  fence: number;
  controller: AbortController;
  /** performance.now() until which the lease is certainly ours (conservative). */
  safeUntil: number;
  lost: boolean;
  stopReason: 'lease-lost' | 'shutdown' | null;
  timer: NodeJS.Timeout | null;
  heartbeat: Promise<void> | null;
  done: Promise<void>;
}

/**
 * Applies the background job configuration and runs jobs safely:
 *
 * - On bootstrap every registered cron is checked against the catalogue;
 *   disabled ones are removed from the scheduler, so they cannot fire until
 *   the configuration changes and the process restarts.
 * - `run()` takes a cluster-wide lease in `background_job_runs` before a job
 *   executes (one atomic statement). Every run has its own random token. While
 *   it runs, a heartbeat extends the lease; only the token holder can extend or
 *   finish it. A run that cannot prove ownership any more (heartbeat rejected,
 *   or the database unreachable for longer than the lease) is told to stop via
 *   `signal` and must not produce further side effects (`assertLeaseHeld`,
 *   `runFenced`).
 * - A crashed or frozen instance stops sending heartbeats; after the lease TTL
 *   another instance takes the job over.
 * - Every run records status, timestamps and a short error text (no stack,
 *   no data) for monitoring.
 *
 * Not exactly-once: a job can still be re-run after a takeover. The business
 * jobs therefore make their side effects idempotent (see
 * docs/security/sprint-3-1-hardening.md).
 */
@Injectable()
export class BackgroundJobsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger('BackgroundJobs');
  /** Identifies this process in the lease table. */
  private readonly instanceId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private readonly active = new Set<ActiveRun>();
  private shuttingDown = false;

  constructor(
    private readonly scheduler: SchedulerRegistry,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap() {
    // Staging safety (no business jobs, no AI key, no IMAP, mail capture only).
    assertBackgroundJobConfig();
    const enabled = getEnabledJobs();
    const active: string[] = [];
    const disabled: string[] = [];

    for (const name of this.scheduler.getCronJobs().keys()) {
      if (!isJobName(name)) {
        throw new Error(
          `Cron job "${name}" is not in the background job catalogue (background-jobs.config.ts).`,
        );
      }
      if (enabled.has(name)) {
        active.push(name);
      } else {
        this.scheduler.deleteCronJob(name);
        disabled.push(name);
      }
    }
    this.logger.log(
      `Background jobs active: [${active.join(', ') || '-'}], disabled: [${disabled.join(', ') || '-'}]`,
    );
  }

  /** Names of the cron jobs that are currently scheduled in this process. */
  scheduledJobs(): string[] {
    return [...this.scheduler.getCronJobs().keys()];
  }

  /** Number of runs of this process that currently hold a lease. */
  activeRunCount() {
    return this.active.size;
  }

  /**
   * Stops accepting runs, tells running jobs to stop, waits a bounded time for
   * them and releases their leases (status "interrupted") so another instance
   * can continue at once instead of waiting for the TTL.
   */
  async onModuleDestroy() {
    this.shuttingDown = true;
    const runs = [...this.active];
    for (const run of runs) {
      this.abort(run, 'shutdown');
    }
    if (runs.length === 0) return;
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.allSettled(runs.map((run) => run.done)),
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, SHUTDOWN_GRACE_MS);
          timeout.unref();
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      for (const run of runs) this.stopTimer(run);
    }
  }

  /**
   * Runs `task` if this instance obtains the job's lease. Never throws, so a
   * failing job cannot crash the scheduler. Returns whether it ran.
   */
  async run(
    name: JobName,
    task: (context: JobContext) => Promise<void>,
  ): Promise<boolean> {
    if (this.shuttingDown) {
      this.logger.warn(`job=${name} status=skipped reason=shutting-down`);
      return false;
    }
    if (!getEnabledJobs().has(name)) {
      this.logger.warn(`job=${name} status=skipped reason=disabled`);
      return false;
    }
    const token = randomUUID();
    const requestedAt = performance.now();
    let acquired: Acquired | null;
    try {
      acquired = await this.acquireLease(name, token);
    } catch (error) {
      this.logger.error(
        `job=${name} status=skipped reason=lease-unavailable error=${errorName(error)}`,
      );
      return false;
    }
    if (!acquired) {
      this.logger.log(`job=${name} status=skipped reason=running-elsewhere`);
      return false;
    }
    if (acquired.previousOwner) {
      this.logger.warn(
        `job=${name} status=took-over reason=expired-lease previousOwner=${acquired.previousOwner} fence=${acquired.fence}`,
      );
    }

    let finishRun!: () => void;
    const run: ActiveRun = {
      name,
      token,
      fence: acquired.fence,
      controller: new AbortController(),
      safeUntil: requestedAt + leaseMs(name),
      lost: false,
      stopReason: null,
      timer: null,
      heartbeat: null,
      done: new Promise<void>((resolve) => (finishRun = resolve)),
    };
    this.active.add(run);
    this.scheduleHeartbeat(run);

    const startedAt = Date.now();
    let outcome: 'succeeded' | 'failed' | 'interrupted' | 'lease-lost';
    let message: string | null = null;
    try {
      await task(this.contextFor(run));
      outcome = this.outcomeIfStopped(run) ?? 'succeeded';
    } catch (error) {
      outcome = this.outcomeIfStopped(run) ?? 'failed';
      message = errorName(error);
    } finally {
      await this.stopHeartbeat(run);
    }

    try {
      const finished = await this.finish(run, outcome, message);
      const duration = Date.now() - startedAt;
      if (!finished) {
        this.logger.error(
          `job=${name} status=${outcome} finish=skipped reason=lease-lost durationMs=${duration} fence=${run.fence}`,
        );
      } else if (outcome === 'succeeded') {
        this.logger.log(`job=${name} status=succeeded durationMs=${duration}`);
      } else {
        this.logger.error(
          `job=${name} status=${outcome} durationMs=${duration} error=${message ?? '-'}`,
        );
      }
    } catch (error) {
      // The lease then simply expires after its TTL.
      this.logger.error(
        `job=${name} status=${outcome} finish=failed error=${errorName(error)}`,
      );
    } finally {
      this.active.delete(run);
      finishRun();
    }
    return true;
  }

  private outcomeIfStopped(run: ActiveRun) {
    if (run.stopReason === 'shutdown') return 'interrupted' as const;
    if (run.lost) return 'lease-lost' as const;
    return null;
  }

  private contextFor(run: ActiveRun): JobContext {
    const assertLeaseHeld = () => {
      if (run.lost || run.controller.signal.aborted) {
        throw new JobLeaseLostError(run.name);
      }
      if (performance.now() >= run.safeUntil) {
        // Could not renew for longer than the lease: another instance may own
        // the job by now.
        this.abort(run, 'lease-lost');
        throw new JobLeaseLostError(run.name);
      }
    };
    return {
      signal: run.controller.signal,
      runToken: run.token,
      fence: run.fence,
      assertLeaseHeld,
      runFenced: async (work) => {
        assertLeaseHeld();
        return this.prisma.$transaction(
          async (tx) => {
            const rows = await tx.$queryRaw<{ one: number }[]>`
              SELECT 1 AS one FROM "background_job_runs"
               WHERE "name" = ${run.name}
                 AND "runToken" = ${run.token}
                 AND "lockedUntil" > now()
                 FOR SHARE`;
            if (rows.length !== 1) {
              this.abort(run, 'lease-lost');
              throw new JobLeaseLostError(run.name);
            }
            return work(tx);
          },
          { timeout: 30_000, maxWait: 10_000 },
        );
      },
    };
  }

  private abort(run: ActiveRun, reason: 'lease-lost' | 'shutdown') {
    if (run.stopReason === null) {
      run.stopReason = reason;
    }
    if (reason === 'lease-lost') run.lost = true;
    this.stopTimer(run);
    if (!run.controller.signal.aborted) {
      run.controller.abort(new JobLeaseLostError(run.name));
    }
  }

  // --- heartbeat -----------------------------------------------------------

  private heartbeatIntervalMs() {
    const configured = Number(process.env.BACKGROUND_JOB_HEARTBEAT_MS);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : HEARTBEAT_INTERVAL_MS;
  }

  /** One timer at a time per run; the next one is armed after a beat ended. */
  private scheduleHeartbeat(run: ActiveRun) {
    if (run.lost || run.stopReason === 'shutdown') return;
    const timer = setTimeout(() => {
      run.timer = null;
      run.heartbeat = this.beat(run).finally(() => {
        run.heartbeat = null;
        this.scheduleHeartbeat(run);
      });
    }, this.heartbeatIntervalMs());
    // A heartbeat must never keep the process alive.
    timer.unref();
    run.timer = timer;
  }

  private stopTimer(run: ActiveRun) {
    if (run.timer) {
      clearTimeout(run.timer);
      run.timer = null;
    }
  }

  private async stopHeartbeat(run: ActiveRun) {
    this.stopTimer(run);
    // A beat that is already on its way must not run into the finish statement.
    await run.heartbeat?.catch(() => undefined);
    this.stopTimer(run);
  }

  /**
   * Extends the lease of every active run of this process now. The timers do
   * the same on a schedule; this is the deterministic entry point for tests and
   * for a caller that wants a lease extended before a long step.
   */
  async heartbeatNow(): Promise<void> {
    await Promise.all([...this.active].map((run) => this.beat(run)));
  }

  /** One renewal. Never throws; decides whether the run may continue. */
  private async beat(run: ActiveRun): Promise<void> {
    if (run.lost) return;
    const requestedAt = performance.now();
    const ttl = BACKGROUND_JOBS[run.name].leaseSeconds;
    try {
      const rows = await this.prisma.$queryRaw<{ fence: number }[]>`
        UPDATE "background_job_runs"
           SET "lockedUntil" = now() + make_interval(secs => ${ttl}),
               "lastHeartbeatAt" = now(),
               "updatedAt" = now()
         WHERE "name" = ${run.name} AND "runToken" = ${run.token}
        RETURNING "fence"`;
      if (rows.length !== 1) {
        // Somebody else holds the job now (or the row was reset).
        this.logger.error(
          `job=${run.name} status=lease-lost reason=heartbeat-rejected fence=${run.fence}`,
        );
        this.abort(run, 'lease-lost');
        return;
      }
      // The database counted the TTL from (at least) the request start, so
      // this local deadline is never later than the real one.
      run.safeUntil = requestedAt + ttl * 1000;
    } catch (error) {
      this.logger.warn(
        `job=${run.name} status=heartbeat-failed error=${errorName(error)}`,
      );
      if (performance.now() >= run.safeUntil) {
        this.logger.error(
          `job=${run.name} status=lease-lost reason=heartbeat-timeout fence=${run.fence}`,
        );
        this.abort(run, 'lease-lost');
      }
    }
  }

  // --- lease statements ----------------------------------------------------

  private async acquireLease(
    name: JobName,
    token: string,
  ): Promise<Acquired | null> {
    const leaseSeconds = BACKGROUND_JOBS[name].leaseSeconds;
    // One statement: insert, or take over an expired lease. Concurrent
    // instances serialise on the primary key; exactly one gets a row back.
    const rows = await this.prisma.$queryRaw<
      { fence: number; previousOwner: string | null }[]
    >`
      WITH previous AS (
        SELECT "lockedBy", "lockedUntil" FROM "background_job_runs" WHERE "name" = ${name}
      )
      INSERT INTO "background_job_runs"
        ("name", "lockedUntil", "lockedBy", "runToken", "fence", "lastHeartbeatAt", "lastStartedAt", "lastStatus", "updatedAt")
      VALUES (${name}, now() + make_interval(secs => ${leaseSeconds}), ${this.instanceId}, ${token}, 1, now(), now(), 'running', now())
      ON CONFLICT ("name") DO UPDATE
        SET "lockedUntil" = EXCLUDED."lockedUntil",
            "lockedBy" = EXCLUDED."lockedBy",
            "runToken" = EXCLUDED."runToken",
            "fence" = "background_job_runs"."fence" + 1,
            "lastHeartbeatAt" = now(),
            "lastStartedAt" = now(),
            "lastStatus" = 'running',
            "updatedAt" = now()
        WHERE "background_job_runs"."lockedUntil" IS NULL
           OR "background_job_runs"."lockedUntil" < now()
      RETURNING "fence",
        (SELECT "lockedBy" FROM previous WHERE "lockedUntil" IS NOT NULL) AS "previousOwner"`;
    return rows.length === 1
      ? { fence: rows[0].fence, previousOwner: rows[0].previousOwner }
      : null;
  }

  /** Finishes the run. Returns false when this run no longer owns the lease. */
  private async finish(
    run: ActiveRun,
    outcome: 'succeeded' | 'failed' | 'interrupted' | 'lease-lost',
    error: string | null,
  ): Promise<boolean> {
    const status = outcome === 'lease-lost' ? 'failed' : outcome; // stored values: succeeded|failed|interrupted
    const recordedError =
      outcome === 'lease-lost' ? 'JobLeaseLostError' : error;
    const rows = await this.prisma.$queryRaw<{ name: string }[]>`
      UPDATE "background_job_runs"
         SET "lockedUntil" = NULL,
             "lockedBy" = NULL,
             "runToken" = NULL,
             "lastFinishedAt" = now(),
             "lastStatus" = ${status},
             "lastError" = ${recordedError},
             "consecutiveFailures" = CASE
                WHEN ${status} = 'failed' THEN "consecutiveFailures" + 1
                WHEN ${status} = 'succeeded' THEN 0
                ELSE "consecutiveFailures" END,
             "lastSucceededAt" = CASE WHEN ${status} = 'succeeded' THEN now() ELSE "lastSucceededAt" END,
             "updatedAt" = now()
       WHERE "name" = ${run.name} AND "runToken" = ${run.token}
      RETURNING "name"`;
    return rows.length === 1;
  }
}

interface Acquired {
  fence: number;
  previousOwner: string | null;
}

function leaseMs(name: JobName) {
  return BACKGROUND_JOBS[name].leaseSeconds * 1000;
}

function errorName(error: unknown) {
  return (error instanceof Error ? error.name : 'Error').slice(
    0,
    MAX_ERROR_LENGTH,
  );
}

@Global()
@Module({
  providers: [BackgroundJobsService],
  exports: [BackgroundJobsService],
})
export class BackgroundJobsModule {}
