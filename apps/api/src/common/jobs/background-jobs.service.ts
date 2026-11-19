import {
  Global,
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { hostname } from 'os';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertBackgroundJobConfig,
  BACKGROUND_JOBS,
  getEnabledJobs,
  isJobName,
  type JobName,
} from './background-jobs.config';

const MAX_ERROR_LENGTH = 300;

/**
 * Applies the background job configuration and runs jobs safely:
 *
 * - On bootstrap every registered cron is checked against the catalogue;
 *   disabled ones are removed from the scheduler, so they cannot fire until
 *   the configuration changes and the process restarts.
 * - `run()` takes a cluster-wide lease in `background_job_runs` before a job
 *   executes. With several API instances only one runs a given job at a time;
 *   the lease expires after the job's leaseSeconds if an instance dies.
 * - Every run records status, timestamps and a short error text (no stack,
 *   no data) for monitoring.
 */
@Injectable()
export class BackgroundJobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('BackgroundJobs');
  /** Identifies this process in the lease table. */
  private readonly instanceId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

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

  /**
   * Runs `task` if this instance obtains the job's lease. Never throws, so a
   * failing job cannot crash the scheduler. Returns whether it ran.
   */
  async run(name: JobName, task: () => Promise<void>): Promise<boolean> {
    if (!getEnabledJobs().has(name)) {
      this.logger.warn(`job=${name} status=skipped reason=disabled`);
      return false;
    }
    if (!(await this.acquireLease(name))) {
      this.logger.log(`job=${name} status=skipped reason=running-elsewhere`);
      return false;
    }

    const startedAt = Date.now();
    try {
      await task();
      await this.finish(name, 'succeeded', null);
      this.logger.log(
        `job=${name} status=succeeded durationMs=${Date.now() - startedAt}`,
      );
    } catch (error) {
      const message = (error instanceof Error ? error.name : 'Error').slice(
        0,
        MAX_ERROR_LENGTH,
      );
      await this.finish(name, 'failed', message).catch(() => undefined);
      this.logger.error(
        `job=${name} status=failed durationMs=${Date.now() - startedAt} error=${message}`,
      );
    }
    return true;
  }

  private async acquireLease(name: JobName): Promise<boolean> {
    const leaseSeconds = BACKGROUND_JOBS[name].leaseSeconds;
    // One statement: insert, or take over an expired lease. Concurrent
    // instances serialise on the primary key; exactly one gets a row back.
    const rows = await this.prisma.$queryRaw<{ name: string }[]>`
      INSERT INTO "background_job_runs" ("name", "lockedUntil", "lockedBy", "lastStartedAt", "lastStatus", "updatedAt")
      VALUES (${name}, now() + make_interval(secs => ${leaseSeconds}), ${this.instanceId}, now(), 'running', now())
      ON CONFLICT ("name") DO UPDATE
        SET "lockedUntil" = EXCLUDED."lockedUntil",
            "lockedBy" = EXCLUDED."lockedBy",
            "lastStartedAt" = now(),
            "lastStatus" = 'running',
            "updatedAt" = now()
        WHERE "background_job_runs"."lockedUntil" IS NULL
           OR "background_job_runs"."lockedUntil" < now()
      RETURNING "name"`;
    return rows.length === 1;
  }

  private async finish(
    name: JobName,
    status: 'succeeded' | 'failed',
    error: string | null,
  ) {
    await this.prisma.$executeRaw`
      UPDATE "background_job_runs"
         SET "lockedUntil" = NULL,
             "lockedBy" = NULL,
             "lastFinishedAt" = now(),
             "lastStatus" = ${status},
             "lastError" = ${error},
             "consecutiveFailures" = CASE WHEN ${status} = 'failed' THEN "consecutiveFailures" + 1 ELSE 0 END,
             "lastSucceededAt" = CASE WHEN ${status} = 'succeeded' THEN now() ELSE "lastSucceededAt" END,
             "updatedAt" = now()
       WHERE "name" = ${name} AND "lockedBy" = ${this.instanceId}`;
  }
}

@Global()
@Module({
  providers: [BackgroundJobsService],
  exports: [BackgroundJobsService],
})
export class BackgroundJobsModule {}
