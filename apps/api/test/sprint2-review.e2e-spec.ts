/**
 * Adversarial review of security sprint 2 (cookie sessions, CSRF).
 *
 * R2-01 … R2-03 were confirmed here as `it.failing` and are fixed in sprint
 * 2.1; their tests now run as plain `it` with unchanged (or stricter)
 * assertions. R2-04 (identity switch on retry) is a browser-client finding:
 * see apps/web/test/session-switch.test.ts and session-security.e2e-spec.ts.
 * The other tests are counter-probes that tried to break a guarantee.
 */
import { randomUUID } from 'crypto';
import { SessionService } from '../src/modules/auth/session.service';
import {
  asUser,
  createOrganization,
  createTestApp,
  createUser,
  csrfFor,
  loginAs,
  PASSWORD,
  resetDatabase,
  sessionCookie,
  setCookies,
  type TestApp,
  tokenFor,
} from './helpers/harness';

const api = (path: string) => `/api/v1${path}`;
const CSRF_FAILURE = 'CSRF-Prüfung fehlgeschlagen';
const CSRF_CODE = 'CSRF_INVALID';

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

describe('Sprint 2 adversarial review', () => {
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

  async function member(role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER') {
    const org = await createOrganization(t.prisma);
    const user = await createUser(t.prisma, org.id, role);
    return { org, user };
  }

  describe('JWT forgery with a live session (are the sprint-1 JWT checks still discriminating?)', () => {
    async function liveClaims() {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const claims = t.jwt.decode<Record<string, unknown>>(token);
      return { token, claims };
    }
    const secret = () => process.env.JWT_SECRET as string;
    const base = (c: Record<string, unknown>) => ({
      sub: c.sub,
      email: c.email,
      tv: c.tv,
      sid: c.sid,
      jti: c.jti,
    });

    it('rejects HS512 even with valid sid/jti', async () => {
      const { claims } = await liveClaims();
      const forged = t.jwt.sign(base(claims), {
        secret: secret(),
        algorithm: 'HS512',
        expiresIn: 600,
      });
      expect(
        (await t.http().get(api('/users/me')).set(sessionCookie(forged)))
          .status,
      ).toBe(401);
    });

    it('rejects alg=none even with valid sid/jti', async () => {
      const { claims } = await liveClaims();
      const enc = (v: object) =>
        Buffer.from(JSON.stringify(v)).toString('base64url');
      const unsigned = `${enc({ alg: 'none', typ: 'JWT' })}.${enc({
        ...base(claims),
        exp: 9e9,
      })}.`;
      expect(
        (await t.http().get(api('/users/me')).set(sessionCookie(unsigned)))
          .status,
      ).toBe(401);
    });

    it('rejects an expired JWT even if the session row is live', async () => {
      const { claims } = await liveClaims();
      const expired = t.jwt.sign(base(claims), { expiresIn: -10 });
      expect(
        (await t.http().get(api('/users/me')).set(sessionCookie(expired)))
          .status,
      ).toBe(401);
    });

    it('rejects a tampered payload (other sub) with the original signature', async () => {
      const { token, claims } = await liveClaims();
      const victim = await createUser(
        t.prisma,
        (await createOrganization(t.prisma)).id,
      );
      const [header, , signature] = token.split('.');
      const payload = Buffer.from(
        JSON.stringify({ ...base(claims), sub: victim.id, exp: 9e9 }),
      ).toString('base64url');
      expect(
        (
          await t
            .http()
            .get(api('/users/me'))
            .set(sessionCookie(`${header}.${payload}.${signature}`))
        ).status,
      ).toBe(401);
    });

    it("cannot point a validly signed JWT at another user's session row", async () => {
      const a = await liveClaims();
      const b = await liveClaims();
      // Signing key leaked: attacker combines own sub with victim's sid.
      const forged = t.jwt.sign({ ...base(a.claims), sid: b.claims.sid });
      expect(
        (await t.http().get(api('/users/me')).set(sessionCookie(forged)))
          .status,
      ).toBe(401);
    });
  });

  describe('revocation races (tokenVersion as second barrier)', () => {
    it('a session row that slipped past a reset/revoke is still rejected', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      // Simulates: login read tokenVersion v, a reset bumped it to v+1 and
      // revoked all rows, then the login inserted its row afterwards.
      await t.prisma.user.update({
        where: { id: user.id },
        data: { tokenVersion: { increment: 1 } },
      });
      await t.prisma.userSession.updateMany({ data: { revokedAt: null } });
      expect(
        (await t.http().get(api('/users/me')).set(asUser(token))).status,
      ).toBe(401);
    });

    it('login racing a password reset never yields a usable session', async () => {
      const { user } = await member();
      await t
        .http()
        .post(api('/auth/forgot-password'))
        .send({ email: user.email });
      const resetToken = new URL(t.mails[0].resetUrl).searchParams.get(
        'token',
      ) as string;
      const [login] = await Promise.all([
        loginAs(t, user),
        t
          .http()
          .post(api('/auth/reset-password'))
          .send({ token: resetToken, password: 'N3w!Passwort-xyz' }),
      ]);
      if (login.status === 201) {
        expect(
          (await t.http().get(api('/users/me')).set(asUser(login.token)))
            .status,
        ).toBe(401);
      } else {
        expect(login.status).toBe(401);
      }
    });
  });

  describe('CSRF bypass attempts', () => {
    it('the CSRF check (not a role or project guard) is what stops every mutation', async () => {
      const { user } = await member('OWNER');
      const token = await tokenFor(t, user);
      const cookieless = new Set([
        'POST /api/v1/auth/login',
        'POST /api/v1/auth/forgot-password',
        'POST /api/v1/auth/reset-password',
      ]);
      const wrong: string[] = [];
      for (const route of listRoutes(t)) {
        if (!['post', 'put', 'patch', 'delete'].includes(route.method)) {
          continue;
        }
        const key = `${route.method.toUpperCase()} ${route.path}`;
        if (cookieless.has(key)) continue;
        const path = route.path.replace(/:[A-Za-z]+/g, randomUUID());
        const response = await send(
          t,
          route.method,
        )(path)
          .set(sessionCookie(token))
          .send({});
        const body = response.body as { message?: unknown; code?: unknown };
        if (
          response.status !== 403 ||
          body?.message !== CSRF_FAILURE ||
          body?.code !== CSRF_CODE
        ) {
          wrong.push(
            `${key} -> ${response.status} ${String(body?.message)} ${String(body?.code)}`,
          );
        }
      }
      expect(wrong).toEqual([]);
    });

    it('logout without the token is refused with 403 and keeps the session', async () => {
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

    it('R2-01: logout reports the same readable CSRF message as every other route', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const response = await t
        .http()
        .post(api('/auth/logout'))
        .set(sessionCookie(token));
      expect(response.body).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        message: CSRF_FAILURE,
        code: CSRF_CODE,
      });
      expect(response.text).not.toContain('\uFFFD');
    });

    it('a token from a logged-out session does not work for the next session', async () => {
      const { user } = await member();
      const first = await tokenFor(t, user);
      const oldCsrf = csrfFor(first);
      await t.http().post(api('/auth/logout')).set(asUser(first));
      const second = await tokenFor(t, user);
      const response = await t
        .http()
        .post(api('/customers'))
        .set(sessionCookie(second))
        .set('X-CSRF-Token', oldCsrf)
        .send({ name: 'X', customerNumber: 'K-1' });
      expect(response.status).toBe(403);
    });

    it('duplicate CSRF headers are not accepted', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const response = await t
        .http()
        .post(api('/customers'))
        .set(sessionCookie(token))
        .set('X-CSRF-Token', `${csrfFor(token)}, ${csrfFor(token)}`)
        .send({ name: 'X', customerNumber: 'K-1' });
      expect(response.status).toBe(403);
      expect(await t.prisma.customer.count()).toBe(0);
    });

    it('a CSRF token in the query string is ignored', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const response = await t
        .http()
        .post(api(`/customers?csrfToken=${csrfFor(token)}`))
        .set(sessionCookie(token))
        .send({ name: 'X', customerNumber: 'K-1' });
      expect(response.status).toBe(403);
    });

    it.each([
      ['/api/v1/auth/LOGIN', 'upper case'],
      ['/api/v1/auth/login/', 'trailing slash'],
    ])(
      'login via path variant (%s, %s) creates no session from a form post',
      async (path) => {
        const { user } = await member();
        const response = await t
          .http()
          .post(path)
          .type('form')
          .send(`email=${encodeURIComponent(user.email)}&password=${PASSWORD}`);
        expect(response.status).toBe(415);
        expect(setCookies(response)).toHaveLength(0);
        expect(await t.prisma.userSession.count()).toBe(0);
      },
    );

    it('R2-03: path variants of the auth endpoints still hit the JSON-only check (415)', async () => {
      const { user } = await member();
      const response = await t
        .http()
        .post('/api/v1/auth/LOGIN/')
        .type('form')
        .send(`email=${encodeURIComponent(user.email)}&password=${PASSWORD}`);
      expect(response.status).toBe(415);
    });
  });

  describe('cookie handling', () => {
    it('a second, attacker-supplied cookie of the same name cannot shadow the real one into a valid session', async () => {
      const { user } = await member();
      const victim = await tokenFor(t, user);
      const response = await t
        .http()
        .get(api('/auth/session'))
        .set(
          'Cookie',
          `bissinger_session=attacker; bissinger_session=${victim}`,
        );
      // First value wins and is invalid: denial of service only, no takeover.
      expect(response.status).toBe(401);
    });

    it('R2-02: a production deployment with NODE_ENV=development still issues a Secure cookie', async () => {
      const { user } = await member();
      const previous = {
        NODE_ENV: process.env.NODE_ENV,
        WEB_ORIGIN: process.env.WEB_ORIGIN,
      };
      process.env.NODE_ENV = 'development';
      process.env.WEB_ORIGIN = 'https://erp.example.com';
      try {
        const response = await t
          .http()
          .post(api('/auth/login'))
          .send({ email: user.email, password: PASSWORD });
        expect(response.status).toBe(201);
        const session = setCookies(response).filter(
          (c) =>
            c.includes('bissinger_session=') &&
            !c.includes('Expires=Thu, 01 Jan 1970'),
        );
        // Exactly one live session cookie, and it is the secure variant.
        expect(session).toHaveLength(1);
        expect(session[0].startsWith('__Host-bissinger_session=')).toBe(true);
        expect(session[0].toLowerCase()).toContain('; secure');
      } finally {
        process.env.NODE_ENV = previous.NODE_ENV;
        process.env.WEB_ORIGIN = previous.WEB_ORIGIN;
      }
    });
  });

  describe('failure behaviour (database errors)', () => {
    it('fails closed when the session lookup throws', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const sessions = t.app.get(SessionService);
      const spy = jest
        .spyOn(sessions, 'findActive')
        .mockRejectedValue(new Error('db down'));
      try {
        const read = await t.http().get(api('/users/me')).set(asUser(token));
        expect(read.status).toBeGreaterThanOrEqual(500);
        expect(JSON.stringify(read.body)).not.toContain(user.email);
        const write = await t
          .http()
          .post(api('/customers'))
          .set(asUser(token))
          .send({ name: 'X', customerNumber: 'K-1' });
        expect(write.status).toBeGreaterThanOrEqual(500);
        expect(JSON.stringify(write.body)).not.toContain(token);
      } finally {
        spy.mockRestore();
      }
      expect(await t.prisma.customer.count()).toBe(0);
    });

    it('logout during a database error reports failure and keeps the cookie', async () => {
      const { user } = await member();
      const token = await tokenFor(t, user);
      const sessions = t.app.get(SessionService);
      const spy = jest
        .spyOn(sessions, 'revoke')
        .mockRejectedValue(new Error('db down'));
      try {
        const response = await t
          .http()
          .post(api('/auth/logout'))
          .set(asUser(token));
        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(
          setCookies(response).some((c) => c.startsWith('bissinger_session=;')),
        ).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
