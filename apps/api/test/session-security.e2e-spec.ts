/**
 * Security sprint 2: cookie sessions, logout, CSRF and origin checks.
 *
 * Every attack test is paired with the legitimate flow it must not break, so a
 * "fix" cannot pass by rejecting everything.
 */
import { createHash, randomUUID } from 'crypto';
import { SessionService } from '../src/modules/auth/session.service';
import {
  asUser,
  createMemoryStorage,
  createOrganization,
  createProject,
  createTestApp,
  createUser,
  csrfFor,
  loginAs,
  resetDatabase,
  sessionCookie,
  sessionCookieFrom,
  setCookies,
  type TestApp,
  tokenFor,
} from './helpers/harness';

const api = (path: string) => `/api/v1${path}`;
const ALLOWED_ORIGIN = 'http://localhost:3000';
const EVIL_ORIGIN = 'https://evil.example';

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

/** Routes that work without a session (login CSRF is covered separately). */
const COOKIELESS_ROUTES = new Set([
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/reset-password',
  'POST /api/v1/auth/logout',
]);

function cookieAttributes(header: string) {
  const [, ...attributes] = header.split(';').map((part) => part.trim());
  return attributes.map((attribute) => attribute.toLowerCase());
}

describe('Session security (integration)', () => {
  let t: TestApp;
  const storage = createMemoryStorage();

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    t = await createTestApp({ storage });
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    t.mails.length = 0;
    storage.files.clear();
    await resetDatabase(t.prisma);
  });

  async function member(role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER') {
    const org = await createOrganization(t.prisma);
    const user = await createUser(t.prisma, org.id, role);
    return { org, user };
  }

  describe('login sets a secure session cookie', () => {
    it('sets an HttpOnly, SameSite=Lax, host-only cookie and returns no JWT', async () => {
      const { user } = await member();
      const { status, token, response } = await loginAs(t, user);
      expect(status).toBe(201);

      const header = setCookies(response).find((c) =>
        c.startsWith('bissinger_session='),
      ) as string;
      expect(header).toBeDefined();
      const attributes = cookieAttributes(header);
      expect(attributes).toContain('httponly');
      expect(attributes).toContain('samesite=lax');
      expect(attributes).toContain('path=/');
      expect(attributes.some((a) => a.startsWith('domain='))).toBe(false);
      const maxAge = Number(
        attributes.find((a) => a.startsWith('max-age='))?.split('=')[1],
      );
      expect(maxAge).toBeGreaterThan(0);
      expect(maxAge).toBeLessThanOrEqual(8 * 60 * 60);

      const body = JSON.stringify(response.body);
      expect(body).not.toContain(token);
      expect(body).not.toMatch(/accessToken/i);
      // No JWT-shaped value anywhere in the body.
      expect(body).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
      expect(response.body).toMatchObject({
        user: { id: user.id, email: user.email },
        role: 'MEMBER',
        csrfToken: expect.any(String) as string,
      });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('uses __Host-, Secure and SameSite=Lax in production', async () => {
      const { user } = await member();
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const response = await t
          .http()
          .post(api('/auth/login'))
          .send({ email: user.email, password: 'Passw0rd!Test' });
        expect(response.status).toBe(201);
        const header = setCookies(response).find((c) =>
          c.startsWith('__Host-bissinger_session='),
        ) as string;
        expect(header).toBeDefined();
        const attributes = cookieAttributes(header);
        expect(attributes).toEqual(
          expect.arrayContaining([
            'httponly',
            'secure',
            'samesite=lax',
            'path=/',
          ]),
        );
        expect(attributes.some((a) => a.startsWith('domain='))).toBe(false);

        // The production cookie name is the one that authenticates there.
        const cookie = decodeURIComponent(
          header.split(';')[0].slice('__Host-bissinger_session='.length),
        );
        const session = await t
          .http()
          .get(api('/auth/session'))
          .set('Cookie', `__Host-bissinger_session=${cookie}`);
        expect(session.status).toBe(200);
        const unprefixed = await t
          .http()
          .get(api('/auth/session'))
          .set('Cookie', `bissinger_session=${cookie}`);
        expect(unprefixed.status).toBe(401);
      } finally {
        process.env.NODE_ENV = previous;
      }
    });

    it('stores only a hash of the session secret', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const claims = t.jwt.decode<{ sid: string; jti: string }>(token);
      const row = await t.prisma.userSession.findUniqueOrThrow({
        where: { id: claims.sid },
      });
      expect(row.secretHash).not.toContain(claims.jti);
      expect(row.secretHash).toBe(
        createHash('sha256').update(claims.jti).digest('hex'),
      );
    });

    it('prevents session fixation: a presented cookie is replaced and revoked', async () => {
      const { user } = await member();
      const planted = await tokenFor(t, user);
      const response = await t
        .http()
        .post(api('/auth/login'))
        .set(sessionCookie(planted))
        .send({ email: user.email, password: 'Passw0rd!Test' });
      expect(response.status).toBe(201);
      const fresh = sessionCookieFrom(response);
      expect(fresh).not.toBe('');
      expect(fresh).not.toBe(planted);

      expect(
        (await t.http().get(api('/auth/session')).set(sessionCookie(planted)))
          .status,
      ).toBe(401);
      expect(
        (await t.http().get(api('/auth/session')).set(sessionCookie(fresh)))
          .status,
      ).toBe(200);
    });

    it('rejects a login from a foreign origin without setting a cookie (login CSRF)', async () => {
      const { user } = await member();
      const response = await t
        .http()
        .post(api('/auth/login'))
        .set('Origin', EVIL_ORIGIN)
        .send({ email: user.email, password: 'Passw0rd!Test' });
      expect(response.status).toBe(403);
      expect(setCookies(response)).toHaveLength(0);
      expect(await t.prisma.userSession.count()).toBe(0);
    });

    it('rejects form-encoded and text/plain logins (HTML forms cannot send JSON)', async () => {
      const { user } = await member();
      const form = await t
        .http()
        .post(api('/auth/login'))
        .type('form')
        .send(`email=${encodeURIComponent(user.email)}&password=Passw0rd!Test`);
      expect(form.status).toBe(415);
      const text = await t
        .http()
        .post(api('/auth/login'))
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify({ email: user.email, password: 'Passw0rd!Test' }));
      expect(text.status).toBe(415);
      expect(await t.prisma.userSession.count()).toBe(0);
    });

    it('accepts the login from the allowed origin', async () => {
      const { user } = await member();
      const response = await t
        .http()
        .post(api('/auth/login'))
        .set('Origin', ALLOWED_ORIGIN)
        .send({ email: user.email, password: 'Passw0rd!Test' });
      expect(response.status).toBe(201);
      expect(sessionCookieFrom(response)).not.toBe('');
    });

    it('rejects forgot/reset-password from a foreign origin', async () => {
      const { user } = await member();
      const forgot = await t
        .http()
        .post(api('/auth/forgot-password'))
        .set('Origin', EVIL_ORIGIN)
        .send({ email: user.email });
      expect(forgot.status).toBe(403);
      expect(t.mails).toHaveLength(0);
      const reset = await t
        .http()
        .post(api('/auth/reset-password'))
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ token: 'x'.repeat(64), password: 'N3w!Passwort-xyz' });
      expect(reset.status).toBe(403);
    });
  });

  describe('session validation', () => {
    it('answers 401 without a cookie', async () => {
      expect((await t.http().get(api('/auth/session'))).status).toBe(401);
      expect((await t.http().get(api('/users/me'))).status).toBe(401);
    });

    it('answers 401 for a garbage cookie and clears it', async () => {
      const response = await t
        .http()
        .get(api('/auth/session'))
        .set(sessionCookie('not-a-session'));
      expect(response.status).toBe(401);
      const cleared = setCookies(response).find((c) =>
        c.startsWith('bissinger_session=;'),
      );
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('does not accept the session JWT as a Bearer token', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const response = await t
        .http()
        .get(api('/users/me'))
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(401);
    });

    it('rejects a validly signed JWT that has no stored session (leaked signing key)', async () => {
      const { user } = await member();
      const forged = t.jwt.sign({
        sub: user.id,
        email: user.email,
        tv: 0,
        sid: randomUUID(),
        jti: 'guessed',
      });
      expect(
        (await t.http().get(api('/users/me')).set(sessionCookie(forged)))
          .status,
      ).toBe(401);
    });

    it('rejects a stored session presented with the wrong secret', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const claims = t.jwt.decode<Record<string, unknown>>(token);
      const forged = t.jwt.sign({
        sub: claims.sub,
        email: claims.email,
        tv: claims.tv,
        sid: claims.sid,
        jti: 'wrong-secret',
      });
      expect(
        (await t.http().get(api('/users/me')).set(sessionCookie(forged)))
          .status,
      ).toBe(401);
    });

    it('rejects an expired session even if the JWT is still valid', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      await t.prisma.userSession.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(
        (await t.http().get(api('/users/me')).set(asUser(token))).status,
      ).toBe(401);
    });

    it('rejects a revoked session', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      await t.prisma.userSession.updateMany({
        data: { revokedAt: new Date() },
      });
      expect(
        (await t.http().get(api('/users/me')).set(asUser(token))).status,
      ).toBe(401);
    });

    it('survives a reload: the same cookie keeps working and the CSRF token is stable', async () => {
      const { user, org } = await member('OWNER');
      const token = await tokenFor(t, user);
      const first = await t
        .http()
        .get(api('/auth/session'))
        .set(sessionCookie(token));
      const second = await t
        .http()
        .get(api('/auth/session'))
        .set(sessionCookie(token));
      expect([first.status, second.status]).toEqual([200, 200]);
      const body = first.body as { csrfToken: string; organization: unknown };
      expect(body.csrfToken).toBe(csrfFor(token));
      expect((second.body as { csrfToken: string }).csrfToken).toBe(
        body.csrfToken,
      );
      expect(first.body).toMatchObject({
        user: { id: user.id, email: user.email },
        organization: { id: org.id },
        role: 'OWNER',
      });
      expect(JSON.stringify(first.body)).not.toContain(token);
      expect(first.headers['cache-control']).toBe('no-store');
    });

    it('reflects a role change on the next session probe', async () => {
      const { user, org } = await member('OWNER');
      const token = await tokenFor(t, user);
      await t.prisma.organizationMember.updateMany({
        where: { organizationId: org.id, userId: user.id },
        data: { role: 'MEMBER' },
      });
      const session = await t
        .http()
        .get(api('/auth/session'))
        .set(sessionCookie(token));
      expect(session.body).toMatchObject({ role: 'MEMBER' });
    });

    it('keeps sprint-1 locks: archived user and suspended organization lose access at once', async () => {
      const { user, org } = await member();
      const token = await tokenFor(t, user);
      await t.prisma.organization.update({
        where: { id: org.id },
        data: { status: 'SUSPENDED' },
      });
      expect(
        (await t.http().get(api('/auth/session')).set(sessionCookie(token)))
          .status,
      ).toBe(401);

      const other = await member();
      const otherToken = await tokenFor(t, other.user);
      await t.prisma.user.update({
        where: { id: other.user.id },
        data: { archivedAt: new Date() },
      });
      expect(
        (
          await t
            .http()
            .get(api('/auth/session'))
            .set(sessionCookie(otherToken))
        ).status,
      ).toBe(401);
    });
  });

  describe('logout', () => {
    it('revokes only the current session and clears its cookie', async () => {
      const { user } = await member();
      const laptop = await tokenFor(t, user);
      const phone = await tokenFor(t, user);

      const response = await t
        .http()
        .post(api('/auth/logout'))
        .set(asUser(laptop));
      expect(response.status).toBe(204);
      expect(
        setCookies(response).some((c) => c.startsWith('bissinger_session=;')),
      ).toBe(true);

      expect(
        (await t.http().get(api('/users/me')).set(asUser(laptop))).status,
      ).toBe(401);
      expect(
        (await t.http().get(api('/users/me')).set(asUser(phone))).status,
      ).toBe(200);
    });

    it('refuses to log out a live session without its CSRF token', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const response = await t
        .http()
        .post(api('/auth/logout'))
        .set(sessionCookie(token));
      expect(response.status).toBe(403);
      expect(
        (await t.http().get(api('/users/me')).set(asUser(token))).status,
      ).toBe(200);
    });

    it('rejects a logout from a foreign origin', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const response = await t
        .http()
        .post(api('/auth/logout'))
        .set(asUser(token))
        .set('Origin', EVIL_ORIGIN);
      expect(response.status).toBe(403);
      expect(
        (await t.http().get(api('/users/me')).set(asUser(token))).status,
      ).toBe(200);
    });

    it('just clears the cookie when there is no live session', async () => {
      const response = await t
        .http()
        .post(api('/auth/logout'))
        .set(sessionCookie('stale'));
      expect(response.status).toBe(204);
      expect(
        setCookies(response).some((c) => c.startsWith('bissinger_session=;')),
      ).toBe(true);
    });

    it('password reset revokes every session of the user', async () => {
      const { user } = await member();
      const a = await tokenFor(t, user);
      const b = await tokenFor(t, user);
      await t
        .http()
        .post(api('/auth/forgot-password'))
        .send({ email: user.email });
      const resetToken = new URL(t.mails[0].resetUrl).searchParams.get(
        'token',
      ) as string;
      const reset = await t
        .http()
        .post(api('/auth/reset-password'))
        .send({ token: resetToken, password: 'N3w!Passwort-xyz' });
      expect(reset.status).toBe(201);

      for (const token of [a, b]) {
        expect(
          (await t.http().get(api('/users/me')).set(asUser(token))).status,
        ).toBe(401);
      }
      expect(
        await t.prisma.userSession.count({
          where: { userId: user.id, revokedAt: null },
        }),
      ).toBe(0);
    });

    it('administrative revoke-sessions ends all devices of the target only', async () => {
      const { org, user: owner } = await member('OWNER');
      const target = await createUser(t.prisma, org.id, 'MEMBER');
      const ownerToken = await tokenFor(t, owner);
      const t1 = await tokenFor(t, target);
      const t2 = await tokenFor(t, target);

      const response = await t
        .http()
        .post(api(`/users/${target.id}/revoke-sessions`))
        .set(asUser(ownerToken));
      expect(response.status).toBe(200);
      for (const token of [t1, t2]) {
        expect(
          (await t.http().get(api('/users/me')).set(asUser(token))).status,
        ).toBe(401);
      }
      expect(
        (await t.http().get(api('/users/me')).set(asUser(ownerToken))).status,
      ).toBe(200);
      expect(
        await t.prisma.userSession.count({
          where: { userId: target.id, revokedAt: null },
        }),
      ).toBe(0);
    });

    it('account lock revokes the session rows as well', async () => {
      const { org, user: owner } = await member('OWNER');
      const target = await createUser(t.prisma, org.id, 'MEMBER');
      const ownerToken = await tokenFor(t, owner);
      await tokenFor(t, target);
      const lock = await t
        .http()
        .post(api(`/users/${target.id}/deactivate`))
        .set(asUser(ownerToken));
      expect(lock.status).toBe(200);
      expect(
        await t.prisma.userSession.count({
          where: { userId: target.id, revokedAt: null },
        }),
      ).toBe(0);
    });
  });

  describe('CSRF', () => {
    const newCustomer = () => ({
      name: `Kunde ${randomUUID()}`,
      customerNumber: `K-${randomUUID().slice(0, 8)}`,
    });

    it('POST without a CSRF token is 403 and changes nothing', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const response = await t
        .http()
        .post(api('/customers'))
        .set(sessionCookie(token))
        .send(newCustomer());
      expect(response.status).toBe(403);
      expect(await t.prisma.customer.count()).toBe(0);
    });

    it('POST with the session CSRF token from the allowed origin succeeds', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const response = await t
        .http()
        .post(api('/customers'))
        .set(asUser(token))
        .set('Origin', ALLOWED_ORIGIN)
        .set('Sec-Fetch-Site', 'same-site')
        .send(newCustomer());
      expect(response.status).toBe(201);
      expect(await t.prisma.customer.count()).toBe(1);
    });

    it('PATCH and DELETE without a CSRF token are 403', async () => {
      const { org, user: owner } = await member('OWNER');
      const target = await createUser(t.prisma, org.id, 'MEMBER');
      const project = await createProject(t.prisma, org.id);
      await t.prisma.projectMember.create({
        data: { projectId: project.id, userId: target.id, role: 'CONTRIBUTOR' },
      });
      const token = await tokenFor(t, owner);

      const patch = await t
        .http()
        .patch(api(`/users/${target.id}/role`))
        .set(sessionCookie(token))
        .send({ role: 'ADMIN' });
      expect(patch.status).toBe(403);
      const del = await t
        .http()
        .delete(api(`/projects/${project.id}/members/${target.id}`))
        .set(sessionCookie(token));
      expect(del.status).toBe(403);

      expect(
        await t.prisma.organizationMember.findFirstOrThrow({
          where: { userId: target.id },
        }),
      ).toMatchObject({ role: 'MEMBER' });
      expect(await t.prisma.projectMember.count()).toBe(1);

      // The same requests with the token work.
      expect(
        (
          await t
            .http()
            .delete(api(`/projects/${project.id}/members/${target.id}`))
            .set(asUser(token))
        ).status,
      ).toBe(200);
    });

    it('rejects a manipulated token and a token of another session', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const otherDevice = await tokenFor(t, user);
      const stranger = await tokenFor(t, (await member()).user);
      const valid = csrfFor(token);
      const flipped = `${valid.slice(0, -1)}${valid.endsWith('A') ? 'B' : 'A'}`;

      for (const csrf of [
        flipped,
        csrfFor(otherDevice),
        csrfFor(stranger),
        '',
        'x',
      ]) {
        const response = await t
          .http()
          .post(api('/customers'))
          .set(sessionCookie(token))
          .set('X-CSRF-Token', csrf)
          .send(newCustomer());
        expect(response.status).toBe(403);
      }
      expect(await t.prisma.customer.count()).toBe(0);
    });

    it('rejects a valid session + token from a foreign origin or a cross-site context', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const foreign = await t
        .http()
        .post(api('/customers'))
        .set(asUser(token))
        .set('Origin', EVIL_ORIGIN)
        .send(newCustomer());
      expect(foreign.status).toBe(403);
      const nullOrigin = await t
        .http()
        .post(api('/customers'))
        .set(asUser(token))
        .set('Origin', 'null')
        .send(newCustomer());
      expect(nullOrigin.status).toBe(403);
      const lookalike = await t
        .http()
        .post(api('/customers'))
        .set(asUser(token))
        .set('Origin', 'http://localhost:3000.evil.example')
        .send(newCustomer());
      expect(lookalike.status).toBe(403);
      const crossSite = await t
        .http()
        .post(api('/customers'))
        .set(asUser(token))
        .set('Sec-Fetch-Site', 'cross-site')
        .send(newCustomer());
      expect(crossSite.status).toBe(403);
      expect(await t.prisma.customer.count()).toBe(0);
    });

    it('does not honour method-override headers to dodge the check', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const response = await t
        .http()
        .post(api('/customers'))
        .set(sessionCookie(token))
        .set('X-HTTP-Method-Override', 'GET')
        .send(newCustomer());
      expect(response.status).toBe(403);
    });

    it('ignores form-encoded bodies on authenticated routes', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const response = await t
        .http()
        .post(api('/customers'))
        .set(asUser(token))
        .type('form')
        .send('name=Evil&customerNumber=K-1');
      // There is no urlencoded parser, so the body is empty and invalid.
      expect(response.status).toBe(400);
      expect(await t.prisma.customer.count()).toBe(0);
    });

    it('protects multipart uploads; with the token the upload and download work', async () => {
      const { user, org } = await member();
      const token = await tokenFor(t, user);
      const project = await createProject(t.prisma, org.id);
      await t.prisma.projectMember.create({
        data: { projectId: project.id, userId: user.id, role: 'CONTRIBUTOR' },
      });
      const created = await t
        .http()
        .post(api('/documents'))
        .set(asUser(token))
        .send({ title: 'Plan', type: 'PLAN', projectId: project.id });
      expect(created.status).toBe(201);
      const documentId = (created.body as { id: string }).id;
      const pdf = Buffer.from('%PDF-1.4\n%test\n1 0 obj<<>>endobj\n%%EOF\n');

      const withoutToken = await t
        .http()
        .post(api(`/documents/${documentId}/versions`))
        .set(sessionCookie(token))
        .attach('file', pdf, {
          filename: 'plan.pdf',
          contentType: 'application/pdf',
        });
      expect(withoutToken.status).toBe(403);
      expect(storage.files.size).toBe(0);

      const withToken = await t
        .http()
        .post(api(`/documents/${documentId}/versions`))
        .set(asUser(token))
        .attach('file', pdf, {
          filename: 'plan.pdf',
          contentType: 'application/pdf',
        });
      expect(withToken.status).toBe(201);
      expect(storage.files.size).toBe(1);

      const download = await t
        .http()
        .get(
          api(`/documents/${documentId}/download-url?disposition=attachment`),
        )
        .set(sessionCookie(token));
      expect(download.status).toBe(200);
      expect((download.body as { url: string }).url).toMatch(
        /^https:\/\/storage\.test\//,
      );
    });

    it('protects the AI chat stream; with the token the stream opens', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const body = { messages: [{ role: 'user', content: 'Hallo' }] };

      const withoutToken = await t
        .http()
        .post(api('/ai/chat/stream'))
        .set(sessionCookie(token))
        .send(body);
      expect(withoutToken.status).toBe(403);

      const withToken = await t
        .http()
        .post(api('/ai/chat/stream'))
        .set(asUser(token))
        .send(body);
      expect(withToken.status).toBe(200);
      expect(withToken.headers['content-type']).toMatch(/text\/event-stream/);
      // No API key in tests: the stream reports that instead of a reply.
      expect(withToken.text).toContain('"type":"error"');
    });

    it('requires the CSRF token on every state-changing route', async () => {
      const { user } = await member('OWNER');
      const token = await tokenFor(t, user);
      const routes = listRoutes(t).filter(
        (route) =>
          ['post', 'put', 'patch', 'delete'].includes(route.method) &&
          !COOKIELESS_ROUTES.has(`${route.method.toUpperCase()} ${route.path}`),
      );
      expect(routes.length).toBeGreaterThan(50);

      const unprotected: string[] = [];
      for (const route of routes) {
        const path = route.path.replace(/:[A-Za-z]+/g, randomUUID());
        const response = await send(
          t,
          route.method,
        )(path)
          .set(sessionCookie(token))
          .send({});
        if (response.status !== 403) {
          unprotected.push(
            `${route.method.toUpperCase()} ${route.path} -> ${response.status}`,
          );
        }
      }
      expect(unprotected).toEqual([]);
    });

    it('safe methods need no CSRF token and the session probe never mutates', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      expect(
        (await t.http().get(api('/users/me')).set(sessionCookie(token))).status,
      ).toBe(200);
      // There is no GET variant of logout.
      expect(
        (await t.http().get(api('/auth/logout')).set(sessionCookie(token)))
          .status,
      ).toBe(404);
      expect(
        (await t.http().get(api('/users/me')).set(sessionCookie(token))).status,
      ).toBe(200);
    });
  });

  describe('CORS', () => {
    it('grants credentialed CORS to the allowed origin only', async () => {
      const allowed = await t
        .http()
        .options(api('/customers'))
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-csrf-token');
      expect(allowed.status).toBe(204);
      expect(allowed.headers['access-control-allow-origin']).toBe(
        ALLOWED_ORIGIN,
      );
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');
      expect(
        String(allowed.headers['access-control-allow-headers']).toLowerCase(),
      ).toContain('x-csrf-token');

      const evil = await t
        .http()
        .options(api('/customers'))
        .set('Origin', EVIL_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();

      const evilRead = await t
        .http()
        .get(api('/health'))
        .set('Origin', EVIL_ORIGIN);
      expect(evilRead.headers['access-control-allow-origin']).toBeUndefined();
      expect(evilRead.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('treats 127.0.0.1 as a different origin than localhost', async () => {
      const response = await t
        .http()
        .post(api('/auth/login'))
        .set('Origin', 'http://127.0.0.1:3000')
        .send({ email: 'x@bissinger-lights.de', password: 'irrelevant' });
      expect(response.status).toBe(403);
    });
  });

  describe('session table hygiene', () => {
    it('removes ended sessions of the user on the next login and purges old ones', async () => {
      const { user } = await member();
      await tokenFor(t, user);
      await t.prisma.userSession.updateMany({
        data: { revokedAt: new Date() },
      });
      await tokenFor(t, user);
      expect(await t.prisma.userSession.count()).toBe(1);

      await t.prisma.userSession.updateMany({
        data: { expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      });
      await t.app.get(SessionService).purgeEndedSessions();
      expect(await t.prisma.userSession.count()).toBe(0);
    });
  });
});
