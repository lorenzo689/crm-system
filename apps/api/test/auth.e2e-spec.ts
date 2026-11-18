import {
  bearer,
  createOrganization,
  createTestApp,
  createUser,
  loginAs,
  PASSWORD,
  resetDatabase,
  type TestApp,
  tokenFor,
} from './helpers/harness';

const PROTECTED = '/api/v1/users/me';

describe('Authentication (integration)', () => {
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

  describe('registration is closed', () => {
    it('answers 404 and creates no user', async () => {
      const org = await createOrganization(t.prisma);
      const before = await t.prisma.user.count();

      const response = await t.http().post('/api/v1/auth/register').send({
        email: 'new@bissinger-lights.de',
        displayName: 'Intruder',
        password: PASSWORD,
        registrationCode: 'whatever',
      });

      expect(response.status).toBe(404);
      expect(await t.prisma.user.count()).toBe(before);
      expect(await t.prisma.organizationMember.count()).toBe(0);
      expect(org.id).toBeDefined();
    });

    it('still 404s even when a REGISTRATION_CODE is configured', async () => {
      process.env.REGISTRATION_CODE = 'legacy-code';
      try {
        const response = await t.http().post('/api/v1/auth/register').send({
          email: 'new@bissinger-lights.de',
          displayName: 'Intruder',
          password: PASSWORD,
          registrationCode: 'legacy-code',
        });
        expect(response.status).toBe(404);
        expect(await t.prisma.user.count()).toBe(0);
      } finally {
        delete process.env.REGISTRATION_CODE;
      }
    });
  });

  describe('login', () => {
    it('lets a valid user in and the token works', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);

      const { status, token } = await loginAs(t, user);
      expect(status).toBe(201);

      const me = await t.http().get(PROTECTED).set(bearer(token));
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ email: user.email });
    });

    it('rejects a wrong password and an unknown account identically', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);

      const wrong = await loginAs(t, user, 'Wrong0ne!Pass');
      const unknown = await loginAs(t, { email: 'ghost@bissinger-lights.de' });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);

      const body = async (email: string, password: string) =>
        (await t.http().post('/api/v1/auth/login').send({ email, password }))
          .body as { message: string };
      expect(await body(user.email, 'Wrong0ne!Pass')).toEqual(
        await body('ghost@bissinger-lights.de', PASSWORD),
      );
    });

    it('rejects an archived user', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id, 'MEMBER', {
        archived: true,
      });
      expect((await loginAs(t, user)).status).toBe(401);
    });

    it('rejects a user without organization membership', async () => {
      const user = await createUser(t.prisma, null);
      expect((await loginAs(t, user)).status).toBe(401);
    });

    it('rejects users of a suspended organization', async () => {
      const org = await createOrganization(t.prisma, 'SUSPENDED');
      const user = await createUser(t.prisma, org.id);
      expect((await loginAs(t, user)).status).toBe(401);
    });
  });

  describe('JWT validation', () => {
    const secret = () => process.env.JWT_SECRET as string;

    it('rejects an expired token', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const expired = t.jwt.sign(
        { sub: user.id, email: user.email, tv: 0 },
        { secret: secret(), algorithm: 'HS256', expiresIn: -10 },
      );
      const response = await t.http().get(PROTECTED).set(bearer(expired));
      expect(response.status).toBe(401);
    });

    it('rejects a tampered token', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const token = await tokenFor(t, user);
      const [header, , signature] = token.split('.');
      const forgedPayload = Buffer.from(
        JSON.stringify({ sub: user.id, email: 'evil@x.de', tv: 0, exp: 9e9 }),
      ).toString('base64url');
      const response = await t
        .http()
        .get(PROTECTED)
        .set(bearer(`${header}.${forgedPayload}.${signature}`));
      expect(response.status).toBe(401);
    });

    it('rejects a token signed with another algorithm', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const hs512 = t.jwt.sign(
        { sub: user.id, email: user.email, tv: 0 },
        { secret: secret(), algorithm: 'HS512', expiresIn: 600 },
      );
      expect((await t.http().get(PROTECTED).set(bearer(hs512))).status).toBe(
        401,
      );
    });

    it('rejects an unsigned "alg: none" token', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const encode = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
        sub: user.id,
        email: user.email,
        tv: 0,
        exp: 9e9,
      })}.`;
      expect((await t.http().get(PROTECTED).set(bearer(unsigned))).status).toBe(
        401,
      );
    });

    it('rejects a validly signed token that carries no token version', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const legacy = t.jwt.sign(
        { sub: user.id, email: user.email },
        { secret: secret(), algorithm: 'HS256', expiresIn: 600 },
      );
      expect((await t.http().get(PROTECTED).set(bearer(legacy))).status).toBe(
        401,
      );
    });

    it('issues tokens that live at most 8 hours', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const token = await tokenFor(t, user);
      const { iat, exp } = t.jwt.decode<{ iat: number; exp: number }>(token);
      expect(exp - iat).toBeLessThanOrEqual(8 * 60 * 60);
    });

    it('answers 401 without a token', async () => {
      expect((await t.http().get(PROTECTED)).status).toBe(401);
    });
  });

  describe('account lock and session invalidation', () => {
    it('works before the lock and stops working right after it', async () => {
      const org = await createOrganization(t.prisma);
      const admin = await createUser(t.prisma, org.id, 'OWNER');
      const member = await createUser(t.prisma, org.id);
      const memberToken = await tokenFor(t, member);
      const adminToken = await tokenFor(t, admin);

      expect(
        (await t.http().get(PROTECTED).set(bearer(memberToken))).status,
      ).toBe(200);

      const lock = await t
        .http()
        .post(`/api/v1/users/${member.id}/deactivate`)
        .set(bearer(adminToken));
      expect(lock.status).toBe(200);

      expect(
        (await t.http().get(PROTECTED).set(bearer(memberToken))).status,
      ).toBe(401);
      expect((await loginAs(t, member)).status).toBe(401);
    });

    it('invalidates a token when the account is archived directly in the database', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const token = await tokenFor(t, user);
      await t.prisma.user.update({
        where: { id: user.id },
        data: { archivedAt: new Date() },
      });
      expect((await t.http().get(PROTECTED).set(bearer(token))).status).toBe(
        401,
      );
    });

    it('stops tokens when the organization gets suspended', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const token = await tokenFor(t, user);
      await t.prisma.organization.update({
        where: { id: org.id },
        data: { status: 'SUSPENDED' },
      });
      expect((await t.http().get(PROTECTED).set(bearer(token))).status).toBe(
        401,
      );
    });

    it('stops tokens when the membership is removed', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const token = await tokenFor(t, user);
      await t.prisma.organizationMember.deleteMany({
        where: { userId: user.id },
      });
      expect((await t.http().get(PROTECTED).set(bearer(token))).status).toBe(
        401,
      );
    });

    it('validates the token version on every request', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const token = await tokenFor(t, user);
      expect((await t.http().get(PROTECTED).set(bearer(token))).status).toBe(
        200,
      );

      await t.prisma.user.update({
        where: { id: user.id },
        data: { tokenVersion: { increment: 1 } },
      });
      expect((await t.http().get(PROTECTED).set(bearer(token))).status).toBe(
        401,
      );
      // A fresh login carries the new version and works.
      const fresh = await tokenFor(t, user);
      expect((await t.http().get(PROTECTED).set(bearer(fresh))).status).toBe(
        200,
      );
    });

    it('revokes sessions on demand without locking the account', async () => {
      const org = await createOrganization(t.prisma);
      const owner = await createUser(t.prisma, org.id, 'OWNER');
      const member = await createUser(t.prisma, org.id);
      const memberToken = await tokenFor(t, member);

      const response = await t
        .http()
        .post(`/api/v1/users/${member.id}/revoke-sessions`)
        .set(bearer(await tokenFor(t, owner)));
      expect(response.status).toBe(200);
      expect(
        (await t.http().get(PROTECTED).set(bearer(memberToken))).status,
      ).toBe(401);
      expect((await loginAs(t, member)).status).toBe(201);
    });
  });

  describe('password reset', () => {
    async function requestResetToken(email: string) {
      const before = t.mails.length;
      const response = await t
        .http()
        .post('/api/v1/auth/forgot-password')
        .send({ email });
      expect(response.status).toBe(201);
      expect(t.mails.length).toBe(before + 1);
      return new URL(t.mails[t.mails.length - 1].resetUrl).searchParams.get(
        'token',
      ) as string;
    }
    const reset = (token: string, password: string) =>
      t.http().post('/api/v1/auth/reset-password').send({ token, password });

    it('invalidates tokens issued before the reset', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const oldToken = await tokenFor(t, user);
      const resetToken = await requestResetToken(user.email);

      const done = await reset(resetToken, 'N3w!Passwort-xyz');
      expect(done.status).toBe(201);

      expect((await t.http().get(PROTECTED).set(bearer(oldToken))).status).toBe(
        401,
      );
      expect((await loginAs(t, user)).status).toBe(401);
      expect((await loginAs(t, user, 'N3w!Passwort-xyz')).status).toBe(201);
    });

    it('stores only a hash of the reset token', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const raw = await requestResetToken(user.email);
      const stored = await t.prisma.passwordResetToken.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(stored.token).not.toBe(raw);
      expect(stored.token).toHaveLength(64);
    });

    it('lets a token be used only once, even in parallel', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const token = await requestResetToken(user.email);

      const results = await Promise.all(
        [1, 2, 3, 4].map((n) => reset(token, `Parallel!Pass-${n}x`)),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400)).toHaveLength(3);
    });

    it('rejects weak passwords and expired tokens', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id);
      const token = await requestResetToken(user.email);
      expect((await reset(token, 'short')).status).toBe(400);

      await t.prisma.passwordResetToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await reset(token, 'N3w!Passwort-xyz')).status).toBe(400);
    });

    it('does not reveal whether an address is registered', async () => {
      const unknown = await t
        .http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'ghost@bissinger-lights.de' });
      expect(unknown.status).toBe(201);
      expect(t.mails).toHaveLength(0);
    });

    it('sends nothing for archived users', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id, 'MEMBER', {
        archived: true,
      });
      await t
        .http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: user.email });
      expect(t.mails).toHaveLength(0);
    });
  });
});

describe('Rate limiting (integration)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ throttling: true });
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('throttles repeated login attempts', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@bissinger-lights.de', password: PASSWORD });
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
  });
});
