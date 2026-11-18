import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { STORAGE_SERVICE } from '../../src/common/storage/storage.interface';
import { AuthMailService } from '../../src/modules/auth/auth-mail.service';
import type {
  OrganizationMemberRole,
  OrganizationStatus,
} from '../../generated/prisma/client';

export const PASSWORD = 'Passw0rd!Test';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  jwt: JwtService;
  /** Reset links the (fake) mail service "sent", newest last. */
  mails: { email: string; resetUrl: string }[];
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(
  options: { throttling?: boolean } = {},
): Promise<TestApp> {
  const mails: TestApp['mails'] = [];
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(STORAGE_SERVICE)
    .useValue({})
    .overrideProvider(AuthMailService)
    .useValue({
      isConfigured: () => true,
      sendPasswordReset: (input: { email: string; resetUrl: string }) => {
        mails.push({ email: input.email, resetUrl: input.resetUrl });
        return Promise.resolve();
      },
    });
  if (!options.throttling) {
    // Every request counts as the first one, so fixtures can log in freely.
    builder = builder.overrideProvider(ThrottlerStorage).useValue({
      increment: () =>
        Promise.resolve({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
    });
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    jwt: app.get(JwtService),
    mails,
    http: () => request(app.getHttpServer() as App),
  };
}

/** Empties every table; safe because setup-env only permits *_test databases. */
export async function resetDatabase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "organizations", "users" RESTART IDENTITY CASCADE',
  );
}

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`;

export async function createOrganization(
  prisma: PrismaService,
  status: OrganizationStatus = 'ACTIVE',
) {
  const id = unique();
  return prisma.organization.create({
    data: { name: `Org ${id}`, slug: `org-${id}`, status },
  });
}

export async function createUser(
  prisma: PrismaService,
  organizationId: string | null,
  role: OrganizationMemberRole = 'MEMBER',
  overrides: { archived?: boolean; email?: string } = {},
) {
  const id = unique();
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user-${id}@bissinger-lights.de`,
      displayName: `User ${id}`,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      archivedAt: overrides.archived ? new Date() : null,
      ...(organizationId && {
        organizationRoles: { create: { organizationId, role } },
      }),
    },
  });
}

export async function loginAs(
  t: TestApp,
  user: { email: string },
  password = PASSWORD,
) {
  const response = await t
    .http()
    .post('/api/v1/auth/login')
    .send({ email: user.email, password });
  return {
    status: response.status,
    token: (response.body as { accessToken?: string }).accessToken ?? '',
  };
}

export async function tokenFor(t: TestApp, user: { email: string }) {
  const { status, token } = await loginAs(t, user);
  if (status !== 201) {
    throw new Error(`login failed for fixture user (status ${status})`);
  }
  return token;
}

export async function createProject(
  prisma: PrismaService,
  organizationId: string,
) {
  const id = unique();
  const customer = await prisma.customer.create({
    data: { organizationId, name: `Kunde ${id}`, customerNumber: `K-${id}` },
  });
  return prisma.project.create({
    data: {
      organizationId,
      customerId: customer.id,
      name: `Projekt ${id}`,
      projectNumber: `P-${id}`,
    },
  });
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
