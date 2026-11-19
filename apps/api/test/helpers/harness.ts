import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import { Readable } from 'stream';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app-setup';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../../src/common/storage/storage.interface';
import { AuthMailService } from '../../src/modules/auth/auth-mail.service';
import { getSessionCookieConfig } from '../../src/modules/auth/session-cookie';
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

/** Object storage held in memory, for upload/download round trips. */
export function createMemoryStorage(): StorageService & {
  files: Map<string, Buffer>;
} {
  const files = new Map<string, Buffer>();
  return {
    files,
    upload: ({ key, data }) => {
      files.set(key, data);
      return Promise.resolve();
    },
    download: (key) => {
      const data = files.get(key);
      return data
        ? Promise.resolve(data)
        : Promise.reject(new Error('not found'));
    },
    delete: (key) => {
      files.delete(key);
      return Promise.resolve();
    },
    exists: (key) => Promise.resolve(files.has(key)),
    openDownload: (key) => {
      const data = files.get(key);
      return data
        ? Promise.resolve({
            body: Readable.from([data]),
            contentLength: data.length,
          })
        : Promise.reject(new Error('not found'));
    },
    ping: () => Promise.resolve(),
  };
}

export async function createTestApp(
  options: { throttling?: boolean; storage?: StorageService } = {},
): Promise<TestApp> {
  const mails: TestApp['mails'] = [];
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(STORAGE_SERVICE)
    .useValue(options.storage ?? {})
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
  // Same HTTP pipeline as production (CORS, Origin check, JSON-only bodies).
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureApp(app);
  // Scheduled jobs (reminders every minute, session purge, inbox …) would run
  // concurrently with resetDatabase's TRUNCATE and can deadlock it. Tests call
  // the jobs they need directly instead.
  const stopCronJobs = () => {
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) {
      void job.stop();
    }
  };
  try {
    await app.init();
    stopCronJobs();
  } catch (error) {
    // A start that fails on purpose (e.g. the staging guard) must not leave
    // running cron jobs and open database connections behind: they keep the
    // test process alive and fire against a closed pool.
    stopCronJobs();
    await app.close().catch(() => undefined);
    throw error;
  }

  return {
    app,
    prisma: app.get(PrismaService),
    jwt: app.get(JwtService),
    mails,
    http: () => request(app.getHttpServer()),
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

/** CSRF token handed out with each session, keyed by the cookie value. */
const csrfBySession = new Map<string, string>();

export const sessionCookieName = () => getSessionCookieConfig().name;

/** Set-Cookie headers of a response as an array. */
export function setCookies(response: { headers: Record<string, unknown> }) {
  const raw = response.headers['set-cookie'];
  if (Array.isArray(raw)) return raw.map(String);
  return typeof raw === 'string' ? [raw] : [];
}

/** Value of the session cookie a response set, or '' if none. */
export function sessionCookieFrom(response: {
  headers: Record<string, unknown>;
}) {
  const prefix = `${sessionCookieName()}=`;
  const header = setCookies(response).find((c) => c.startsWith(prefix));
  return header
    ? decodeURIComponent(header.slice(prefix.length).split(';')[0])
    : '';
}

/**
 * Logs in like the browser does. `token` is the session cookie value (the
 * signed session JWT); `csrf` is what the login body returned.
 */
export interface LoginResult {
  status: number;
  token: string;
  csrf: string;
  response: { headers: Record<string, unknown>; body: unknown };
}

export async function loginAs(
  t: TestApp,
  user: { email: string },
  password = PASSWORD,
): Promise<LoginResult> {
  const response = await t
    .http()
    .post('/api/v1/auth/login')
    .send({ email: user.email, password });
  const token = sessionCookieFrom(response);
  const csrf = (response.body as { csrfToken?: string }).csrfToken ?? '';
  if (token && csrf) {
    csrfBySession.set(token, csrf);
  }
  return { status: response.status, token, csrf, response };
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

/** Cookie header carrying the given session cookie value. */
export const sessionCookie = (token: string) => ({
  Cookie: `${sessionCookieName()}=${encodeURIComponent(token)}`,
});

/**
 * What the browser sends for a logged-in user: the session cookie plus the
 * session's CSRF token (only known for sessions created through loginAs).
 */
export function asUser(token: string): Record<string, string> {
  const csrf = csrfBySession.get(token);
  return csrf
    ? { ...sessionCookie(token), 'X-CSRF-Token': csrf }
    : sessionCookie(token);
}

export const csrfFor = (token: string) => csrfBySession.get(token) ?? '';
