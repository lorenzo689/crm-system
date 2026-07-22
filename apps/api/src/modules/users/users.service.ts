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
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

    return user; 
  }

  async getOrganizationId(userId: string): Promise<string> {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId },
      select: { organizationId: true },
    });

    if (!membership) {
      throw new ForbiddenException('User has no organization membership');
    }

    return membership.organizationId;
  }
}
