/**
 * Sprint 3.1: job leases against a real PostgreSQL with two "instances"
 * (two BackgroundJobsService objects with their own connection pools, exactly
 * like two API processes). Barriers are promises; the clock is moved with SQL
 * (what a frozen/partitioned instance looks like to the database), so nothing
 * here waits for real time.
 */
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  BackgroundJobsService,
  JobLeaseLostError,
  type JobContext,
} from '../src/common/jobs/background-jobs.service';
import { PrismaService } from '../src/common/prisma/prisma.service';

const JOB = 'recurring-invoices' as const;

class Gate {
  readonly open: Promise<void>;
  release!: () => void;
  constructor() {
    this.open = new Promise<void>((resolve) => (this.release = resolve));
  }
}

describe('background job leases (two instances, real PostgreSQL)', () => {
  const dbA = new PrismaService();
  const dbB = new PrismaService();
  let a: BackgroundJobsService;
  let b: BackgroundJobsService;

  const row = async () =>
    (
      await dbA.$queryRaw<
        {
          lockedBy: string | null;
          runToken: string | null;
          fence: number;
          lockedUntil: Date | null;
          lastStatus: string | null;
          lastError: string | null;
          consecutiveFailures: number;
        }[]
      >`SELECT "lockedBy","runToken","fence","lockedUntil","lastStatus","lastError","consecutiveFailures"
          FROM "background_job_runs" WHERE "name" = ${JOB}`
    )[0];
  /** Makes the database believe the lease ran out (no heartbeat arrived). */
  const expireLease = () =>
    dbA.$executeRaw`UPDATE "background_job_runs" SET "lockedUntil" = now() - interval '1 second' WHERE "name" = ${JOB}`;

  beforeAll(async () => {
    process.env.BACKGROUND_JOBS = 'all';
    // Timers must never fire inside a test; heartbeats are triggered explicitly.
    process.env.BACKGROUND_JOB_HEARTBEAT_MS = '3600000';
    await dbA.$connect();
    await dbB.$connect();
  });
  afterAll(async () => {
    await a.onModuleDestroy();
    await b.onModuleDestroy();
    await dbA.$disconnect();
    await dbB.$disconnect();
  });
  beforeEach(async () => {
    await a?.onModuleDestroy();
    await b?.onModuleDestroy();
    await dbA.$executeRaw`DELETE FROM "background_job_runs"`;
    a = new BackgroundJobsService(new SchedulerRegistry(), dbA);
    b = new BackgroundJobsService(new SchedulerRegistry(), dbB);
  });

  /** Starts a run that parks on `gate` and hands out its context. */
  async function park(service: BackgroundJobsService, gate: Gate) {
    let context!: JobContext;
    let reached!: () => void;
    const started = new Promise<void>((resolve) => (reached = resolve));
    const finished = service.run(JOB, async (ctx) => {
      context = ctx;
      reached();
      await gate.open;
    });
    await started;
    return { context, finished };
  }

  it('lets exactly one of two simultaneously starting instances run', async () => {
    const gate = new Gate();
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await gate.open;
      running -= 1;
    };
    const runs = [a.run(JOB, task), b.run(JOB, task)];
    // The winner is parked on the gate, so the first run to return is the loser.
    await expect(Promise.race(runs)).resolves.toBe(false);
    gate.release();
    const results = await Promise.all(runs);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(maxRunning).toBe(1);
  });

  it('keeps a long-running job alive: the heartbeat extends the lease and blocks the other instance', async () => {
    const gate = new Gate();
    const { finished } = await park(a, gate);

    // The lease is about to run out ...
    await dbA.$executeRaw`UPDATE "background_job_runs" SET "lockedUntil" = now() + interval '1 second' WHERE "name" = ${JOB}`;
    await a.heartbeatNow(); // ... and the heartbeat extends it
    const extended = (await row()).lockedUntil!.getTime() - Date.now();
    expect(extended).toBeGreaterThan(60_000);

    const task = jest.fn().mockResolvedValue(undefined);
    await expect(b.run(JOB, task)).resolves.toBe(false);
    expect(task).not.toHaveBeenCalled();

    gate.release();
    await finished;
  });

  it('a dead instance (no heartbeat) is replaced after the lease expired; the fencing counter grows', async () => {
    const gate = new Gate();
    const first = await park(a, gate);
    const before = await row();
    await expireLease(); // A froze: no heartbeat reached the database

    const secondGate = new Gate();
    const second = await park(b, secondGate);
    const after = await row();

    expect(after.fence).toBe(before.fence + 1);
    expect(after.runToken).not.toBe(before.runToken);
    expect(after.lockedBy).not.toBe(before.lockedBy);

    // The old run wakes up: its heartbeat is rejected and it is told to stop.
    await a.heartbeatNow();
    expect(first.context.signal.aborted).toBe(true);
    expect(() => first.context.assertLeaseHeld()).toThrow(JobLeaseLostError);

    secondGate.release();
    await second.finished;
    gate.release();
    await first.finished;
  });

  it('a run that lost its lease cannot finish or overwrite the new owner', async () => {
    const gate = new Gate();
    const first = await park(a, gate);
    await expireLease();
    const secondGate = new Gate();
    const second = await park(b, secondGate);
    const ownedByB = await row();

    gate.release(); // A's task returns normally, after having lost the lease
    await first.finished;

    const afterOldFinish = await row();
    expect(afterOldFinish.runToken).toBe(ownedByB.runToken);
    expect(afterOldFinish.lastStatus).toBe('running');
    expect(afterOldFinish.lockedUntil).not.toBeNull();

    secondGate.release();
    await second.finished;
    const done = await row();
    expect(done.lastStatus).toBe('succeeded');
    expect(done.lockedUntil).toBeNull();
    expect(done.runToken).toBeNull();
  });

  it('runFenced commits for the owner and refuses after the lease was taken over', async () => {
    const gate = new Gate();
    const first = await park(a, gate);

    await expect(
      first.context.runFenced(async (tx) => {
        const rows = await tx.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
        return rows[0].ok;
      }),
    ).resolves.toBe(1);

    await expireLease();
    const secondGate = new Gate();
    const second = await park(b, secondGate);

    let sideEffect = false;
    await expect(
      first.context.runFenced(() => {
        sideEffect = true;
        return Promise.resolve();
      }),
    ).rejects.toBeInstanceOf(JobLeaseLostError);
    expect(sideEffect).toBe(false);
    expect(first.context.signal.aborted).toBe(true);

    secondGate.release();
    await second.finished;
    gate.release();
    await first.finished;
  });

  it('a failing job releases the lease, counts the failure and can be re-run at once', async () => {
    await expect(
      a.run(JOB, () => Promise.reject(new TypeError('boom'))),
    ).resolves.toBe(true);
    const failed = await row();
    expect(failed.lastStatus).toBe('failed');
    expect(failed.lastError).toBe('TypeError');
    expect(failed.consecutiveFailures).toBe(1);
    expect(failed.lockedUntil).toBeNull();

    await expect(b.run(JOB, () => Promise.resolve())).resolves.toBe(true);
    const ok = await row();
    expect(ok.lastStatus).toBe('succeeded');
    expect(ok.consecutiveFailures).toBe(0);
  });

  it('shutdown aborts a running job, releases the lease at once and leaves no active run', async () => {
    const gate = new Gate();
    const first = await park(a, gate);
    const stopped = new Promise<void>((resolve) =>
      first.context.signal.addEventListener('abort', () => resolve(), {
        once: true,
      }),
    );

    // The job cooperates: it stops when told to.
    const destroying = a.onModuleDestroy();
    await stopped;
    gate.release();
    await destroying;
    await first.finished;

    expect(a.activeRunCount()).toBe(0);
    const released = await row();
    expect(released.lastStatus).toBe('interrupted');
    expect(released.lockedUntil).toBeNull();
    // A new run is refused during shutdown ...
    await expect(a.run(JOB, () => Promise.resolve())).resolves.toBe(false);
    // ... and another instance continues without waiting for the TTL.
    await expect(b.run(JOB, () => Promise.resolve())).resolves.toBe(true);
  });

  it('assertLeaseHeld passes for the owner and keeps passing after heartbeats', async () => {
    const gate = new Gate();
    const first = await park(a, gate);
    expect(() => first.context.assertLeaseHeld()).not.toThrow();
    await a.heartbeatNow();
    await a.heartbeatNow();
    expect(() => first.context.assertLeaseHeld()).not.toThrow();
    gate.release();
    await first.finished;
    expect(a.activeRunCount()).toBe(0);
  });
});
