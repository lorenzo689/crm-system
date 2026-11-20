import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { ActivitiesService } from '../activities/activities.service';
import {
  type TaskAssignmentRole,
  TaskStatus,
} from '../../../generated/prisma/client';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskListFilters, TasksRepository } from './tasks.repository';

/** undefined keeps the value, null clears it, a string sets it. */
function toDate(value: string | null | undefined) {
  return value ? new Date(value) : value;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
    private readonly access: AccessService,
  ) {}

  private async assertProjectExists(projectId: string, organizationId: string) {
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
    actorUserId: string,
    dto: CreateTaskDto,
  ) {
    if (dto.projectId) {
      await this.assertProjectExists(dto.projectId, organizationId);
      await this.access.assertProjectWritable(dto.projectId, actorUserId);
    }

    const task = await this.tasksRepository.create({
      ...dto,
      organizationId,
      createdByUserId: actorUserId,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      completedAt: dto.status === TaskStatus.COMPLETED ? new Date() : undefined,
    });

    await this.activitiesService.log({
      taskId: task.id,
      actorUserId,
      type: 'TASK_CREATED',
      message: `Aufgabe "${task.title}" wurde angelegt`,
    });

    if (dto.status === TaskStatus.COMPLETED) {
      await this.activitiesService.log({
        taskId: task.id,
        actorUserId,
        type: 'TASK_COMPLETED',
        message: `Aufgabe "${task.title}" wurde abgeschlossen`,
      });
    }

    return task;
  }

  async update(
    id: string,
    organizationId: string,
    actorUserId: string,
    dto: UpdateTaskDto,
  ) {
    const existingTask = await this.findOne(id, organizationId);
    await this.access.assertProjectWritable(
      existingTask.projectId,
      actorUserId,
    );

    const { projectId, ...taskFields } = dto;
    if (projectId) {
      await this.assertProjectExists(projectId, organizationId);
      await this.access.assertProjectWritable(projectId, actorUserId);
    }

    let completedAt: Date | null | undefined = undefined;
    const becameCompleted =
      dto.status === TaskStatus.COMPLETED &&
      existingTask.status !== TaskStatus.COMPLETED;

    if (dto.status && dto.status !== existingTask.status) {
      if (dto.status === TaskStatus.COMPLETED) {
        completedAt = new Date();
      } else if (existingTask.status === TaskStatus.COMPLETED) {
        completedAt = null;
      }
    }

    const updatedTask = await this.tasksRepository.update(id, {
      ...taskFields,
      ...(projectId !== undefined && {
        project: projectId
          ? { connect: { id: projectId } }
          : { disconnect: true },
      }),
      startAt: toDate(dto.startAt),
      dueAt: toDate(dto.dueAt),
      ...(completedAt !== undefined && { completedAt }),
    });

    if (becameCompleted) {
      await this.activitiesService.log({
        taskId: id,
        actorUserId,
        type: 'TASK_COMPLETED',
        message: `Aufgabe "${updatedTask.title}" wurde abgeschlossen`,
      });
    }

    return updatedTask;
  }

  async complete(id: string, organizationId: string, actorUserId: string) {
    const task = await this.findOne(id, organizationId);
    await this.access.assertProjectWritable(task.projectId, actorUserId);
    const updated = await this.tasksRepository.update(id, {
      status: TaskStatus.COMPLETED,
      completedAt: new Date(),
    });

    await this.activitiesService.log({
      taskId: id,
      actorUserId,
      type: 'TASK_COMPLETED',
      message: `Aufgabe "${task.title}" wurde abgeschlossen`,
    });

    return updated;
  }

  async cancel(id: string, organizationId: string, actorUserId: string) {
    const task = await this.findOne(id, organizationId);
    await this.access.assertProjectWritable(task.projectId, actorUserId);
    const updated = await this.tasksRepository.update(id, {
      status: TaskStatus.CANCELLED,
      completedAt: null,
    });

    await this.activitiesService.log({
      taskId: id,
      actorUserId,
      type: 'TASK_CANCELLED',
      message: `Aufgabe "${task.title}" wurde storniert`,
    });

    return updated;
  }

  async archive(id: string, organizationId: string, actorUserId: string) {
    const task = await this.findOne(id, organizationId);
    await this.access.assertProjectWritable(task.projectId, actorUserId);
    const archived = await this.tasksRepository.archive(id);

    await this.activitiesService.log({
      taskId: id,
      actorUserId,
      type: 'TASK_ARCHIVED',
      message: `Aufgabe "${task.title}" wurde archiviert`,
    });

    return archived;
  }

  async unarchive(id: string, organizationId: string, actorUserId: string) {
    const task = await this.findOne(id, organizationId);
    await this.access.assertProjectWritable(task.projectId, actorUserId);
    return this.tasksRepository.unarchive(id);
  }

  async assignUser(
    taskId: string,
    organizationId: string,
    actorUserId: string,
    userId: string,
    role: TaskAssignmentRole,
  ) {
    const task = await this.findOne(taskId, organizationId);
    await this.access.assertProjectWritable(task.projectId, actorUserId);
    await this.access.assertActiveOrganizationMember(organizationId, userId);

    const existing = await this.tasksRepository.findAssignment(taskId, userId);
    if (existing) {
      throw new ConflictException('User is already assigned to this task');
    }

    const assignment = await this.tasksRepository.addAssignment(
      taskId,
      userId,
      role,
    );

    await this.activitiesService.log({
      taskId,
      actorUserId,
      type: 'TASK_ASSIGNED',
      message: `${assignment.user.displayName} wurde als ${
        role === 'RESPONSIBLE' ? 'Verantwortlicher' : 'Mitwirkender'
      } zugewiesen`,
    });

    return assignment;
  }

  async unassignUser(
    taskId: string,
    organizationId: string,
    userId: string,
    actorUserId: string,
  ) {
    const task = await this.findOne(taskId, organizationId);
    await this.access.assertProjectWritable(task.projectId, actorUserId);

    const existing = await this.tasksRepository.findAssignment(taskId, userId);
    if (!existing) {
      throw new NotFoundException('Assignment not found');
    }

    return this.tasksRepository.removeAssignment(taskId, userId);
  }
}
