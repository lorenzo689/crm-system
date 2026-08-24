import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type TaskAssignmentRole,
  TaskStatus,
} from '../../../generated/prisma/client';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskListFilters, TasksRepository } from './tasks.repository';

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly prisma: PrismaService,
  ) {}

  private async assertProjectExists(
    projectId: string,
    organizationId: string,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  async findAll(organizationId: string, filters: TaskListFilters) {
    return this.tasksRepository.findAll(organizationId, filters);
  }

  async findOne(id: string, organizationId: string) {
    const task = await this.tasksRepository.findById(id, organizationId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async create(
    organizationId: string,
    createdByUserId: string,
    dto: CreateTaskDto,
  ) {
    await this.assertProjectExists(dto.projectId, organizationId);

    return this.tasksRepository.create({
      ...dto,
      organizationId,
      createdByUserId,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      completedAt:
        dto.status === TaskStatus.COMPLETED ? new Date() : undefined,
    });
  }

  async update(id: string, organizationId: string, dto: UpdateTaskDto) {
    const existingTask = await this.findOne(id, organizationId);

    let completedAt: Date | null | undefined = undefined;
    if (dto.status && dto.status !== existingTask.status) {
      if (dto.status === TaskStatus.COMPLETED) {
        completedAt = new Date();
      } else if (existingTask.status === TaskStatus.COMPLETED) {
        completedAt = null;
      }
    }

    return this.tasksRepository.update(id, {
      ...dto,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      ...(completedAt !== undefined && { completedAt }),
    });
  }

  async complete(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.tasksRepository.update(id, {
      status: TaskStatus.COMPLETED,
      completedAt: new Date(),
    });
  }

  async cancel(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.tasksRepository.update(id, {
      status: TaskStatus.CANCELLED,
      completedAt: null,
    });
  }

  async archive(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.tasksRepository.archive(id);
  }

  async unarchive(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.tasksRepository.unarchive(id);
  }

  async assignUser(
    taskId: string,
    organizationId: string,
    userId: string,
    role: TaskAssignmentRole,
  ) {
    await this.findOne(taskId, organizationId);

    const existing = await this.tasksRepository.findAssignment(taskId, userId);
    if (existing) {
      throw new ConflictException('User is already assigned to this task');
    }

    return this.tasksRepository.addAssignment(taskId, userId, role);
  }

  async unassignUser(
    taskId: string,
    organizationId: string,
    userId: string,
  ) {
    await this.findOne(taskId, organizationId);

    const existing = await this.tasksRepository.findAssignment(taskId, userId);
    if (!existing) {
      throw new NotFoundException('Assignment not found');
    }

    return this.tasksRepository.removeAssignment(taskId, userId);
  }
}
