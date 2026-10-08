import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Prisma,
  type TaskAssignmentRole,
} from '../../../generated/prisma/client';

export type TaskListFilters = {
  projectId?: string;
  /** Only tasks without a project (project=none). Wins over projectId. */
  withoutProject?: boolean;
  assigneeId?: string;
  status?: Prisma.TaskWhereInput['status'];
  priority?: Prisma.TaskWhereInput['priority'];
  due?: 'overdue' | 'today' | 'upcoming';
  archived?: boolean;
  search?: string;
};

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters: TaskListFilters) {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const where: Prisma.TaskWhereInput = {
      organizationId,
      ...(filters.projectId && { projectId: filters.projectId }),
      ...(filters.withoutProject && { projectId: null }),
      ...(filters.status && { status: filters.status }),
      ...(filters.priority && { priority: filters.priority }),
      ...(filters.archived === true && { archivedAt: { not: null } }),
      ...(filters.archived === false && { archivedAt: null }),
      ...(filters.assigneeId && {
        assignments: { some: { userId: filters.assigneeId } },
      }),
      ...(filters.search && {
        title: { contains: filters.search, mode: 'insensitive' },
      }),
      ...(filters.due === 'overdue' && {
        dueAt: { lt: startOfToday },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      }),
      ...(filters.due === 'today' && {
        dueAt: { gte: startOfToday, lt: endOfToday },
      }),
      ...(filters.due === 'upcoming' && {
        dueAt: { gte: endOfToday },
      }),
    };

    return this.prisma.task.findMany({
      where,
      orderBy: { dueAt: 'asc' },
      include: {
        project: { select: { id: true, name: true, projectNumber: true } },
        assignments: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  }

  async findById(id: string, organizationId: string) {
    return this.prisma.task.findFirst({
      where: { id, organizationId },
      include: {
        project: { select: { id: true, name: true, projectNumber: true } },
        assignments: {
          include: {
            user: { select: { id: true, displayName: true, email: true } },
          },
        },
        createdBy: { select: { id: true, displayName: true } },
      },
    });
  }

  async create(data: Prisma.TaskUncheckedCreateInput) {
    return this.prisma.task.create({
      data,
      include: {
        project: { select: { id: true, name: true, projectNumber: true } },
        assignments: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  }

  async update(id: string, data: Prisma.TaskUpdateInput) {
    return this.prisma.task.update({
      where: { id },
      data,
      include: {
        project: { select: { id: true, name: true, projectNumber: true } },
        assignments: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  }

  async archive(id: string) {
    return this.prisma.task.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  async unarchive(id: string) {
    return this.prisma.task.update({
      where: { id },
      data: { archivedAt: null },
    });
  }

  async addAssignment(
    taskId: string,
    userId: string,
    role: TaskAssignmentRole,
  ) {
    return this.prisma.taskAssignment.create({
      data: { taskId, userId, role },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  async findAssignment(taskId: string, userId: string) {
    return this.prisma.taskAssignment.findUnique({
      where: { taskId_userId: { taskId, userId } },
    });
  }

  async removeAssignment(taskId: string, userId: string) {
    return this.prisma.taskAssignment.delete({
      where: { taskId_userId: { taskId, userId } },
    });
  }
}
