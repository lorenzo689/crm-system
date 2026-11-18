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
    user: { findFirst: jest.fn() },
    passwordResetToken: { create: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof tx) => unknown)(tx)
        : Promise.resolve([]),
    ),
  };
  const jwt = { sign: jest.fn().mockReturnValue('signed') };
  const mail = {
    isConfigured: jest.fn().mockReturnValue(true),
    sendPasswordReset: jest.fn(),
  };
  const service = new AuthService(prisma as never, jwt as never, mail as never);
  return { service, prisma, tx, jwt, mail };
}

type MockCalls = { mock: { calls: unknown[][] } };
/** First argument of the first call, typed for assertions. */
const firstArg = <T>(fn: MockCalls) => fn.mock.calls[0][0] as T;

const credentials = { email: 'a@b.de', password: 'Passw0rd!xyz' };

describe('AuthService', () => {
  describe('login', () => {
    it('returns a token carrying the current token version', async () => {
      const { service, prisma, jwt } = createService();
      prisma.user.findFirst.mockResolvedValue(accountState());
      await expect(service.login(credentials)).resolves.toEqual({
        accessToken: 'signed',
      });
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'u1',
        email: 'a@b.de',
        tv: 3,
      });
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
      await expect(service.login(credentials)).rejects.toThrow(
        new UnauthorizedException('E-Mail oder Passwort falsch'),
      );
    });

    it('uses the same message for a wrong password', async () => {
      const { service, prisma } = createService();
      prisma.user.findFirst.mockResolvedValue(accountState());
      await expect(
        service.login({ ...credentials, password: 'Wrong0ne!xyz' }),
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
