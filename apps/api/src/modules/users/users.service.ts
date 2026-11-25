import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class UsersService {
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

    const { organizationRoles, ...profile } = user;
    void organizationRoles; // replaced by the flattened fields below
    return {
      ...profile,
      organizationName: membership.organization.name,
      organizationRole: membership.role,
    };
  }

  async getOrganizationId(userId: string): Promise<string> {
    return (await this.getMembership(userId)).organizationId;
  }

  /** Always read from the database so role and membership changes apply immediately. */
  async getMembership(userId: string) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      select: { organizationId: true, role: true },
    });

    if (!membership) {
      throw new ForbiddenException('User has no organization membership');
    }
    return membership;
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
