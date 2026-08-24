import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

export type ActivityContext = {
  customerId?: string;
  projectId?: string;
  taskId?: string;
};

@Injectable()
export class ActivitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByContext(context: ActivityContext) {
    const where: Prisma.ActivityWhereInput = {
      ...(context.customerId && { customerId: context.customerId }),
      ...(context.projectId && { projectId: context.projectId }),
      ...(context.taskId && { taskId: context.taskId }),
    };

    return this.prisma.activity.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      include: {
        actor: { select: { id: true, displayName: true } },
      },
    });
  }

  async create(data: Prisma.ActivityUncheckedCreateInput) {
    return this.prisma.activity.create({ data });
  }
}
