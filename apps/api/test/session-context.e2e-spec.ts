/**
 * Sprint 3.1: the non-secret session-context marker.
 *
 * Every authenticated answer carries X-Session-Context; login and session
 * bodies carry the same value as `contextId`. It changes with session, user,
 * organization and role, is not the CSRF token, not the session secret and not
 * a credential: it is never read as input.
 */
import {
  asUser,
  createOrganization,
  createTestApp,
  createUser,
  loginAs,
  resetDatabase,
  sessionCookie,
  type TestApp,
} from './helpers/harness';

const api = (path: string) => `/api/v1${path}`;
const HEADER = 'x-session-context';

describe('session context marker', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  async function owner() {
    const org = await createOrganization(t.prisma);
    const user = await createUser(t.prisma, org.id, 'OWNER');
    return { org, user, login: await loginAs(t, user) };
  }

  const contextOf = (response: { headers: Record<string, unknown> }) =>
    response.headers[HEADER] as string | undefined;

  it('login and /auth/session agree, and every guarded answer repeats the marker', async () => {
    const { login } = await owner();
    const loginBody = login.response.body as {
      contextId: string;
      csrfToken: string;
    };
    expect(loginBody.contextId).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const session = await t
      .http()
      .get(api('/auth/session'))
      .set(sessionCookie(login.token));
    expect(session.status).toBe(200);
    expect((session.body as { contextId: string }).contextId).toBe(
      loginBody.contextId,
    );
    expect(contextOf(session)).toBe(loginBody.contextId);

    const guarded = await t
      .http()
      .get(api('/customers'))
      .set(sessionCookie(login.token));
    expect(guarded.status).toBe(200);
    expect(contextOf(guarded)).toBe(loginBody.contextId);
  });

  it('is not a credential: not the CSRF token, not part of the cookie, and never accepted as input', async () => {
    const { login } = await owner();
    const { contextId, csrfToken } = login.response.body as {
      contextId: string;
      csrfToken: string;
    };
    expect(contextId).not.toBe(csrfToken);
    expect(login.token).not.toContain(contextId);

    // Sending the marker instead of (or next to) the cookie authenticates nothing.
    const forged = await t.http().get(api('/customers')).set(HEADER, contextId);
    expect(forged.status).toBe(401);
    expect(contextOf(forged)).toBeUndefined();
    // And as CSRF token it is rejected too.
    const asCsrf = await t
      .http()
      .post(api('/customers'))
      .set({ ...sessionCookie(login.token), 'X-CSRF-Token': contextId })
      .send({ name: 'x' });
    expect(asCsrf.status).toBe(403);
  });

  it('differs per session of the same user and per user', async () => {
    const { user, login } = await owner();
    const second = await loginAs(t, user);
    const org = await createOrganization(t.prisma);
    const other = await createUser(t.prisma, org.id, 'OWNER');
    const third = await loginAs(t, other);
    const ids = [login, second, third].map(
      (l) => (l.response.body as { contextId: string }).contextId,
    );
    expect(new Set(ids).size).toBe(3);
  });

  it('changes when the role changes while the session stays the same', async () => {
    const { org, user, login } = await owner();
    const before = (
      await t.http().get(api('/auth/session')).set(sessionCookie(login.token))
    ).headers[HEADER];
    await t.prisma.organizationMember.updateMany({
      where: { organizationId: org.id, userId: user.id },
      data: { role: 'MEMBER' },
    });
    const after = (
      await t.http().get(api('/auth/session')).set(sessionCookie(login.token))
    ).headers[HEADER];
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
  });

  it('is absent from unauthenticated answers and from rejected sessions', async () => {
    const anonymous = await t.http().get(api('/auth/session'));
    expect(anonymous.status).toBe(401);
    expect(contextOf(anonymous)).toBeUndefined();
  });

  it('is exposed to a cross-origin development frontend (CORS) together with the file name', async () => {
    const { login } = await owner();
    const response = await t
      .http()
      .get(api('/auth/session'))
      .set({ ...asUser(login.token), Origin: 'http://localhost:3000' });
    const exposed = String(
      response.headers['access-control-expose-headers'] ?? '',
    );
    expect(exposed.toLowerCase()).toContain('x-session-context');
  });
});
