import * as bcrypt from 'bcrypt';
import type {
  OrganizationMemberRole,
  PrismaClient,
} from '../../../generated/prisma/client';
import { validatePassword } from '../auth/password-policy';

export const BISSINGER_ORG_SLUG = 'bissinger-lights';
const BISSINGER_ORG_NAME = 'Bissinger Lights';
const SALT_ROUNDS = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Roles an operator may hand out; OWNER only ever comes from bootstrap. */
export const PROVISIONABLE_ROLES = ['ADMIN', 'MEMBER'] as const;

export class ProvisioningError extends Error {}

export interface NewAccountInput {
  email: string;
  displayName: string;
  password: string;
}

/**
 * E-mail strategy: addresses are trimmed and stored in lower case; comparison
 * (login, reset, duplicate checks) is case-insensitive; the database enforces
 * it with a unique index on lower(email). Accounts that predate this rule keep
 * their stored spelling.
 */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function emailTaken(client: Pick<PrismaClient, 'user'>, email: string) {
  const existing = await client.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  return existing !== null;
}

/** Lists addresses used by several accounts that differ only in case (nothing is changed). */
export async function findEmailConflicts(prisma: PrismaClient) {
  return prisma.$queryRaw<{ email: string; accounts: number }[]>`
    SELECT lower("email") AS email, count(*)::int AS accounts
      FROM "users"
     GROUP BY lower("email")
    HAVING count(*) > 1
     ORDER BY 1`;
}

function validateInput(input: NewAccountInput) {
  const email = normalizeEmail(input.email);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new ProvisioningError('Ungültige E-Mail-Adresse.');
  }
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 100) {
    throw new ProvisioningError(
      'Der Name muss zwischen 2 und 100 Zeichen lang sein.',
    );
  }
  const passwordProblem = validatePassword(input.password);
  if (passwordProblem) {
    throw new ProvisioningError(passwordProblem);
  }
  return { email, displayName };
}

/**
 * Creates the very first OWNER. The organization row is locked so two parallel
 * bootstrap runs cannot both succeed, and it refuses as soon as any OWNER
 * exists (even an archived one).
 */
export async function bootstrapOwner(
  prisma: PrismaClient,
  input: NewAccountInput,
  organizationSlug = BISSINGER_ORG_SLUG,
) {
  const { email, displayName } = validateInput(input);
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    await tx.organization.upsert({
      where: { slug: organizationSlug },
      update: {},
      create: { slug: organizationSlug, name: BISSINGER_ORG_NAME },
    });
    // Serialises concurrent bootstrap runs on this organization.
    await tx.$queryRaw`SELECT id FROM organizations WHERE slug = ${organizationSlug} FOR UPDATE`;
    const organization = await tx.organization.findUniqueOrThrow({
      where: { slug: organizationSlug },
    });

    const owners = await tx.organizationMember.count({
      where: { organizationId: organization.id, role: 'OWNER' },
    });
    if (owners > 0) {
      throw new ProvisioningError(
        'Bootstrap nicht möglich: Es existiert bereits ein Owner. Weitere Konten bitte mit "create-user" anlegen.',
      );
    }

    if (await emailTaken(tx, email)) {
      throw new ProvisioningError(
        'Ein Konto mit dieser E-Mail-Adresse existiert bereits.',
      );
    }

    const user = await tx.user.create({
      data: {
        email,
        displayName,
        passwordHash,
        organizationRoles: {
          create: { organizationId: organization.id, role: 'OWNER' },
        },
      },
      select: { id: true, email: true },
    });
    return { id: user.id, email: user.email, role: 'OWNER' as const };
  });
}

/** Creates an ADMIN or MEMBER in the existing organization. */
export async function createUser(
  prisma: PrismaClient,
  input: NewAccountInput & { role: OrganizationMemberRole },
  organizationSlug = BISSINGER_ORG_SLUG,
) {
  if (!(PROVISIONABLE_ROLES as readonly string[]).includes(input.role)) {
    throw new ProvisioningError(
      `Ungültige Rolle. Erlaubt: ${PROVISIONABLE_ROLES.join(', ')}.`,
    );
  }
  const { email, displayName } = validateInput(input);
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
  });
  if (!organization || organization.status !== 'ACTIVE') {
    throw new ProvisioningError(
      'Die Organisation existiert nicht oder ist nicht aktiv. Zuerst "bootstrap" ausführen.',
    );
  }

  if (await emailTaken(prisma, email)) {
    throw new ProvisioningError(
      'Ein Konto mit dieser E-Mail-Adresse existiert bereits.',
    );
  }

  try {
    const user = await prisma.user.create({
      data: {
        email,
        displayName,
        passwordHash,
        organizationRoles: {
          create: { organizationId: organization.id, role: input.role },
        },
      },
      select: { id: true, email: true },
    });
    return { id: user.id, email: user.email, role: input.role };
  } catch (error) {
    // A parallel run created the same address between check and insert.
    if ((error as { code?: string }).code === 'P2002') {
      throw new ProvisioningError(
        'Ein Konto mit dieser E-Mail-Adresse existiert bereits.',
      );
    }
    throw error;
  }
}
