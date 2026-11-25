import { readdirSync } from 'fs';
import { join } from 'path';
import { HealthService } from './health.service';

/** All migrations of this checkout, reported as applied. */
const allApplied = readdirSync(join(process.cwd(), 'prisma', 'migrations'), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    migration_name: entry.name,
    finished_at: new Date(),
    rolled_back_at: null,
  }));

function createService(
  overrides: {
    db?: () => Promise<unknown>;
    ping?: () => Promise<void>;
    migrations?: {
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }[];
  } = {},
) {
  const applied = overrides.migrations ?? allApplied;
  const prisma = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) =>
      strings.join('').includes('_prisma_migrations')
        ? Promise.resolve(applied)
        : (overrides.db ?? (() => Promise.resolve([{ ok: 1 }])))(),
    ),
  };
  const storage = {
    ping: jest.fn(overrides.ping ?? (() => Promise.resolve())),
  };
  const service = new HealthService(prisma as never, storage as never);
  return { service, prisma, storage };
}

describe('HealthService', () => {
  it('liveness only says the process runs', () => {
    expect(createService().service.live()).toMatchObject({ status: 'ok' });
  });

  it('is ready when database and storage answer', async () => {
    const report = await createService().service.readiness();
    expect(report.status).toBe('ok');
    expect(report.checks.database).toBe('ok');
    expect(report.checks.storage).toBe('ok');
  });

  it('is not ready when the database fails, without leaking the reason', async () => {
    const { service } = createService({
      db: () =>
        Promise.reject(new Error('connect ECONNREFUSED postgres://user:pw@db')),
    });
    const report = await service.readiness();
    expect(report).toMatchObject({
      status: 'error',
      checks: { database: 'error', storage: 'ok' },
    });
    expect(JSON.stringify(report)).not.toMatch(/postgres|ECONNREFUSED|pw/);
  });

  it('is not ready when object storage is unreachable', async () => {
    const { service } = createService({
      ping: () => Promise.reject(new Error('NoSuchBucket')),
    });
    expect(await service.readiness()).toMatchObject({
      status: 'error',
      checks: { storage: 'error' },
    });
  });

  it('treats a hanging dependency as not ready (timeout)', async () => {
    jest.useFakeTimers();
    try {
      const { service } = createService({ ping: () => new Promise(() => {}) });
      const pending = service.readiness();
      await jest.advanceTimersByTimeAsync(2500);
      expect((await pending).checks.storage).toBe('error');
    } finally {
      jest.useRealTimers();
    }
  });

  it('caches the result briefly so probes cannot hammer the dependencies', async () => {
    const { service, storage } = createService();
    await Promise.all([service.readiness(), service.readiness()]);
    await service.readiness();
    expect(storage.ping).toHaveBeenCalledTimes(1);
  });

  it('is not ready while a shipped migration is missing or failed', async () => {
    const migrationsDir = process.cwd();
    // The unit test runs from apps/api, where prisma/migrations exists.
    expect(migrationsDir).toMatch(/api$/);
    const missing = await createService({ migrations: [] }).service.readiness();
    expect(missing.checks.migrations).toBe('error');

    const failed = await createService({
      migrations: [
        { migration_name: 'x', finished_at: null, rolled_back_at: null },
      ],
    }).service.readiness();
    expect(failed.checks.migrations).toBe('error');
  });
});
