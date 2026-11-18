jest.mock('../src/common/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {
    async onModuleInit() {}
    async onModuleDestroy() {}
    $queryRaw() {
      return Promise.resolve([{ '?column?': 1 }]);
    }
  },
}));

import { INestApplication } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
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
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    await app.init();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          status: string;
          database: string;
          timestamp: unknown;
        };
        expect(body.status).toBe('ok');
        expect(body.database).toBe('connected');
        expect(typeof body.timestamp).toBe('string');
      });
  });

  afterEach(async () => {
    await app?.close();
  });
});
