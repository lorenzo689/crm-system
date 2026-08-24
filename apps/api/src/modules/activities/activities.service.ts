import { BadRequestException, Injectable } from '@nestjs/common';
import { ActivityType } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ActivitiesRepository,
  ActivityContext,
} from './activities.repository';

type LogActivityParams = {
  type: ActivityType;
  message: string;
  actorUserId?: string;
} & ActivityContext;

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly activitiesRepository: ActivitiesRepository,
    private readonly prisma: PrismaService,
  ) {}

  private async assertContextExists(
    organizationId: string,
    context: ActivityContext,
  ) {
    if (context.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: context.customerId, organizationId },
      });
      if (!customer) {
        throw new BadRequestException('Customer not found');
      }
    }
    if (context.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: context.projectId, organizationId },
      });
      if (!project) {
        throw new BadRequestException('Project not found');
      }
    }
    if (context.taskId) {
      const task = await this.prisma.task.findFirst({
        where: { id: context.taskId, organizationId },
      });
      if (!task) {
        throw new BadRequestException('Task not found');
      }
    }
  }

  async findByContext(organizationId: string, context: ActivityContext) {
    const contextCount = [
      context.customerId,
      context.projectId,
      context.taskId,
    ].filter(Boolean).length;
    if (contextCount === 0) {
      throw new BadRequestException(
        'At least one of customerId, projectId, or taskId must be provided',
      );
    }
    await this.assertContextExists(organizationId, context);
    return this.activitiesRepository.findByContext(context);
  }

  async log(params: LogActivityParams) {
    const contextCount = [
      params.customerId,
      params.projectId,
      params.taskId,
    ].filter(Boolean).length;
    if (contextCount !== 1) {
      // Interner Programmierfehler, kein User-Input-Fehler - bewusst kein
      // HTTP-Exception, da log() nie direkt vom Controller aufgerufen wird
      throw new Error(
        'Activity must have exactly one context (customerId, projectId, or taskId)',
      );
    }

    return this.activitiesRepository.create({
      customerId: params.customerId,
      projectId: params.projectId,
      taskId: params.taskId,
      actorUserId: params.actorUserId,
      type: params.type,
      message: params.message,
    });
  }
}
