import type { Prisma } from '../../../generated/prisma/client';

/**
 * Login and every protected request must apply the exact same status rules,
 * so both read the account through this select and judge it with the same
 * function.
 */
export const ACCOUNT_STATE_SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  archivedAt: true,
  tokenVersion: true,
  organizationRoles: {
    orderBy: { joinedAt: 'asc' },
    take: 1,
    select: {
      organizationId: true,
      role: true,
      organization: { select: { status: true, archivedAt: true } },
    },
  },
} satisfies Prisma.UserSelect;

export type AccountState = Prisma.UserGetPayload<{
  select: typeof ACCOUNT_STATE_SELECT;
}>;

/**
 * Returns the membership the account may act through, or null when the
 * account is archived, has no membership, or its organization is suspended
 * or archived.
 */
export function getUsableMembership(account: AccountState | null) {
  if (!account || account.archivedAt) {
    return null;
  }
  const membership = account.organizationRoles[0];
  if (
    !membership ||
    membership.organization.status !== 'ACTIVE' ||
    membership.organization.archivedAt
  ) {
    return null;
  }
  return membership;
}
