import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Prisma,
  type ProjectMemberRole,
  type ProjectStatus,
} from '../../../generated/prisma/client';

export type ProjectListFilters = {
  customerId?: string;
  status?: Prisma.ProjectWhereInput['status'];
  priority?: Prisma.ProjectWhereInput['priority'];
  archived?: boolean;
  search?: string;
};

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters: ProjectListFilters) {
    const where: Prisma.ProjectWhereInput = {
      organizationId,
      ...(filters.customerId && { customerId: filters.customerId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.priority && { priority: filters.priority }),
      ...(filters.archived === true && { archivedAt: { not: null } }),
      ...(filters.archived === false && { archivedAt: null }),
      ...(filters.search && {
        name: { contains: filters.search, mode: 'insensitive' },
      }),
    };

    return this.prisma.project.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        customer: { select: { id: true, name: true } },
        members: {
          where: { role: 'OWNER' },
          take: 1,
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  }

  async findById(id: string, organizationId: string) {
    return this.prisma.project.findFirst({
      where: { id, organizationId },
      include: {
        customer: { select: { id: true, name: true } },
        members: {
          include: {
            user: { select: { id: true, displayName: true, email: true } },
          },
        },
      },
    });
  }

  async findByProjectNumber(
    projectNumber: string,
    organizationId: string,
  ) {
    return this.prisma.project.findUnique({
      where: {
        organizationId_projectNumber: { organizationId, projectNumber },
      },
    });
  }

  async create(data: Prisma.ProjectUncheckedCreateInput) {
    return this.prisma.project.create({
      data,
      include: {
        customer: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, data: Prisma.ProjectUpdateInput) {
    return this.prisma.project.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, name: true } },
      },
    });
  }

  async archive(id: string) {
    return this.prisma.project.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  async unarchive(id: string) {
    return this.prisma.project.update({
      where: { id },
      data: { archivedAt: null },
    });
  }

  async addMember(
    projectId: string,
    userId: string,
    role: ProjectMemberRole,
  ) {
    return this.prisma.projectMember.create({
      data: { projectId, userId, role },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  async findMember(projectId: string, userId: string) {
    return this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  async updateMemberRole(
    projectId: string,
    userId: string,
    role: ProjectMemberRole,
  ) {
    return this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { role },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  async removeMember(projectId: string, userId: string) {
    return this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  async recordStatusChange(
    projectId: string,
    fromStatus: ProjectStatus | null,
    toStatus: ProjectStatus,
    changedById: string,
  ) {
    return this.prisma.projectStatusHistory.create({
      data: {
        projectId,
        fromStatus: fromStatus ?? undefined,
        toStatus,
        changedById,
      },
    });
  }

  async findStatusHistory(projectId: string) {
    return this.prisma.projectStatusHistory.findMany({
      where: { projectId },
      orderBy: { changedAt: 'desc' },
      include: {
        changedBy: { select: { id: true, displayName: true } },
      },
    });
  }
}
