/**
 * Sprint 2.1 regressions (R2-03, R2-04) on the API side.
 *
 * R2-04: the server binds every CSRF token to exactly one session. When the
 * browser's cookie switches to another session (other user, other
 * organization, or just a new session of the same user), a mutation carrying
 * the previous session's token is rejected with 403 CSRF_INVALID before any
 * handler runs, so nothing is executed under the new identity. The browser
 * client then decides whether a retry is allowed (apps/web/test).
 *
 * R2-03: the JSON-only rule of the cookie-less auth endpoints is bound to the
 * routes, so every path variant the router accepts is covered.
 */
import { randomUUID } from 'crypto';
import {
  createMemoryStorage,
  createOrganization,
  createProject,
  createTestApp,
  createUser,
  csrfFor,
  PASSWORD,
  resetDatabase,
  sessionCookie,
  type TestApp,
  tokenFor,
} from './helpers/harness';

const api = (path: string) => `/api/v1${path}`;
const CSRF_REJECTION = {
  statusCode: 403,
  error: 'Forbidden',
  message: 'CSRF-Prüfung fehlgeschlagen',
  code: 'CSRF_INVALID',
};

interface RouteInfo {
  method: string;
  path: string;
}
function listRoutes(t: TestApp): RouteInfo[] {
  const instance = t.app.getHttpAdapter().getInstance() as {
    router?: { stack: unknown[] };
    _router?: { stack: unknown[] };
  };
  const stack = (instance.router ?? instance._router)?.stack ?? [];
  const routes: RouteInfo[] = [];
  for (const layer of stack as {
    route?: { path: string; methods: Record<string, boolean> };
  }[]) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      routes.push({ method, path: layer.route.path });
    }
  }
  return routes;
}
type Sender = (path: string) => {
  set: (headers: object) => {
    send: (body: object) => Promise<{ status: number; body: unknown }>;
  };
};
const send = (t: TestApp, method: string) =>
  (t.http() as unknown as Record<string, Sender>)[method];

/** Cookie of one session, CSRF token of another: what a switched tab sends. */
const switched = (cookieOf: string, tokenOf: string) => ({
  ...sessionCookie(cookieOf),
  'X-CSRF-Token': csrfFor(tokenOf),
});

const quoteBody = (customerId: string, projectId?: string) => ({
  type: 'INVOICE',
  customerId,
  projectId,
  issueDate: '2027-01-01',
  items: [
    {
      description: 'Position',
      quantity: 1,
      unit: 'Stk',
      unitPriceCents: 1000,
      vatRateBp: 1900,
    },
  ],
});

describe('Session switch and auth content types (integration)', () => {
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

  async function scene() {
    const orgA = await createOrganization(t.prisma);
    const orgB = await createOrganization(t.prisma);
    const owner = await createUser(t.prisma, orgA.id, 'OWNER');
    const member = await createUser(t.prisma, orgA.id, 'MEMBER');
    const outsider = await createUser(t.prisma, orgB.id, 'OWNER');
    const project = await createProject(t.prisma, orgA.id);
    for (const user of [owner, member]) {
      await t.prisma.projectMember.create({
        data: { projectId: project.id, userId: user.id, role: 'CONTRIBUTOR' },
      });
    }
    return {
      orgA,
      orgB,
      owner,
      member,
      outsider,
      project,
      ownerToken: await tokenFor(t, owner),
      memberToken: await tokenFor(t, member),
      outsiderToken: await tokenFor(t, outsider),
    };
  }

  describe('R2-04: a token of the previous session never executes under the new cookie', () => {
    it('OWNER -> MEMBER, MEMBER -> OWNER and org A -> org B: customer creation is refused', async () => {
      const s = await scene();
      const pairs: [string, string][] = [
        [s.memberToken, s.ownerToken],
        [s.ownerToken, s.memberToken],
        [s.outsiderToken, s.ownerToken],
        [s.ownerToken, s.outsiderToken],
      ];
      for (const [cookieOf, tokenOf] of pairs) {
        const response = await t
          .http()
          .post(api('/customers'))
          .set(switched(cookieOf, tokenOf))
          .send({
            name: 'Kunde',
            customerNumber: `K-${randomUUID().slice(0, 6)}`,
          });
        expect(response.status).toBe(403);
        expect(response.body).toEqual(CSRF_REJECTION);
      }
      expect(await t.prisma.customer.count({ where: { name: 'Kunde' } })).toBe(
        0,
      );
    });

    it('note creation, project edit, invoice creation and upload are refused', async () => {
      const s = await scene();
      const cookie = s.memberToken;
      const token = s.ownerToken;
      const notesBefore = await t.prisma.note.count();

      const note = await t
        .http()
        .post(api('/notes'))
        .set(switched(cookie, token))
        .send({ projectId: s.project.id, content: 'Notiz des Owners' });
      const edit = await t
        .http()
        .patch(api(`/projects/${s.project.id}`))
        .set(switched(cookie, token))
        .send({ name: 'Umbenannt' });
      const invoice = await t
        .http()
        .post(api('/sales-documents'))
        .set(switched(cookie, token))
        .send(quoteBody(s.project.customerId, s.project.id));

      const doc = await t
        .http()
        .post(api('/documents'))
        .set({
          ...sessionCookie(s.ownerToken),
          'X-CSRF-Token': csrfFor(s.ownerToken),
        })
        .send({ title: 'Plan', type: 'PLAN', projectId: s.project.id });
      expect(doc.status).toBe(201);
      const upload = await t
        .http()
        .post(api(`/documents/${(doc.body as { id: string }).id}/versions`))
        .set(switched(cookie, token))
        .attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), {
          filename: 'plan.pdf',
          contentType: 'application/pdf',
        });

      for (const response of [note, edit, invoice, upload]) {
        expect(response.status).toBe(403);
        expect(response.body).toEqual(CSRF_REJECTION);
      }
      expect(await t.prisma.note.count()).toBe(notesBefore);
      expect(
        (
          await t.prisma.project.findUniqueOrThrow({
            where: { id: s.project.id },
          })
        ).name,
      ).toBe(s.project.name);
      expect(await t.prisma.salesDocument.count()).toBe(0);
      expect(storage.files.size).toBe(0);
    });

    it('parallel POSTs during a switch: only requests whose token matches the cookie run', async () => {
      const s = await scene();
      const create = (headers: Record<string, string>, n: number) =>
        t
          .http()
          .post(api('/customers'))
          .set(headers)
          .send({ name: `Parallel ${n}`, customerNumber: `K-P${n}` });
      const stale = switched(s.memberToken, s.ownerToken);
      const matching = switched(s.memberToken, s.memberToken);
      const results = await Promise.all([
        ...[0, 1, 2, 3, 4].map((n) => create(stale, n)),
        ...[5, 6].map((n) => create(matching, n)),
      ]);
      expect(results.slice(0, 5).map((r) => r.status)).toEqual([
        403, 403, 403, 403, 403,
      ]);
      expect(results.slice(5).map((r) => r.status)).toEqual([201, 201]);
      const created = await t.prisma.customer.findMany({
        where: { name: { startsWith: 'Parallel' } },
        select: { name: true, organizationId: true },
        orderBy: { name: 'asc' },
      });
      expect(created).toEqual([
        { name: 'Parallel 5', organizationId: s.orgA.id },
        { name: 'Parallel 6', organizationId: s.orgA.id },
      ]);
    });

    it('a stale token of the same user (new session, same identity) is a CSRF rejection, not a role error', async () => {
      const s = await scene();
      const secondOwnerSession = await tokenFor(t, s.owner);
      const response = await t
        .http()
        .post(api('/customers'))
        .set(switched(secondOwnerSession, s.ownerToken))
        .send({ name: 'Kunde', customerNumber: 'K-77' });
      expect(response.body).toEqual(CSRF_REJECTION);
    });

    it('every state-changing route refuses the token of another live session', async () => {
      const s = await scene();
      const wrong: string[] = [];
      for (const route of listRoutes(t)) {
        if (!['post', 'put', 'patch', 'delete'].includes(route.method))
          continue;
        const key = `${route.method.toUpperCase()} ${route.path}`;
        if (
          [
            'POST /api/v1/auth/login',
            'POST /api/v1/auth/forgot-password',
            'POST /api/v1/auth/reset-password',
          ].includes(key)
        ) {
          continue;
        }
        const path = route.path.replace(/:[A-Za-z]+/g, randomUUID());
        const response = await send(
          t,
          route.method,
        )(path)
          .set(switched(s.memberToken, s.ownerToken))
          .send({});
        const body = response.body as { code?: unknown };
        if (response.status !== 403 || body?.code !== 'CSRF_INVALID') {
          wrong.push(`${key} -> ${response.status} ${String(body?.code)}`);
        }
      }
      expect(wrong).toEqual([]);
    });

    it('logout with a foreign session token ends neither session', async () => {
      const s = await scene();
      const response = await t
        .http()
        .post(api('/auth/logout'))
        .set(switched(s.memberToken, s.ownerToken));
      expect(response.body).toEqual(CSRF_REJECTION);
      for (const token of [s.memberToken, s.ownerToken]) {
        expect(
          (await t.http().get(api('/auth/session')).set(sessionCookie(token)))
            .status,
        ).toBe(200);
      }
    });

    it('other 403s are distinguishable: role errors carry no CSRF code, origin errors their own', async () => {
      const s = await scene();
      const role = await t
        .http()
        .post(api(`/users/${s.owner.id}/revoke-sessions`))
        .set(switched(s.memberToken, s.memberToken));
      expect(role.status).toBe(403);
      expect((role.body as { code?: unknown }).code).toBeUndefined();

      const origin = await t
        .http()
        .post(api('/customers'))
        .set(switched(s.memberToken, s.memberToken))
        .set('Origin', 'https://evil.example')
        .send({ name: 'X', customerNumber: 'K-1' });
      expect(origin.status).toBe(403);
      expect((origin.body as { code?: unknown }).code).toBe('ORIGIN_REJECTED');
    });
  });

  describe('R2-03: JSON-only auth endpoints, bound to the routes', () => {
    const endpoints = ['login', 'forgot-password', 'reset-password'];
    const variants = (name: string) => [
      `/api/v1/auth/${name}`,
      `/api/v1/auth/${name}/`,
      `/api/v1/auth/${name.toUpperCase()}`,
      `/api/v1/auth/${name.toUpperCase()}/`,
      `/API/V1/Auth/${name}`,
    ];
    const bodies: Record<string, object> = {
      login: { email: 'x@bissinger-lights.de', password: PASSWORD },
      'forgot-password': { email: 'x@bissinger-lights.de' },
      'reset-password': { token: 'x'.repeat(64), password: 'N3w!Passwort-xyz' },
    };

    it.each(endpoints)(
      '%s: every routed path variant accepts JSON and rejects other content types with 415',
      async (name) => {
        const { email } = await createUser(
          t.prisma,
          (await createOrganization(t.prisma)).id,
        );
        for (const path of variants(name)) {
          // The variant is really routed to the handler (not a 404).
          const json = await t.http().post(path).send(bodies[name]);
          expect([200, 201, 400, 401]).toContain(json.status);

          const form = await t
            .http()
            .post(path)
            .type('form')
            .send(`email=${encodeURIComponent(email)}&password=${PASSWORD}`);
          const text = await t
            .http()
            .post(path)
            .set('Content-Type', 'text/plain')
            .send(JSON.stringify(bodies[name]));
          const multipart = await t
            .http()
            .post(path)
            .field('email', email)
            .field('password', PASSWORD);
          const none = await t.http().post(path);
          for (const response of [form, text, multipart, none]) {
            expect(response.status).toBe(415);
            expect(response.headers['set-cookie']).toBeUndefined();
          }
        }
        expect(await t.prisma.userSession.count()).toBe(0);
      },
    );

    it('a valid JSON login with charset still works', async () => {
      const user = await createUser(
        t.prisma,
        (await createOrganization(t.prisma)).id,
      );
      const response = await t
        .http()
        .post(api('/auth/login'))
        .set('Content-Type', 'application/json; charset=utf-8')
        .send(JSON.stringify({ email: user.email, password: PASSWORD }));
      expect(response.status).toBe(201);
    });

    it('no other cookie-less POST route under /auth escapes the check', async () => {
      const authPosts = listRoutes(t).filter(
        (route) =>
          route.method === 'post' &&
          route.path.startsWith('/api/v1/auth/') &&
          route.path !== '/api/v1/auth/logout',
      );
      expect(authPosts.map((r) => r.path).sort()).toEqual([
        '/api/v1/auth/forgot-password',
        '/api/v1/auth/login',
        '/api/v1/auth/reset-password',
      ]);
      for (const route of authPosts) {
        const response = await t
          .http()
          .post(route.path)
          .type('form')
          .send('email=a%40b.de');
        expect(response.status).toBe(415);
      }
    });
  });
});
