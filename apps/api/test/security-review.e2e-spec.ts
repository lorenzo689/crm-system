/**
 * Security regression suite from the Sprint 1 adversarial review.
 *
 * Every finding (F-01 … F-08) keeps its original exploit test, now as a plain
 * `it`: the attack must fail. Each group also tests the business flow that
 * must stay allowed, so a fix cannot "pass" by simply blocking everything.
 */
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { AuthMailService } from '../src/modules/auth/auth-mail.service';
import {
  createUser as provisionUser,
  ProvisioningError,
} from '../src/modules/users/user-provisioning';
import {
  asUser,
  createOrganization,
  createProject,
  createTestApp,
  createUser,
  PASSWORD,
  resetDatabase,
  type TestApp,
  tokenFor,
} from './helpers/harness';

interface RouteInfo {
  method: string;
  path: string;
}

/** Lists every route Express knows, so new endpoints cannot hide from the checks. */
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
  set: (headers: object) => { send: (body: object) => Promise<Response> };
};
interface Response {
  status: number;
  body: unknown;
  text?: string;
}
const send = (t: TestApp, method: string) =>
  (t.http() as unknown as Record<string, Sender>)[method];

const PUBLIC_ROUTES = new Set([
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/reset-password',
  // Without a live session logout only clears the cookie (204, no state
  // change); with one it requires that session's CSRF token (auth spec).
  'POST /api/v1/auth/logout',
  'GET /api/v1/health',
]);

/** Owner/admin-only areas (F-05). */
const SENSITIVE_PREFIX =
  /^\/api\/v1\/(finance|reports|inbox|recurring-invoices)(\/|$)/;
const SENSITIVE_EXTRA = new Set([
  'GET /api/v1/sales-documents/summary',
  'GET /api/v1/ai/proposals',
  'POST /api/v1/ai/proposals/:id/approve',
  'POST /api/v1/ai/proposals/:id/reject',
  'POST /api/v1/ai/agents/run',
]);

describe('Security review regressions', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    t.mails.length = 0;
    await resetDatabase(t.prisma);
  });

  const api = (path: string) => `/api/v1${path}`;

  async function orgWithUsers() {
    const org = await createOrganization(t.prisma);
    const owner = await createUser(t.prisma, org.id, 'OWNER');
    const admin = await createUser(t.prisma, org.id, 'ADMIN');
    const member = await createUser(t.prisma, org.id, 'MEMBER');
    return {
      org,
      owner,
      admin,
      member,
      ownerToken: await tokenFor(t, owner),
      adminToken: await tokenFor(t, admin),
      memberToken: await tokenFor(t, member),
    };
  }

  describe('default deny', () => {
    it('answers 401 on every route except the explicitly public ones', async () => {
      const routes = listRoutes(t);
      expect(routes.length).toBeGreaterThan(80); // sanity: enumeration works

      const leaks: string[] = [];
      for (const route of routes) {
        const key = `${route.method.toUpperCase()} ${route.path}`;
        if (PUBLIC_ROUTES.has(key)) continue;
        const path = route.path.replace(/:[A-Za-z]+/g, randomUUID());
        const response = await send(t, route.method)(path).set({}).send({});
        if (response.status !== 401) leaks.push(`${key} -> ${response.status}`);
      }
      expect(leaks).toEqual([]);
    });

    it('never answers 2xx or 5xx for a random foreign UUID on any id route', async () => {
      const s = await orgWithUsers();
      const routes = listRoutes(t).filter((r) => r.path.includes(':'));
      const bad: string[] = [];
      for (const route of routes) {
        const key = `${route.method.toUpperCase()} ${route.path}`;
        if (PUBLIC_ROUTES.has(key)) continue;
        // Marking a non-existent notification as read is an idempotent no-op scoped to the caller.
        if (key === 'POST /api/v1/notifications/:id/read') continue;
        const path = route.path.replace(/:[A-Za-z]+/g, randomUUID());
        const response = await send(
          t,
          route.method,
        )(path)
          .set(asUser(s.ownerToken))
          .send({});
        if (response.status < 400 || response.status >= 500) {
          bad.push(`${key} -> ${response.status}`);
        }
      }
      expect(bad).toEqual([]);
    });
  });

  describe('F-06 malformed ids', () => {
    it('answers 4xx (not 500) for malformed ids', async () => {
      const s = await orgWithUsers();
      const probes = [
        ['get', '/projects/not-a-uuid'],
        ['get', '/tasks/not-a-uuid'],
        ['get', '/customers/not-a-uuid'],
        ['delete', '/projects/not-a-uuid/members/also-bad'],
        ['post', '/tasks/not-a-uuid/archive'],
      ] as const;
      const statuses: string[] = [];
      for (const [method, path] of probes) {
        const response = await t
          .http()
          [method](api(path))
          .set(asUser(s.memberToken));
        statuses.push(`${method} ${path} -> ${response.status}`);
      }
      expect(statuses.every((line) => /-> 4\d\d$/.test(line))).toBe(true);
    });

    it('answers 400 for a malformed id on every parameterised route', async () => {
      const s = await orgWithUsers();
      const routes = listRoutes(t).filter((r) => r.path.includes(':'));
      const bad: string[] = [];
      for (const route of routes) {
        const path = route.path.replace(/:[A-Za-z]+/g, 'not-a-uuid');
        const response = await send(
          t,
          route.method,
        )(path)
          .set(asUser(s.ownerToken))
          .send({});
        if (response.status !== 400) {
          bad.push(
            `${route.method.toUpperCase()} ${route.path} -> ${response.status}`,
          );
        }
      }
      expect(bad).toEqual([]);
    });

    it('answers 400 for malformed ids in query filters', async () => {
      const s = await orgWithUsers();
      const probes = [
        '/tasks?assigneeId=x',
        '/tasks?projectId=x',
        '/notes?projectId=x',
        '/notes?customerId=x',
        '/calendar-events?projectId=x',
        '/contacts?customerId=x',
        '/activities?taskId=x',
      ];
      const statuses = await Promise.all(
        probes.map(
          async (path) =>
            `${path} -> ${(await t.http().get(api(path)).set(asUser(s.memberToken))).status}`,
        ),
      );
      expect(statuses.filter((line) => !line.endsWith('-> 400'))).toEqual([]);
    });

    it('does not leak Prisma internals in error responses', async () => {
      const s = await orgWithUsers();
      const response = await t
        .http()
        .get(api('/projects/not-a-uuid'))
        .set(asUser(s.memberToken));
      expect(JSON.stringify(response.body)).not.toMatch(
        /prisma|P20\d\d|uuid syntax/i,
      );
    });

    it('still answers 404 for a well-formed but unknown id', async () => {
      const s = await orgWithUsers();
      const response = await t
        .http()
        .get(api(`/projects/${randomUUID()}`))
        .set(asUser(s.memberToken));
      expect(response.status).toBe(404);
    });
  });

  describe('cross-organization data leaks through list endpoints', () => {
    it('never returns identifiers of another organization from any parameterless GET', async () => {
      const mine = await orgWithUsers();
      const foreignOrg = await createOrganization(t.prisma);
      const foreignUser = await createUser(t.prisma, foreignOrg.id, 'OWNER');
      const foreignProject = await createProject(t.prisma, foreignOrg.id);
      const foreignTask = await t.prisma.task.create({
        data: {
          organizationId: foreignOrg.id,
          createdByUserId: foreignUser.id,
          projectId: foreignProject.id,
          title: 'GEHEIM-FREMD',
        },
      });
      const foreignArticle = await t.prisma.article.create({
        data: {
          organizationId: foreignOrg.id,
          articleNumber: 'FREMD-1',
          name: 'GEHEIM-ARTIKEL',
          unitPriceCents: 100,
        },
      });
      const markers = [
        foreignOrg.id,
        foreignUser.id,
        foreignUser.email,
        foreignProject.id,
        foreignProject.name,
        foreignTask.id,
        foreignArticle.id,
        'GEHEIM-FREMD',
        'GEHEIM-ARTIKEL',
      ];

      const getRoutes = listRoutes(t).filter(
        (r) => r.method === 'get' && !r.path.includes(':'),
      );
      const leaks: string[] = [];
      for (const route of getRoutes) {
        if (PUBLIC_ROUTES.has(`GET ${route.path}`)) continue;
        const response = await t
          .http()
          .get(route.path)
          .set(asUser(mine.ownerToken));
        const body =
          JSON.stringify(response.body ?? '') + (response.text ?? '');
        for (const marker of markers) {
          if (body.includes(marker))
            leaks.push(`${route.path} leaks ${marker}`);
        }
      }
      expect(leaks).toEqual([]);
    });
  });

  describe('F-01 project role VIEWER on alternative endpoints', () => {
    async function viewerOnProject() {
      const s = await orgWithUsers();
      const project = await createProject(t.prisma, s.org.id);
      await t.prisma.projectMember.create({
        data: { projectId: project.id, userId: s.member.id, role: 'VIEWER' },
      });
      return { ...s, project };
    }

    const quoteBody = (customerId: string, projectId?: string) => ({
      type: 'QUOTE',
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

    async function createAsOwner(
      token: string,
      path: string,
      body: object,
    ): Promise<string> {
      const response = await t
        .http()
        .post(api(path))
        .set(asUser(token))
        .send(body);
      expect(response.status).toBe(201);
      return (response.body as { id: string }).id;
    }

    it('cannot create a calendar event on the project', async () => {
      const s = await viewerOnProject();
      const response = await t
        .http()
        .post(api('/calendar-events'))
        .set(asUser(s.memberToken))
        .send({
          title: 'Eingeschleust',
          startsAt: '2027-01-01T10:00:00.000Z',
          endsAt: '2027-01-01T11:00:00.000Z',
          projectId: s.project.id,
        });
      expect(response.status).toBe(403);
    });

    it('cannot change or cancel an existing calendar event of the project', async () => {
      const s = await viewerOnProject();
      const event = await t.prisma.calendarEvent.create({
        data: {
          organizationId: s.org.id,
          projectId: s.project.id,
          createdByUserId: s.owner.id,
          title: 'Original',
          startsAt: new Date('2027-01-01T10:00:00Z'),
          endsAt: new Date('2027-01-01T11:00:00Z'),
        },
      });
      const patch = await t
        .http()
        .patch(api(`/calendar-events/${event.id}`))
        .set(asUser(s.memberToken))
        .send({ title: 'Manipuliert' });
      const cancel = await t
        .http()
        .post(api(`/calendar-events/${event.id}/cancel`))
        .set(asUser(s.memberToken));
      expect([patch.status, cancel.status]).toEqual([403, 403]);
      const archive = await t
        .http()
        .post(api(`/calendar-events/${event.id}/archive`))
        .set(asUser(s.memberToken));
      expect(archive.status).toBe(403);
      const stored = await t.prisma.calendarEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.title).toBe('Original');
      expect(stored.archivedAt).toBeNull();
    });

    it('cannot create a sales document (quote) for the project', async () => {
      const s = await viewerOnProject();
      const response = await t
        .http()
        .post(api('/sales-documents'))
        .set(asUser(s.memberToken))
        .send(quoteBody(s.project.customerId, s.project.id));
      expect(response.status).toBe(403);
    });

    it('cannot change, re-status, pay, convert or delete an existing quote of the project', async () => {
      const s = await viewerOnProject();
      const id = await createAsOwner(
        s.ownerToken,
        '/sales-documents',
        quoteBody(s.project.customerId, s.project.id),
      );
      const attempts = [
        ['patch', `/sales-documents/${id}`, { notes: 'Manipuliert' }],
        ['post', `/sales-documents/${id}/status`, { status: 'CANCELLED' }],
        ['post', `/sales-documents/${id}/convert-to-invoice`, {}],
        ['post', `/sales-documents/${id}/payments`, { amountCents: 1 }],
        ['post', `/sales-documents/${id}/credit-note`, {}],
        ['post', `/sales-documents/${id}/dunning`, {}],
        ['post', `/sales-documents/${id}/send`, {}],
        ['delete', `/sales-documents/${id}`, {}],
      ] as const;
      for (const [method, path, body] of attempts) {
        const response = await send(
          t,
          method,
        )(api(path))
          .set(asUser(s.memberToken))
          .send(body);
        expect(`${method} ${path} -> ${response.status}`).toBe(
          `${method} ${path} -> 403`,
        );
      }
      const stored = await t.prisma.salesDocument.findUniqueOrThrow({
        where: { id },
      });
      expect(stored.status).toBe('DRAFT');
    });

    it('cannot move a quote into a project where they are VIEWER (both projects are checked)', async () => {
      const s = await viewerOnProject();
      const other = await t.prisma.project.create({
        data: {
          organizationId: s.org.id,
          customerId: s.project.customerId,
          name: 'Anderes Projekt',
          projectNumber: 'P-OTHER',
        },
      });
      const id = await createAsOwner(
        s.ownerToken,
        '/sales-documents',
        quoteBody(s.project.customerId, other.id),
      );
      const move = await t
        .http()
        .patch(api(`/sales-documents/${id}`))
        .set(asUser(s.memberToken))
        .send({ projectId: s.project.id });
      expect(move.status).toBe(403);
      const stored = await t.prisma.salesDocument.findUniqueOrThrow({
        where: { id },
      });
      expect(stored.projectId).toBe(other.id);
    });

    it('cannot create a purchase order for the project', async () => {
      const s = await viewerOnProject();
      const supplier = await t.prisma.supplier.create({
        data: {
          organizationId: s.org.id,
          supplierNumber: 'L-1',
          name: 'Lieferant',
        },
      });
      const order = await t
        .http()
        .post(api('/purchase-orders'))
        .set(asUser(s.memberToken))
        .send({
          supplierId: supplier.id,
          projectId: s.project.id,
          orderDate: '2027-01-01',
          items: [
            {
              description: 'Teil',
              quantity: 1,
              unit: 'Stk',
              unitPriceCents: 100,
            },
          ],
        });
      expect(order.status).toBe(403);
    });

    it('cannot change, receive or delete an existing purchase order of the project', async () => {
      const s = await viewerOnProject();
      const supplier = await t.prisma.supplier.create({
        data: {
          organizationId: s.org.id,
          supplierNumber: 'L-2',
          name: 'Lieferant',
        },
      });
      const id = await createAsOwner(s.ownerToken, '/purchase-orders', {
        supplierId: supplier.id,
        projectId: s.project.id,
        orderDate: '2027-01-01',
        items: [
          {
            description: 'Teil',
            quantity: 1,
            unit: 'Stk',
            unitPriceCents: 100,
          },
        ],
      });
      for (const [method, path, body] of [
        ['post', `/purchase-orders/${id}/status`, { status: 'ORDERED' }],
        ['post', `/purchase-orders/${id}/receive`, { lines: [] }],
        ['delete', `/purchase-orders/${id}`, {}],
      ] as const) {
        const response = await send(
          t,
          method,
        )(api(path))
          .set(asUser(s.memberToken))
          .send(body);
        expect(`${path} -> ${response.status}`).toBe(`${path} -> 403`);
      }
    });

    it('cannot reserve equipment for the project or change an existing reservation', async () => {
      const s = await viewerOnProject();
      const article = await t.prisma.article.create({
        data: {
          organizationId: s.org.id,
          articleNumber: 'A-1',
          name: 'Scheinwerfer',
          unitPriceCents: 100,
          isRentable: true,
          rentalStock: 5,
        },
      });
      const body = {
        articleId: article.id,
        quantity: 1,
        startsOn: '2027-02-01',
        endsOn: '2027-02-02',
        projectId: s.project.id,
      };
      const response = await t
        .http()
        .post(api('/reservations'))
        .set(asUser(s.memberToken))
        .send(body);
      expect(response.status).toBe(403);

      const id = await createAsOwner(s.ownerToken, '/reservations', body);
      const status = await t
        .http()
        .post(api(`/reservations/${id}/status`))
        .set(asUser(s.memberToken))
        .send({ status: 'CANCELLED' });
      expect(status.status).toBe(403);
    });

    it('blocks an ADMIN who is VIEWER from recurring invoices of the project', async () => {
      const s = await viewerOnProject();
      await t.prisma.projectMember.create({
        data: { projectId: s.project.id, userId: s.admin.id, role: 'VIEWER' },
      });
      const body = {
        title: 'Wartung',
        customerId: s.project.customerId,
        projectId: s.project.id,
        intervalMonths: 1,
        startDate: '2027-01-01',
        items: quoteBody(s.project.customerId).items,
      };
      const create = await t
        .http()
        .post(api('/recurring-invoices'))
        .set(asUser(s.adminToken))
        .send(body);
      expect(create.status).toBe(403);

      const id = await createAsOwner(s.ownerToken, '/recurring-invoices', body);
      for (const [method, path] of [
        ['post', `/recurring-invoices/${id}/pause`],
        ['delete', `/recurring-invoices/${id}`],
      ] as const) {
        const response = await send(
          t,
          method,
        )(api(path))
          .set(asUser(s.adminToken))
          .send({});
        expect(`${path} -> ${response.status}`).toBe(`${path} -> 403`);
      }
    });

    it('cannot delete or bill time entries of the project', async () => {
      const s = await viewerOnProject();
      const entry = await t.prisma.timeEntry.create({
        data: {
          organizationId: s.org.id,
          userId: s.member.id,
          customerId: s.project.customerId,
          projectId: s.project.id,
          workDate: new Date('2027-01-05'),
          minutes: 60,
          description: 'Vor der Herabstufung erfasst',
          hourlyRateCents: 9000,
        },
      });
      const remove = await t
        .http()
        .delete(api(`/time-entries/${entry.id}`))
        .set(asUser(s.memberToken));
      expect(remove.status).toBe(403);
      // Billing by customer only (no projectId in the request) still touches the project.
      const bill = await t
        .http()
        .post(api('/time-entries/invoice'))
        .set(asUser(s.memberToken))
        .send({ customerId: s.project.customerId });
      expect(bill.status).toBe(403);
      const stored = await t.prisma.timeEntry.findUniqueOrThrow({
        where: { id: entry.id },
      });
      expect(stored.billedDocumentId).toBeNull();
    });

    it('cannot approve an AI proposal that writes to the project', async () => {
      const s = await viewerOnProject();
      await t.prisma.projectMember.create({
        data: { projectId: s.project.id, userId: s.admin.id, role: 'VIEWER' },
      });
      const proposal = await t.prisma.aiProposal.create({
        data: {
          organizationId: s.org.id,
          source: 'CHAT',
          kind: 'CREATE_TASK',
          title: 'Aufgabe',
          payload: { title: 'Über die KI', projectId: s.project.id },
        },
      });
      const response = await t
        .http()
        .post(api(`/ai/proposals/${proposal.id}/approve`))
        .set(asUser(s.adminToken));
      expect((response.body as { status: string }).status).toBe('FAILED');
      expect(await t.prisma.task.count()).toBe(0);
    });

    it('still lets a CONTRIBUTOR create events, quotes, orders and reservations', async () => {
      const s = await viewerOnProject();
      await t.prisma.projectMember.update({
        where: {
          projectId_userId: { projectId: s.project.id, userId: s.member.id },
        },
        data: { role: 'CONTRIBUTOR' },
      });
      const supplier = await t.prisma.supplier.create({
        data: { organizationId: s.org.id, supplierNumber: 'L-3', name: 'L' },
      });
      const article = await t.prisma.article.create({
        data: {
          organizationId: s.org.id,
          articleNumber: 'A-2',
          name: 'Nebel',
          unitPriceCents: 100,
          isRentable: true,
          rentalStock: 5,
        },
      });
      const creates: [string, object][] = [
        [
          '/calendar-events',
          {
            title: 'Termin',
            startsAt: '2027-01-01T10:00:00.000Z',
            endsAt: '2027-01-01T11:00:00.000Z',
            projectId: s.project.id,
          },
        ],
        ['/sales-documents', quoteBody(s.project.customerId, s.project.id)],
        [
          '/purchase-orders',
          {
            supplierId: supplier.id,
            projectId: s.project.id,
            orderDate: '2027-01-01',
            items: [
              { description: 'T', quantity: 1, unit: 'Stk', unitPriceCents: 1 },
            ],
          },
        ],
        [
          '/reservations',
          {
            articleId: article.id,
            quantity: 1,
            startsOn: '2027-03-01',
            endsOn: '2027-03-02',
            projectId: s.project.id,
          },
        ],
        [
          '/time-entries',
          {
            workDate: '2027-01-05',
            minutes: 30,
            description: 'Arbeit',
            projectId: s.project.id,
          },
        ],
      ];
      for (const [path, body] of creates) {
        const response = await t
          .http()
          .post(api(path))
          .set(asUser(s.memberToken))
          .send(body);
        expect(`${path} -> ${response.status}`).toBe(`${path} -> 201`);
      }
    });
  });

  describe('F-02 stale actor inside admin transactions', () => {
    /**
     * Holds the organization lock like a concurrent admin action, starts the
     * request (which then waits for the lock), demotes the actor inside the
     * held transaction and only then releases. Deterministic: the request
     * cannot proceed before the demotion is committed.
     */
    async function whileLocked(
      organizationId: string,
      start: () => Promise<{ status: number }>,
      change: (
        tx: Parameters<Parameters<TestApp['prisma']['$transaction']>[0]>[0],
      ) => Promise<unknown>,
    ) {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let locked!: () => void;
      const lockTaken = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const holder = t.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
          locked();
          await gate;
          await change(tx);
        },
        { timeout: 20000 },
      );
      await lockTaken;
      const pending = start();
      await new Promise((resolve) => setTimeout(resolve, 800));
      release();
      await holder;
      return pending;
    }

    it('an admin demoted while their request waits for the lock must not succeed', async () => {
      const s = await orgWithUsers();
      const victim = await createUser(t.prisma, s.org.id, 'MEMBER');
      const response = await whileLocked(
        s.org.id,
        () =>
          t
            .http()
            .post(api(`/users/${victim.id}/deactivate`))
            .set(asUser(s.adminToken))
            .then((r) => r),
        (tx) =>
          tx.organizationMember.updateMany({
            where: { userId: s.admin.id },
            data: { role: 'MEMBER' },
          }),
      );

      expect([401, 403]).toContain(response.status);
      const stored = await t.prisma.user.findUniqueOrThrow({
        where: { id: victim.id },
      });
      expect(stored.archivedAt).toBeNull();
    });

    it('an admin locked out while waiting cannot change roles (401)', async () => {
      const s = await orgWithUsers();
      const response = await whileLocked(
        s.org.id,
        () =>
          t
            .http()
            .patch(api(`/users/${s.member.id}/role`))
            .set(asUser(s.adminToken))
            .send({ role: 'ADMIN' })
            .then((r) => r),
        (tx) =>
          tx.user.update({
            where: { id: s.admin.id },
            data: { archivedAt: new Date(), tokenVersion: { increment: 1 } },
          }),
      );
      expect(response.status).toBe(401);
      const membership = await t.prisma.organizationMember.findFirstOrThrow({
        where: { userId: s.member.id },
      });
      expect(membership.role).toBe('MEMBER');
    });

    it('an admin demoted while waiting cannot add project members', async () => {
      const s = await orgWithUsers();
      const project = await createProject(t.prisma, s.org.id);
      const response = await whileLocked(
        s.org.id,
        () =>
          t
            .http()
            .post(api(`/projects/${project.id}/members`))
            .set(asUser(s.adminToken))
            .send({ userId: s.member.id, role: 'MANAGER' })
            .then((r) => r),
        (tx) =>
          tx.organizationMember.updateMany({
            where: { userId: s.admin.id },
            data: { role: 'MEMBER' },
          }),
      );
      expect(response.status).toBe(403);
      expect(await t.prisma.projectMember.count()).toBe(0);
    });

    it('an admin whose rights stay intact still succeeds after waiting for the lock', async () => {
      const s = await orgWithUsers();
      const victim = await createUser(t.prisma, s.org.id, 'MEMBER');
      const response = await whileLocked(
        s.org.id,
        () =>
          t
            .http()
            .post(api(`/users/${victim.id}/deactivate`))
            .set(asUser(s.adminToken))
            .then((r) => r),
        () => Promise.resolve(),
      );
      expect(response.status).toBe(200);
    });
  });

  describe('F-03 account enumeration through forgot-password', () => {
    it('answers identically for existing and unknown addresses when mail is not configured', async () => {
      const unconfigured = await createTestApp();
      try {
        // Mail transport "down": same situation as a missing SMTP configuration.
        const mail = unconfigured.app.get(AuthMailService);
        (mail as { isConfigured: () => boolean }).isConfigured = () => false;

        const org = await createOrganization(unconfigured.prisma);
        const user = await createUser(unconfigured.prisma, org.id);
        const known = await unconfigured
          .http()
          .post(api('/auth/forgot-password'))
          .send({ email: user.email });
        const unknown = await unconfigured
          .http()
          .post(api('/auth/forgot-password'))
          .send({ email: 'ghost@bissinger-lights.de' });
        expect(known.status).toBe(unknown.status);
        expect(known.body).toEqual(unknown.body);
      } finally {
        await unconfigured.app.close();
      }
    });

    it('answers identically when SMTP delivery fails', async () => {
      const failing = await createTestApp();
      try {
        const mail = failing.app.get(AuthMailService);
        (
          mail as unknown as { sendPasswordReset: () => Promise<void> }
        ).sendPasswordReset = () =>
          Promise.reject(new Error(`SMTP down ${randomUUID()}`));
        const org = await createOrganization(failing.prisma);
        const user = await createUser(failing.prisma, org.id);
        const known = await failing
          .http()
          .post(api('/auth/forgot-password'))
          .send({ email: user.email });
        const unknown = await failing
          .http()
          .post(api('/auth/forgot-password'))
          .send({ email: 'ghost@bissinger-lights.de' });
        expect([known.status, unknown.status]).toEqual([201, 201]);
        expect(known.body).toEqual(unknown.body);
        expect(JSON.stringify(known.body)).not.toMatch(
          /token|reset-password\?/i,
        );
      } finally {
        await failing.app.close();
      }
    });

    it('pads the answer time so real accounts are not slower to answer', async () => {
      process.env.PASSWORD_RESET_MIN_RESPONSE_MS = '400';
      try {
        const org = await createOrganization(t.prisma);
        const user = await createUser(t.prisma, org.id);
        const timed = async (email: string) => {
          const startedAt = Date.now();
          await t.http().post(api('/auth/forgot-password')).send({ email });
          return Date.now() - startedAt;
        };
        expect(await timed('ghost@bissinger-lights.de')).toBeGreaterThanOrEqual(
          390,
        );
        expect(await timed(user.email)).toBeGreaterThanOrEqual(390);
        expect(t.mails).toHaveLength(1);
      } finally {
        process.env.PASSWORD_RESET_MIN_RESPONSE_MS = '0';
      }
    });

    it('still delivers the reset mail for a real account', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const response = await t
        .http()
        .post(api('/auth/forgot-password'))
        .send({ email: user.email.toUpperCase() });
      expect(response.status).toBe(201);
      expect(t.mails.map((mail) => mail.email)).toEqual([user.email]);
    });
  });

  describe('F-04 e-mail normalization and uniqueness', () => {
    it('the database refuses a second account that differs only by case', async () => {
      const org = await createOrganization(t.prisma);
      await createUser(t.prisma, org.id, 'MEMBER', {
        email: 'Boss@bissinger-lights.de',
      });
      await expect(
        createUser(t.prisma, org.id, 'MEMBER', {
          email: 'boss@bissinger-lights.de',
        }),
      ).rejects.toThrow();
      expect(await t.prisma.user.count()).toBe(1);
    });

    it('the CLI refuses a case variant of an existing address', async () => {
      const org = await t.prisma.organization.create({
        data: { name: 'Bissinger Lights', slug: 'bissinger-lights' },
      });
      await createUser(t.prisma, org.id, 'MEMBER', {
        email: 'Legacy.User@bissinger-lights.de',
      });
      await expect(
        provisionUser(t.prisma, {
          email: 'legacy.user@BISSINGER-lights.de',
          displayName: 'Doppelt',
          password: PASSWORD,
          role: 'MEMBER',
        }),
      ).rejects.toThrow(ProvisioningError);
    });

    it('a legacy mixed-case account keeps working with any spelling and only with its own password', async () => {
      const org = await createOrganization(t.prisma);
      const legacy = await createUser(t.prisma, org.id, 'MEMBER', {
        email: 'Boss@bissinger-lights.de',
      });
      const other = await createUser(t.prisma, org.id, 'MEMBER', {
        email: 'other@bissinger-lights.de',
      });
      await t.prisma.user.update({
        where: { id: other.id },
        data: { passwordHash: await bcrypt.hash('Other!Passw0rd-2', 4) },
      });
      for (const email of [
        'Boss@bissinger-lights.de',
        'boss@bissinger-lights.de',
        ' BOSS@Bissinger-Lights.de ',
      ]) {
        const response = await t
          .http()
          .post(api('/auth/login'))
          .send({ email, password: PASSWORD });
        expect(`${email} -> ${response.status}`).toBe(`${email} -> 201`);
      }
      const wrongAccount = await t.http().post(api('/auth/login')).send({
        email: 'boss@bissinger-lights.de',
        password: 'Other!Passw0rd-2',
      });
      expect(wrongAccount.status).toBe(401);
      expect(legacy.email).toBe('Boss@bissinger-lights.de');
    });
  });

  describe('F-05 financial and AI functions for plain members', () => {
    it('a MEMBER cannot reach finance, reports or inbox data', async () => {
      const s = await orgWithUsers();
      const sensitive = listRoutes(t).filter(
        (r) =>
          r.method === 'get' &&
          !r.path.includes(':') &&
          /^\/api\/v1\/(finance|reports|inbox|recurring-invoices)/.test(r.path),
      );
      expect(sensitive.length).toBeGreaterThan(0);
      const open: string[] = [];
      for (const route of sensitive) {
        const response = await t
          .http()
          .get(route.path)
          .set(asUser(s.memberToken));
        if (response.status === 200) open.push(route.path);
      }
      expect(open).toEqual([]);
    });

    it('answers 403 to a MEMBER on every method of the sensitive areas', async () => {
      const s = await orgWithUsers();
      const routes = listRoutes(t).filter(
        (r) =>
          SENSITIVE_PREFIX.test(r.path) ||
          SENSITIVE_EXTRA.has(`${r.method.toUpperCase()} ${r.path}`),
      );
      expect(routes.length).toBeGreaterThanOrEqual(25);
      const notForbidden: string[] = [];
      for (const route of routes) {
        const path = route.path.replace(/:[A-Za-z]+/g, randomUUID());
        const response = await send(
          t,
          route.method,
        )(path)
          .set(asUser(s.memberToken))
          .send({});
        if (response.status !== 403) {
          notForbidden.push(
            `${route.method.toUpperCase()} ${route.path} -> ${response.status}`,
          );
        }
      }
      expect(notForbidden).toEqual([]);
    });

    it('still serves these areas to OWNER and ADMIN', async () => {
      const s = await orgWithUsers();
      const reads = listRoutes(t).filter(
        (r) =>
          r.method === 'get' &&
          !r.path.includes(':') &&
          (SENSITIVE_PREFIX.test(r.path) ||
            SENSITIVE_EXTRA.has(`GET ${r.path}`)),
      );
      const failures: string[] = [];
      for (const token of [s.ownerToken, s.adminToken]) {
        for (const route of reads) {
          const response = await t.http().get(route.path).set(asUser(token));
          if (response.status !== 200) {
            failures.push(`${route.path} -> ${response.status}`);
          }
        }
      }
      expect(failures).toEqual([]);
    });

    it('keeps the regular CRM areas open to a MEMBER', async () => {
      const s = await orgWithUsers();
      for (const path of [
        '/customers',
        '/projects',
        '/tasks',
        '/sales-documents',
        '/time-entries',
        '/reservations',
        '/ai/status',
      ]) {
        const response = await t
          .http()
          .get(api(path))
          .set(asUser(s.memberToken));
        expect(`${path} -> ${response.status}`).toBe(`${path} -> 200`);
      }
    });
  });

  describe('regression guards that must keep holding', () => {
    it('password reset does not reactivate an archived account', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const token = 'a'.repeat(64);
      await t.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      await t.prisma.user.update({
        where: { id: user.id },
        data: { archivedAt: new Date() },
      });
      await t
        .http()
        .post(api('/auth/reset-password'))
        .send({ token, password: 'N3w!Passwort-xyz' });
      const login = await t
        .http()
        .post(api('/auth/login'))
        .send({ email: user.email, password: 'N3w!Passwort-xyz' });
      expect(login.status).toBe(401);
    });

    it("a member cannot read or mark another user's notifications", async () => {
      const s = await orgWithUsers();
      const notification = await t.prisma.notification.create({
        data: {
          userId: s.owner.id,
          type: 'TASK_ASSIGNED',
          title: 'Privat',
          message: 'Nur für den Owner',
        },
      });
      const list = await t
        .http()
        .get(api('/notifications'))
        .set(asUser(s.memberToken));
      expect(JSON.stringify(list.body)).not.toContain(notification.id);
      await t
        .http()
        .post(api(`/notifications/${notification.id}/read`))
        .set(asUser(s.memberToken));
      const stored = await t.prisma.notification.findUniqueOrThrow({
        where: { id: notification.id },
      });
      expect(stored.readAt).toBeNull();
    });
  });
});
