import { Inject, Injectable, Logger } from '@nestjs/common';
import { readdirSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../../common/storage/storage.interface';

export type CheckResult = 'ok' | 'error';

export interface ReadinessReport {
  status: CheckResult;
  checks: {
    database: CheckResult;
    storage: CheckResult;
    migrations: CheckResult;
  };
  timestamp: string;
}

const CHECK_TIMEOUT_MS = 2000;
/** Readiness is cached briefly so probes and floods cannot hammer the DB/S3. */
const READINESS_CACHE_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Migration folder names shipped with this build (prisma/migrations). */
function expectedMigrations(): string[] | null {
  try {
    return readdirSync(join(process.cwd(), 'prisma', 'migrations'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    // Not shipped (e.g. unit tests): the check is skipped, not failed.
    return null;
  }
}

/**
 * Liveness: the process answers. Readiness: database, object storage and the
 * schema version are usable. Responses only say ok/error per dependency;
 * reasons go to the log, never to the client.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger('Health');
  private readonly migrations = expectedMigrations();
  private cached: { at: number; report: Promise<ReadinessReport> } | null =
    null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  live() {
    return { status: 'ok' as const, timestamp: new Date().toISOString() };
  }

  readiness(): Promise<ReadinessReport> {
    const now = Date.now();
    if (!this.cached || now - this.cached.at > READINESS_CACHE_MS) {
      this.cached = { at: now, report: this.check() };
    }
    return this.cached.report;
  }

  private async check(): Promise<ReadinessReport> {
    const [database, storage, migrations] = await Promise.all([
      this.probe('database', () => this.prisma.$queryRaw`SELECT 1`),
      this.probe('storage', () => this.storage.ping()),
      this.probe('migrations', () => this.assertMigrationsApplied()),
    ]);
    const ok = database === 'ok' && storage === 'ok' && migrations === 'ok';
    return {
      status: ok ? 'ok' : 'error',
      checks: { database, storage, migrations },
      timestamp: new Date().toISOString(),
    };
  }

  private async probe(
    name: string,
    run: () => Promise<unknown>,
  ): Promise<CheckResult> {
    try {
      await withTimeout(run(), CHECK_TIMEOUT_MS);
      return 'ok';
    } catch (error) {
      // Error class only: messages can contain hosts or connection strings.
      this.logger.warn(
        `readiness check=${name} status=error error=${error instanceof Error ? error.name : 'unknown'}`,
      );
      return 'error';
    }
  }

  /** Every migration of this build is applied and none failed half-way. */
  private async assertMigrationsApplied() {
    if (!this.migrations) return;
    const rows = await this.prisma.$queryRaw<
      {
        migration_name: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
      }[]
    >`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    const applied = new Set(
      rows
        .filter((row) => row.finished_at && !row.rolled_back_at)
        .map((row) => row.migration_name),
    );
    const failed = rows.some((row) => !row.finished_at && !row.rolled_back_at);
    const missing = this.migrations.filter((name) => !applied.has(name));
    if (failed || missing.length > 0) {
      throw new Error(failed ? 'FailedMigration' : 'PendingMigration');
    }
  }
}
