import * as bcrypt from 'bcrypt';
import {
  bootstrapOwner,
  createUser,
  ProvisioningError,
} from '../src/modules/users/user-provisioning';
import {
  createTestApp,
  loginAs,
  PASSWORD,
  resetDatabase,
  type TestApp,
} from './helpers/harness';

describe('User provisioning (integration)', () => {
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

  const owner = {
    email: 'Chef@Bissinger-Lights.de',
    displayName: 'Chef',
    password: PASSWORD,
  };

  describe('bootstrap', () => {
    it('creates exactly one owner who can log in (case-insensitive e-mail)', async () => {
      const account = await bootstrapOwner(t.prisma, owner);
      expect(account.role).toBe('OWNER');

      expect(
        await t.prisma.organizationMember.count({ where: { role: 'OWNER' } }),
      ).toBe(1);
      expect(
        (await loginAs(t, { email: 'chef@bissinger-lights.de' })).status,
      ).toBe(201);
      expect((await loginAs(t, { email: owner.email })).status).toBe(201);
    });

    it('stores a bcrypt hash and nothing resembling the password', async () => {
      await bootstrapOwner(t.prisma, owner);
      const user = await t.prisma.user.findFirstOrThrow();
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(user.passwordHash).not.toContain(PASSWORD);
      expect(await bcrypt.compare(PASSWORD, user.passwordHash as string)).toBe(
        true,
      );
    });

    it('fails safely when run again and creates no second owner', async () => {
      await bootstrapOwner(t.prisma, owner);
      await expect(
        bootstrapOwner(t.prisma, {
          ...owner,
          email: 'other@bissinger-lights.de',
        }),
      ).rejects.toThrow(ProvisioningError);
      expect(await t.prisma.user.count()).toBe(1);
      expect(
        await t.prisma.organizationMember.count({ where: { role: 'OWNER' } }),
      ).toBe(1);
    });

    it('creates only one owner when started in parallel', async () => {
      const attempts = await Promise.allSettled(
        [1, 2, 3].map((n) =>
          bootstrapOwner(t.prisma, {
            ...owner,
            email: `owner${n}@bissinger-lights.de`,
          }),
        ),
      );
      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
      expect(
        await t.prisma.organizationMember.count({ where: { role: 'OWNER' } }),
      ).toBe(1);
    });

    it('refuses once any owner exists, even an archived one', async () => {
      await bootstrapOwner(t.prisma, owner);
      await t.prisma.user.updateMany({ data: { archivedAt: new Date() } });
      await expect(
        bootstrapOwner(t.prisma, {
          ...owner,
          email: 'second@bissinger-lights.de',
        }),
      ).rejects.toThrow(ProvisioningError);
    });

    it('validates e-mail, name and password', async () => {
      await expect(
        bootstrapOwner(t.prisma, { ...owner, email: 'not-an-email' }),
      ).rejects.toThrow(ProvisioningError);
      await expect(
        bootstrapOwner(t.prisma, { ...owner, displayName: 'A' }),
      ).rejects.toThrow(ProvisioningError);
      await expect(
        bootstrapOwner(t.prisma, { ...owner, password: 'weakpass' }),
      ).rejects.toThrow(ProvisioningError);
      expect(await t.prisma.user.count()).toBe(0);
    });
  });

  describe('create-user', () => {
    it('creates ADMIN and MEMBER accounts', async () => {
      await bootstrapOwner(t.prisma, owner);
      const admin = await createUser(t.prisma, {
        email: 'admin@bissinger-lights.de',
        displayName: 'Admin',
        password: PASSWORD,
        role: 'ADMIN',
      });
      const member = await createUser(t.prisma, {
        email: 'member@bissinger-lights.de',
        displayName: 'Member',
        password: PASSWORD,
        role: 'MEMBER',
      });
      expect([admin.role, member.role]).toEqual(['ADMIN', 'MEMBER']);
      expect((await loginAs(t, admin)).status).toBe(201);
    });

    it('never hands out the OWNER role or unknown roles', async () => {
      await bootstrapOwner(t.prisma, owner);
      for (const role of ['OWNER', 'ROOT', '']) {
        await expect(
          createUser(t.prisma, {
            email: 'x@bissinger-lights.de',
            displayName: 'X Y',
            password: PASSWORD,
            role: role as never,
          }),
        ).rejects.toThrow(ProvisioningError);
      }
      expect(
        await t.prisma.organizationMember.count({ where: { role: 'OWNER' } }),
      ).toBe(1);
    });

    it('refuses duplicates and weak passwords without leaking details', async () => {
      await bootstrapOwner(t.prisma, owner);
      const input = {
        email: 'dup@bissinger-lights.de',
        displayName: 'Dup',
        password: PASSWORD,
        role: 'MEMBER' as const,
      };
      await createUser(t.prisma, input);
      await expect(createUser(t.prisma, input)).rejects.toThrow(
        ProvisioningError,
      );
      await expect(
        createUser(t.prisma, {
          ...input,
          email: 'weak@bissinger-lights.de',
          password: 'password',
        }),
      ).rejects.toThrow(ProvisioningError);
      expect(await t.prisma.user.count()).toBe(2);
    });

    it('requires an existing organization (run bootstrap first)', async () => {
      await expect(
        createUser(t.prisma, {
          email: 'a@bissinger-lights.de',
          displayName: 'Aa',
          password: PASSWORD,
          role: 'MEMBER',
        }),
      ).rejects.toThrow(ProvisioningError);
    });
  });
});
