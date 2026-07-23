import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ProjectMemberRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
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

  async create(organizationId: string, dto: CreateProjectDto) {
    await this.assertCustomerExists(dto.customerId, organizationId);

    const existing = await this.projectsRepository.findByProjectNumber(
      dto.projectNumber,
      organizationId,
    );
    if (existing) {
      throw new ConflictException('Project number already exists');
    }

    return this.projectsRepository.create({
      ...dto,
      organizationId,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    });
  }

  async update(
    id: string,
    organizationId: string,
    changedById: string,
    dto: UpdateProjectDto,
  ) {
    const existingProject = await this.findOne(id, organizationId);

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

    if (dto.status && dto.status !== existingProject.status) {
      await this.projectsRepository.recordStatusChange(
        id,
        existingProject.status,
        dto.status,
        changedById,
      );
    }

    return updatedProject;
  }

  async archive(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.projectsRepository.archive(id);
  }

  async unarchive(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.projectsRepository.unarchive(id);
  }

  async getStatusHistory(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.projectsRepository.findStatusHistory(id);
  }

  async addMember(
    projectId: string,
    organizationId: string,
    userId: string,
    role: ProjectMemberRole,
  ) {
    await this.findOne(projectId, organizationId);

    const existing = await this.projectsRepository.findMember(
      projectId,
      userId,
    );
    if (existing) {
      throw new ConflictException('User is already a member of this project');
    }

    return this.projectsRepository.addMember(projectId, userId, role);
  }

  async updateMemberRole(
    projectId: string,
    organizationId: string,
    userId: string,
    role: ProjectMemberRole,
  ) {
    await this.findOne(projectId, organizationId);

    const existing = await this.projectsRepository.findMember(
      projectId,
      userId,
    );
    if (!existing) {
      throw new NotFoundException('Member not found');
    }

    return this.projectsRepository.updateMemberRole(projectId, userId, role);
  }

  async removeMember(
    projectId: string,
    organizationId: string,
    userId: string,
  ) {
    await this.findOne(projectId, organizationId);

    const existing = await this.projectsRepository.findMember(
      projectId,
      userId,
    );
    if (!existing) {
      throw new NotFoundException('Member not found');
    }

    return this.projectsRepository.removeMember(projectId, userId);
  }
}
