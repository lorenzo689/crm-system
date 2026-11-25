import { SchedulerRegistry } from '@nestjs/schedule';
import {
  assertBackgroundJobConfig,
  BACKGROUND_JOBS,
  getEnabledJobs,
  JOB_NAMES,
} from './background-jobs.config';
import { BackgroundJobsService } from './background-jobs.service';

const env = (values: Record<string, string | undefined>) =>
  values as unknown as NodeJS.ProcessEnv;

describe('background job configuration', () => {
  it('keeps every job enabled by default outside staging (unchanged behaviour)', () => {
    expect([...getEnabledJobs(env({}))].sort()).toEqual([...JOB_NAMES].sort());
  });

  it('defaults to maintenance jobs only on staging', () => {
    expect([...getEnabledJobs(env({ APP_ENV: 'staging' }))]).toEqual([
      'session-purge',
    ]);
  });

  it('supports none, maintenance and explicit lists', () => {
    expect(getEnabledJobs(env({ BACKGROUND_JOBS: 'none' })).size).toBe(0);
    expect([
      ...getEnabledJobs(env({ BACKGROUND_JOBS: 'maintenance' })),
    ]).toEqual(['session-purge']);
    expect([
      ...getEnabledJobs(env({ BACKGROUND_JOBS: 'session-purge, ai-agents' })),
    ]).toEqual(['session-purge', 'ai-agents']);
  });

  it('rejects unknown job names', () => {
    expect(() =>
      getEnabledJobs(env({ BACKGROUND_JOBS: 'session-purge,mystery' })),
    ).toThrow(/unknown job "mystery"/);
  });

  it('classifies every external integration as a business job', () => {
    for (const name of JOB_NAMES) {
      const job = BACKGROUND_JOBS[name];
      if (job.external) expect(job.kind).toBe('business');
    }
  });

  describe('staging guard', () => {
    const staging = { APP_ENV: 'staging', SMTP_HOST: 'mailpit' };
    it.each([
      'all',
      'inbox-poll',
      'ai-agents',
      'recurring-invoices',
      'calendar-reminders',
    ])('refuses BACKGROUND_JOBS=%s', (value) => {
      expect(() =>
        assertBackgroundJobConfig(env({ ...staging, BACKGROUND_JOBS: value })),
      ).toThrow(/must not enable business jobs/);
    });

    it('refuses an AI key, IMAP, an external SMTP host and SMTP credentials', () => {
      expect(() =>
        assertBackgroundJobConfig(
          env({ ...staging, ANTHROPIC_API_KEY: 'sk-x' }),
        ),
      ).toThrow(/ANTHROPIC_API_KEY/);
      expect(() =>
        assertBackgroundJobConfig(
          env({ ...staging, IMAP_HOST: 'imap.example.com' }),
        ),
      ).toThrow(/IMAP_HOST/);
      expect(() =>
        assertBackgroundJobConfig(
          env({ ...staging, SMTP_HOST: 'smtp.example.com' }),
        ),
      ).toThrow(/internal capture service/);
      expect(() =>
        assertBackgroundJobConfig(env({ ...staging, SMTP_USER: 'u' })),
      ).toThrow(/SMTP credentials/);
    });

    it('accepts the intended staging configuration', () => {
      expect(() =>
        assertBackgroundJobConfig(
          env({
            ...staging,
            BACKGROUND_JOBS: 'maintenance',
            ANTHROPIC_API_KEY: '',
          }),
        ),
      ).not.toThrow();
    });

    it('does not restrict production', () => {
      expect(() =>
        assertBackgroundJobConfig(
          env({
            APP_ENV: 'production',
            BACKGROUND_JOBS: 'all',
            ANTHROPIC_API_KEY: 'k',
          }),
        ),
      ).not.toThrow();
    });
  });
});

describe('BackgroundJobsService', () => {
  const previous = { ...process.env };
  afterEach(() => {
    process.env.APP_ENV = previous.APP_ENV;
    process.env.BACKGROUND_JOBS = previous.BACKGROUND_JOBS;
    if (previous.APP_ENV === undefined) delete process.env.APP_ENV;
    if (previous.BACKGROUND_JOBS === undefined)
      delete process.env.BACKGROUND_JOBS;
  });

  function setup(cronNames: string[], leaseRows: unknown[] = [{ name: 'x' }]) {
    const registry = new SchedulerRegistry();
    for (const name of cronNames) {
      registry.addCronJob(name, { stop: jest.fn() } as never);
    }
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(leaseRows),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const service = new BackgroundJobsService(registry, prisma as never);
    return { service, registry, prisma };
  }

  it('removes disabled crons from the scheduler at bootstrap', () => {
    process.env.BACKGROUND_JOBS = 'maintenance';
    const { service } = setup(['session-purge', 'inbox-poll', 'ai-agents']);
    service.onApplicationBootstrap();
    expect(service.scheduledJobs()).toEqual(['session-purge']);
  });

  it('refuses to start with a cron that is not in the catalogue', () => {
    const { service } = setup(['session-purge', 'secret-side-job']);
    expect(() => service.onApplicationBootstrap()).toThrow(
      /not in the background job catalogue/,
    );
  });

  it('refuses to start on staging with business jobs enabled', () => {
    process.env.APP_ENV = 'staging';
    process.env.BACKGROUND_JOBS = 'all';
    const { service } = setup(['session-purge', 'inbox-poll']);
    expect(() => service.onApplicationBootstrap()).toThrow(
      /must not enable business jobs/,
    );
  });

  it('runs a job only with the lease and records success', async () => {
    process.env.BACKGROUND_JOBS = 'all';
    const { service, prisma } = setup([]);
    const task = jest.fn().mockResolvedValue(undefined);
    await expect(service.run('session-purge', task)).resolves.toBe(true);
    expect(task).toHaveBeenCalledTimes(1);
    // acquire + finish (no heartbeat fires within a fast job)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(service.activeRunCount()).toBe(0);
  });

  it('skips a job whose lease another instance holds', async () => {
    process.env.BACKGROUND_JOBS = 'all';
    const { service } = setup([], []);
    const task = jest.fn();
    await expect(service.run('session-purge', task)).resolves.toBe(false);
    expect(task).not.toHaveBeenCalled();
  });

  it('never runs a disabled job, even if called directly', async () => {
    process.env.BACKGROUND_JOBS = 'none';
    const { service, prisma } = setup([]);
    const task = jest.fn();
    await expect(service.run('ai-agents', task)).resolves.toBe(false);
    expect(task).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('contains failures and records them without throwing', async () => {
    process.env.BACKGROUND_JOBS = 'all';
    const { service, prisma } = setup([]);
    await expect(
      service.run('session-purge', () =>
        Promise.reject(new TypeError('secret detail')),
      ),
    ).resolves.toBe(true);
    // second statement is the finish: (strings, name, runToken, status, error, ...)
    const finish = prisma.$queryRaw.mock.calls[1] as unknown[];
    expect(finish).toContain('failed');
    expect(finish).toContain('TypeError');
    expect(service.activeRunCount()).toBe(0);
  });

  describe('heartbeat (mocked database, fake timers)', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      process.env.BACKGROUND_JOBS = 'all';
      process.env.BACKGROUND_JOB_HEARTBEAT_MS = '1000';
    });
    afterEach(() => {
      jest.useRealTimers();
      delete process.env.BACKGROUND_JOB_HEARTBEAT_MS;
    });

    it('renews the lease on a timer and leaves no timer behind after the run', async () => {
      const { service, prisma } = setup([]);
      let release!: () => void;
      const parked = new Promise<void>((resolve) => (release = resolve));
      const running = service.run('session-purge', () => parked);
      await jest.advanceTimersByTimeAsync(3100);
      // acquire + 3 heartbeats so far
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
      release();
      await running;
      const calls = prisma.$queryRaw.mock.calls.length;
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(10_000);
      expect(prisma.$queryRaw.mock.calls.length).toBe(calls);
    });

    it('stops the job once the database cannot be reached for longer than the lease', async () => {
      const { service, prisma } = setup([]);
      let signal!: AbortSignal;
      let release!: () => void;
      const parked = new Promise<void>((resolve) => (release = resolve));
      const running = service.run('session-purge', (ctx) => {
        signal = ctx.signal;
        return parked;
      });
      await jest.advanceTimersByTimeAsync(0);
      // From now on every heartbeat fails (database down).
      prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
      await jest.advanceTimersByTimeAsync(60_000);
      expect(signal.aborted).toBe(false); // still inside the lease (120 s)
      await jest.advanceTimersByTimeAsync(61_000);
      expect(signal.aborted).toBe(true); // lease could not be proven any longer
      release();
      await running;
      expect(service.activeRunCount()).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('stops the job when the heartbeat is rejected (lease taken over)', async () => {
      const { service, prisma } = setup([]);
      let signal!: AbortSignal;
      let release!: () => void;
      const parked = new Promise<void>((resolve) => (release = resolve));
      const running = service.run('session-purge', (ctx) => {
        signal = ctx.signal;
        return parked;
      });
      await jest.advanceTimersByTimeAsync(0);
      prisma.$queryRaw.mockResolvedValue([]); // renewal matches no row
      await jest.advanceTimersByTimeAsync(1100);
      expect(signal.aborted).toBe(true);
      release();
      await running;
    });
  });
});
