import { SetMetadata } from '@nestjs/common';
import type { OrganizationMemberRole } from '../../../../generated/prisma/client';

export const ROLES_KEY = 'organizationRoles';

/** Restricts a route to the given organization roles (enforced by RolesGuard). */
export const Roles = (...roles: OrganizationMemberRole[]) =>
  SetMetadata(ROLES_KEY, roles);
