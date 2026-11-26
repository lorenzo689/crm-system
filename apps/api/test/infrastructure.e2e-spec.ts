/**
 * Sprint 3 (infrastructure) behaviour of the API itself:
 * health/readiness, streamed document downloads, request ids and the
 * background job profile on staging.
 */
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  asUser,
  createMemoryStorage,
  createOrganization,
  createTestApp,
  createUser,
  resetDatabase,
  sessionCookie,
  type TestApp,
  tokenFor,
} from './helpers/harness';

const api = (path: string) => `/api/v1${path}`;
const pdf = Buffer.from('%PDF-1.4\n%infra\n1 0 obj<<>>endobj\n%%EOF\n');
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

describe('Infrastructure behaviour (integration)', () => {
  let t: TestApp;
  const storage = createMemoryStorage();

  beforeAll(async () => {
    t = await createTestApp({ storage });
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    storage.files.clear();
    await resetDatabase(t.prisma);
  });

  describe('health', () => {
    it('liveness and readiness are 200 with a reachable database and storage', async () => {
      expect((await t.http().get(api('/health/live'))).status).toBe(200);
      const ready = await t.http().get(api('/health/ready'));
      expect(ready.status).toBe(200);
      expect(ready.body).toMatchObject({
        status: 'ok',
        checks: { database: 'ok', storage: 'ok', migrations: 'ok' },
      });
      // Nothing internal in the public answer.
      expect(JSON.stringify(ready.body)).not.toMatch(
        /postgres|password|localhost|5432/i,
      );
    });

    it('readiness is 503 when object storage fails (liveness stays 200)', async () => {
      const failing = await createTestApp({
        storage: {
          ...createMemoryStorage(),
          ping: () => Promise.reject(new Error('down')),
        },
      });
      try {
        const ready = await failing.http().get(api('/health/ready'));
        expect(ready.status).toBe(503);
        expect(ready.body).toMatchObject({
          status: 'error',
          checks: { storage: 'error' },
        });
        expect((await failing.http().get(api('/health'))).status).toBe(503);
        expect((await failing.http().get(api('/health/live'))).status).toBe(
          200,
        );
      } finally {
        await failing.app.close();
      }
    });
  });

  describe('streamed document download', () => {
    async function documentWith(
      file: Buffer,
      filename: string,
      contentType: string,
    ) {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id, 'MEMBER');
      const token = await tokenFor(t, user);
      const created = await t
        .http()
        .post(api('/documents'))
        .set(asUser(token))
        .send({ title: 'Datei', type: 'GENERAL' });
      const id = (created.body as { id: string }).id;
      const upload = await t
        .http()
        .post(api(`/documents/${id}/versions`))
        .set(asUser(token))
        .attach('file', file, { filename, contentType });
      expect(upload.status).toBe(201);
      return { id, token, org };
    }

    it('streams the exact bytes; attachment unless inline is requested for a safe type', async () => {
      const { id, token } = await documentWith(
        pdf,
        'Prüfbericht.pdf',
        'application/pdf',
      );
      const attachment = await t
        .http()
        .get(api(`/documents/${id}/download`))
        .set(sessionCookie(token))
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(attachment.status).toBe(200);
      expect(Buffer.compare(attachment.body as Buffer, pdf)).toBe(0);
      expect(attachment.headers['content-disposition']).toBe(
        `attachment; filename="Pr_fbericht.pdf"; filename*=UTF-8''Pr%C3%BCfbericht.pdf`,
      );
      expect(attachment.headers['content-length']).toBe(String(pdf.length));

      const inline = await t
        .http()
        .get(api(`/documents/${id}/download?disposition=inline`))
        .set(sessionCookie(token));
      expect(inline.headers['content-disposition']).toMatch(/^inline;/);
      expect(inline.headers['content-security-policy']).toContain(
        "default-src 'none'",
      );
      expect(inline.headers['content-security-policy']).toContain(
        "frame-ancestors 'self'",
      );
      expect(inline.headers['x-frame-options']).toBeUndefined();
    });

    it('serves images inline with their validated type and nosniff', async () => {
      const { id, token } = await documentWith(png, 'foto.png', 'image/png');
      const response = await t
        .http()
        .get(api(`/documents/${id}/download?disposition=inline`))
        .set(sessionCookie(token))
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.compare(response.body as Buffer, png)).toBe(0);
    });

    it('is invisible to other organizations and to anonymous callers', async () => {
      const { id } = await documentWith(pdf, 'a.pdf', 'application/pdf');
      const other = await createUser(
        t.prisma,
        (await createOrganization(t.prisma)).id,
      );
      const otherToken = await tokenFor(t, other);
      expect(
        (
          await t
            .http()
            .get(api(`/documents/${id}/download`))
            .set(sessionCookie(otherToken))
        ).status,
      ).toBe(404);
      expect(
        (await t.http().get(api(`/documents/${id}/download`))).status,
      ).toBe(401);
    });

    it('rejects unknown versions and malformed ids', async () => {
      const { id, token } = await documentWith(pdf, 'a.pdf', 'application/pdf');
      expect(
        (
          await t
            .http()
            .get(
              api(
                `/documents/${id}/download?version=${'0'.repeat(8)}-0000-4000-8000-000000000000`,
              ),
            )
            .set(sessionCookie(token))
        ).status,
      ).toBe(404);
      expect(
        (
          await t
            .http()
            .get(api(`/documents/${id}/download?version=../../x`))
            .set(sessionCookie(token))
        ).status,
      ).toBe(400);
      expect(
        (
          await t
            .http()
            .get(api('/documents/not-a-uuid/download'))
            .set(sessionCookie(token))
        ).status,
      ).toBe(400);
    });

    it('no longer offers presigned storage URLs', async () => {
      const { id, token } = await documentWith(pdf, 'a.pdf', 'application/pdf');
      expect(
        (
          await t
            .http()
            .get(api(`/documents/${id}/download-url`))
            .set(sessionCookie(token))
        ).status,
      ).toBe(404);
    });
  });

  describe('request ids', () => {
    it('returns a request id and replaces malformed incoming ones', async () => {
      const generated = await t.http().get(api('/health/live'));
      expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

      const kept = await t
        .http()
        .get(api('/health/live'))
        .set('X-Request-Id', '0f6c2a8e-1111-4222-8333-944455556666');
      expect(kept.headers['x-request-id']).toBe(
        '0f6c2a8e-1111-4222-8333-944455556666',
      );

      const replaced = await t
        .http()
        .get(api('/health/live'))
        .set('X-Request-Id', 'bad id <script>');
      expect(replaced.headers['x-request-id']).not.toContain('<');
    });
  });

  describe('background jobs on staging', () => {
    const keys = [
      'APP_ENV',
      'BACKGROUND_JOBS',
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASSWORD',
      'ANTHROPIC_API_KEY',
      'IMAP_HOST',
    ] as const;
    let saved: Record<string, string | undefined>;
    beforeEach(() => {
      saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
      // A developer .env must not make the staging guard fail for other reasons.
      for (const key of [
        'SMTP_USER',
        'SMTP_PASSWORD',
        'ANTHROPIC_API_KEY',
        'IMAP_HOST',
      ]) {
        delete process.env[key];
      }
    });
    afterEach(() => {
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    });

    it('schedules only maintenance jobs, also after a restart', async () => {
      process.env.APP_ENV = 'staging';
      delete process.env.BACKGROUND_JOBS;
      process.env.SMTP_HOST = 'mailpit';
      for (let start = 0; start < 2; start += 1) {
        const staging = await createTestApp();
        try {
          const scheduled = [
            ...staging.app.get(SchedulerRegistry).getCronJobs().keys(),
          ];
          expect(scheduled).toEqual(['session-purge']);
        } finally {
          await staging.app.close();
        }
      }
    });

    it('refuses to start on staging with business jobs', async () => {
      process.env.APP_ENV = 'staging';
      process.env.BACKGROUND_JOBS = 'all';
      process.env.SMTP_HOST = 'mailpit';
      await expect(createTestApp()).rejects.toThrow(
        /must not enable business jobs/,
      );
    });

    it('keeps every job registered outside staging (production behaviour unchanged)', () => {
      const scheduled = [
        ...t.app.get(SchedulerRegistry).getCronJobs().keys(),
      ].sort();
      expect(scheduled).toEqual([
        'ai-agents',
        'calendar-reminders',
        'inbox-poll',
        'recurring-invoices',
        'session-purge',
      ]);
    });
  });
});
