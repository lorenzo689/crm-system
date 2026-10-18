import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';

const registerDto = {
  email: 'new@bissinger-lights.de',
  displayName: 'New User',
  password: 'Passw0rd!x',
  registrationCode: 'secret-code',
};

function createService() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'u1', email: registerDto.email }),
      update: jest.fn(),
    },
    organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org1' }) },
    organizationMember: { count: jest.fn().mockResolvedValue(1) },
    passwordResetToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const jwt = { sign: jest.fn().mockReturnValue('signed') };
  const mail = {
    isConfigured: jest.fn().mockReturnValue(true),
    sendPasswordReset: jest.fn(),
  };
  const service = new AuthService(prisma as never, jwt as never, mail as never);
  return { service, prisma, mail };
}

type MockCalls = { mock: { calls: unknown[][] } };
/** First argument of the first call, typed for assertions. */
const firstArg = <T>(fn: MockCalls) => fn.mock.calls[0][0] as T;
type CreatedUser = {
  data: { organizationRoles: { create: { role: string } } };
};

describe('AuthService', () => {
  const originalCode = process.env.REGISTRATION_CODE;
  afterEach(() => {
    process.env.REGISTRATION_CODE = originalCode;
  });

  describe('register', () => {
    it('is disabled while no registration code is configured', async () => {
      delete process.env.REGISTRATION_CODE;
      const { service, prisma } = createService();
      await expect(service.register(registerDto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a wrong registration code', async () => {
      process.env.REGISTRATION_CODE = 'secret-code';
      const { service, prisma } = createService();
      await expect(
        service.register({ ...registerDto, registrationCode: 'nope' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('makes the first member of an organization its owner', async () => {
      process.env.REGISTRATION_CODE = 'secret-code';
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organizationMember.count.mockResolvedValue(0);
      await service.register(registerDto);
      const { data } = firstArg<CreatedUser>(prisma.user.create);
      expect(data.organizationRoles.create.role).toBe('OWNER');
    });

    it('registers later members as MEMBER', async () => {
      process.env.REGISTRATION_CODE = 'secret-code';
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue(null);
      await service.register(registerDto);
      const { data } = firstArg<CreatedUser>(prisma.user.create);
      expect(data.organizationRoles.create.role).toBe('MEMBER');
    });
  });

  describe('login', () => {
    it('rejects archived users even with a correct password', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.de',
        passwordHash: await bcrypt.hash('Passw0rd!x', 4),
        archivedAt: new Date(),
      });
      await expect(
        service.login({ email: 'a@b.de', password: 'Passw0rd!x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns a token for valid credentials', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.de',
        passwordHash: await bcrypt.hash('Passw0rd!x', 4),
        archivedAt: null,
      });
      await expect(
        service.login({ email: 'a@b.de', password: 'Passw0rd!x' }),
      ).resolves.toEqual({ accessToken: 'signed' });
    });
  });

  describe('password reset tokens', () => {
    it('stores only a hash of the token that is mailed out', async () => {
      const { service, prisma, mail } = createService();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.de' });
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

    it('looks tokens up by hash when resetting', async () => {
      const { service, prisma } = createService();
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword({ token: 'raw', password: 'Passw0rd!x' }),
      ).rejects.toThrow();
      expect(
        firstArg<{ where: { token: string } }>(
          prisma.passwordResetToken.findUnique,
        ).where.token,
      ).toBe(createHash('sha256').update('raw').digest('hex'));
    });
  });
});
