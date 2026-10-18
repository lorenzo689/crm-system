import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationMemberRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const ORGANIZATION_CACHE_TTL_MS = 60_000;
const ORGANIZATION_CACHE_MAX_ENTRIES = 1000;

@Injectable()
export class UsersService {
  // Nearly every request resolves the caller's organization; memberships
  // change rarely, so a short-lived cache saves one query per request.
  private readonly organizationCache = new Map<
    string,
    { organizationId: string; role: OrganizationMemberRole; expiresAt: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
        archivedAt: true,
        organizationRoles: {
          orderBy: { joinedAt: 'asc' },
          take: 1,
          select: {
            role: true,
            organization: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [membership] = user.organizationRoles;
    if (!membership) {
      throw new ForbiddenException('User has no organization membership');
    }

    const { organizationRoles: _organizationRoles, ...profile } = user;
    return {
      ...profile,
      organizationName: membership.organization.name,
      organizationRole: membership.role,
    };
  }

  async getOrganizationId(userId: string): Promise<string> {
    return (await this.getMembership(userId)).organizationId;
  }

  async getMembership(userId: string) {
    const cached = this.organizationCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      select: { organizationId: true, role: true },
    });

    if (!membership) {
      throw new ForbiddenException('User has no organization membership');
    }

    if (this.organizationCache.size >= ORGANIZATION_CACHE_MAX_ENTRIES) {
      this.organizationCache.clear();
    }
    const entry = {
      organizationId: membership.organizationId,
      role: membership.role,
      expiresAt: Date.now() + ORGANIZATION_CACHE_TTL_MS,
    };
    this.organizationCache.set(userId, entry);
    return entry;
  }

  /** Throws unless the user is an owner or admin of their organization. */
  async assertAdmin(userId: string) {
    const membership = await this.getMembership(userId);
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw new ForbiddenException('Administrator rights required');
    }
    return membership.organizationId;
  }

  async findAllInOrganization(organizationId: string) {
    return this.prisma.user.findMany({
      where: {
        organizationRoles: {
          some: { organizationId },
        },
        archivedAt: null,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
      },
      orderBy: { displayName: 'asc' },
    });
  }
}
