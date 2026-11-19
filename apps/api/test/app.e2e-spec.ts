import { readdirSync } from 'fs';
import { join } from 'path';

// All migrations of this checkout, reported as applied (readiness compares them).
const appliedMigrations = readdirSync(
  join(process.cwd(), 'prisma', 'migrations'),
  {
    withFileTypes: true,
  },
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    migration_name: entry.name,
    finished_at: new Date(),
    rolled_back_at: null,
  }));

jest.mock('../src/common/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {
    async onModuleInit() {}
    async onModuleDestroy() {}
    $queryRaw(strings: TemplateStringsArray) {
      return Promise.resolve(
        strings.join('').includes('_prisma_migrations')
          ? appliedMigrations
          : [{ '?column?': 1 }],
      );
    }
  },
}));

import { INestApplication } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { STORAGE_SERVICE } from './../src/common/storage/storage.interface';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(STORAGE_SERVICE)
      .useValue({ ping: () => Promise.resolve() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    await app.init();
    // The Prisma mock cannot serve scheduled jobs.
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) {
      void job.stop();
    }
  });

  it('/api/v1/health (GET) reports readiness of database, storage and schema', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          status: string;
          checks: Record<string, string>;
          timestamp: unknown;
        };
        expect(body.status).toBe('ok');
        expect(body.checks).toEqual({
          database: 'ok',
          storage: 'ok',
          migrations: 'ok',
        });
        expect(typeof body.timestamp).toBe('string');
      });
  });

  afterEach(async () => {
    await app?.close();
  });
});
