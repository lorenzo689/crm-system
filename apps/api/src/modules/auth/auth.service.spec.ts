import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';

function accountState(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'a@b.de',
    passwordHash: bcrypt.hashSync('Passw0rd!xyz', 4),
    archivedAt: null,
    tokenVersion: 3,
    organizationRoles: [
      {
        organizationId: 'org1',
        role: 'MEMBER',
        organization: { status: 'ACTIVE', archivedAt: null },
      },
    ],
    ...overrides,
  };
}

function createService() {
  const tx = {
    passwordResetToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ userId: 'u1' }),
    },
    user: { update: jest.fn() },
  };
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@b.de',
        displayName: 'A B',
        organizationRoles: [{ organization: { id: 'org1', name: 'Org' } }],
      }),
    },
    passwordResetToken: { create: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof tx) => unknown)(tx)
        : Promise.resolve([]),
    ),
  };
  const jwt = {
    sign: jest.fn().mockReturnValue('signed'),
    verify: jest.fn(() => {
      throw new Error('invalid');
    }),
  };
  const sessions = {
    create: jest.fn().mockResolvedValue({
      cookieValue: 'cookie-jwt',
      sessionId: 'sess-1',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      csrfToken: 'csrf',
    }),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
    findActive: jest.fn(),
  };
  const mail = {
    isConfigured: jest.fn().mockReturnValue(true),
    sendPasswordReset: jest.fn(),
  };
  const service = new AuthService(
    prisma as never,
    jwt as never,
    mail as never,
    sessions as never,
  );
  return { service, prisma, tx, jwt, mail, sessions };
}

type MockCalls = { mock: { calls: unknown[][] } };
/** First argument of the first call, typed for assertions. */
const firstArg = <T>(fn: MockCalls) => fn.mock.calls[0][0] as T;

const credentials = { email: 'a@b.de', password: 'Passw0rd!xyz' };

describe('AuthService', () => {
  describe('login', () => {
    it('opens a new session and never puts the cookie value in the body', async () => {
      const { service, prisma, sessions } = createService();
      prisma.user.findFirst.mockResolvedValue(accountState());
      const result = await service.login(credentials, null);

      expect(sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', tokenVersion: 3 }),
      );
      expect(result.issued.cookieValue).toBe('cookie-jwt');
      expect(JSON.stringify(result.body)).not.toContain('cookie-jwt');
      expect(result.body).toMatchObject({
        user: { id: 'u1', email: 'a@b.de' },
        organization: { id: 'org1' },
        role: 'MEMBER',
      });
      expect(typeof result.body.csrfToken).toBe('string');
    });

    it('revokes a validly signed session the browser already presented', async () => {
      const { service, prisma, sessions, jwt } = createService();
      prisma.user.findFirst.mockResolvedValue(accountState());
      jwt.verify.mockReturnValue({
        sub: 'someone',
        sid: 'old-session',
        jti: 'x',
        tv: 0,
      } as never);
      await service.login(credentials, 'old-cookie');
      expect(sessions.revoke).toHaveBeenCalledWith('old-session');
    });

    it.each([
      ['an unknown account', null],
      ['an archived user', accountState({ archivedAt: new Date() })],
      ['a user without membership', accountState({ organizationRoles: [] })],
      [
        'a suspended organization',
        accountState({
          organizationRoles: [
            {
              organizationId: 'org1',
              role: 'MEMBER',
              organization: { status: 'SUSPENDED', archivedAt: null },
            },
          ],
        }),
      ],
    ])('rejects %s with the generic message', async (_name, account) => {
      const { service, prisma } = createService();
      prisma.user.findFirst.mockResolvedValue(account);
      await expect(service.login(credentials, null)).rejects.toThrow(
        new UnauthorizedException('E-Mail oder Passwort falsch'),
      );
    });

    it('uses the same message for a wrong password', async () => {
      const { service, prisma } = createService();
      prisma.user.findFirst.mockResolvedValue(accountState());
      await expect(
        service.login({ ...credentials, password: 'Wrong0ne!xyz' }, null),
      ).rejects.toThrow('E-Mail oder Passwort falsch');
    });
  });

  describe('password reset tokens', () => {
    it('stores only a hash of the token that is mailed out', async () => {
      const { service, prisma, mail } = createService();
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'a@b.de',
        archivedAt: null,
      });
      await service.forgotPassword({ email: 'a@b.de' });

      const mailed = firstArg<{ resetUrl: string }>(
        mail.sendPasswordReset,
      ).resetUrl;
      const rawToken = new URL(mailed).searchParams.get('token') as string;
      const stored = firstArg<{ data: { token: string } }>(
        prisma.passwordResetToken.create,
      ).data.token;
      expect(stored).not.toBe(rawToken);
      expect(stored).toBe(createHash('sha256').update(rawToken).digest('hex'));
    });

    it('does not send mail for archived users', async () => {
      const { service, prisma, mail } = createService();
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'a@b.de',
        archivedAt: new Date(),
      });
      await service.forgotPassword({ email: 'a@b.de' });
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('consumes tokens by hash with a single conditional update', async () => {
      const { service, tx } = createService();
      await expect(
        service.resetPassword({ token: 'raw', password: 'Passw0rd!xyz' }),
      ).rejects.toThrow();
      const call = firstArg<{ where: { token: string; usedAt: null } }>(
        tx.passwordResetToken.updateMany,
      );
      expect(call.where.token).toBe(
        createHash('sha256').update('raw').digest('hex'),
      );
      expect(call.where.usedAt).toBeNull();
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });
});
