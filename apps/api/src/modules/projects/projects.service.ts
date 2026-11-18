import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ProjectMemberRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessService, type Tx } from '../access/access.service';
import type { AuthUser } from '../auth/strategies/jwt.strategies';
import { ActivitiesService } from '../activities/activities.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  type ProjectListFilters,
  ProjectsRepository,
} from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
    private readonly access: AccessService,
  ) {}

  private async assertCustomerExists(
    customerId: string,
    organizationId: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
  }

  async findAll(organizationId: string, filters: ProjectListFilters) {
    return this.projectsRepository.findAll(organizationId, filters);
  }

  async findOne(id: string, organizationId: string) {
    const project = await this.projectsRepository.findById(id, organizationId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateProjectDto,
  ) {
    await this.assertCustomerExists(dto.customerId, organizationId);

    const existing = await this.projectsRepository.findByProjectNumber(
      dto.projectNumber,
      organizationId,
    );
    if (existing) {
      throw new ConflictException('Project number already exists');
    }

    const project = await this.projectsRepository.create({
      ...dto,
      organizationId,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    });

    await this.activitiesService.log({
      projectId: project.id,
      actorUserId,
      type: 'PROJECT_CREATED',
      message: `Projekt "${project.name}" wurde angelegt`,
    });

    return project;
  }

  async update(
    id: string,
    organizationId: string,
    actorUserId: string,
    dto: UpdateProjectDto,
  ) {
    const existingProject = await this.findOne(id, organizationId);
    await this.access.assertProjectWritable(id, actorUserId);

    if (
      dto.projectNumber &&
      dto.projectNumber !== existingProject.projectNumber
    ) {
      const conflict = await this.projectsRepository.findByProjectNumber(
        dto.projectNumber,
        organizationId,
      );
      if (conflict && conflict.id !== id) {
        throw new ConflictException('Project number already exists');
      }
    }

    const updatedProject = await this.projectsRepository.update(id, {
      ...dto,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    });

    const statusChanged = dto.status && dto.status !== existingProject.status;

    if (statusChanged) {
      await this.projectsRepository.recordStatusChange(
        id,
        existingProject.status,
        dto.status!,
        actorUserId,
      );

      await this.activitiesService.log({
        projectId: id,
        actorUserId,
        type: 'PROJECT_STATUS_CHANGED',
        message: `Status von "${updatedProject.name}" wurde auf ${dto.status} geändert`,
      });
    } else {
      await this.activitiesService.log({
        projectId: id,
        actorUserId,
        type: 'PROJECT_UPDATED',
        message: `Projekt "${updatedProject.name}" wurde bearbeitet`,
      });
    }

    return updatedProject;
  }

  async archive(id: string, organizationId: string, actorUserId: string) {
    const project = await this.findOne(id, organizationId);
    await this.access.assertProjectWritable(id, actorUserId);
    const archived = await this.projectsRepository.archive(id);

    await this.activitiesService.log({
      projectId: id,
      actorUserId,
      type: 'PROJECT_ARCHIVED',
      message: `Projekt "${project.name}" wurde archiviert`,
    });

    return archived;
  }

  async unarchive(id: string, organizationId: string, actorUserId: string) {
    await this.findOne(id, organizationId);
    await this.access.assertProjectWritable(id, actorUserId);
    return this.projectsRepository.unarchive(id);
  }

  async getStatusHistory(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.projectsRepository.findStatusHistory(id);
  }

  /**
   * Membership management runs in an admin transaction (shared organization
   * lock): the acting user is re-validated under the lock, so an admin whose
   * rights were withdrawn meanwhile cannot still change memberships.
   */
  private asAdmin<T>(
    actor: AuthUser,
    action: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    return this.access.runAsAdmin(
      {
        userId: actor.sub,
        organizationId: actor.organizationId,
        tokenVersion: actor.tokenVersion,
      },
      (tx) => action(tx),
    );
  }

  private async findProjectIn(tx: Tx, id: string, organizationId: string) {
    const project = await tx.project.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  async addMember(
    actor: AuthUser,
    projectId: string,
    userId: string,
    role: ProjectMemberRole,
  ) {
    return this.asAdmin(actor, async (tx) => {
      await this.findProjectIn(tx, projectId, actor.organizationId);
      await this.access.assertActiveOrganizationMember(
        actor.organizationId,
        userId,
        tx,
      );
      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (existing) {
        throw new ConflictException('User is already a member of this project');
      }
      return tx.projectMember.create({
        data: { projectId, userId, role },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
      });
    });
  }

  async updateMemberRole(
    actor: AuthUser,
    projectId: string,
    userId: string,
    role: ProjectMemberRole,
  ) {
    return this.asAdmin(actor, async (tx) => {
      await this.findProjectIn(tx, projectId, actor.organizationId);
      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (!existing) {
        throw new NotFoundException('Member not found');
      }
      return tx.projectMember.update({
        where: { projectId_userId: { projectId, userId } },
        data: { role },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
      });
    });
  }

  async removeMember(actor: AuthUser, projectId: string, userId: string) {
    return this.asAdmin(actor, async (tx) => {
      await this.findProjectIn(tx, projectId, actor.organizationId);
      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (!existing) {
        throw new NotFoundException('Member not found');
      }
      return tx.projectMember.delete({
        where: { projectId_userId: { projectId, userId } },
      });
    });
  }
}
