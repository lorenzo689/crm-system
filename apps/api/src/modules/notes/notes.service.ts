import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { ActivitiesService } from '../activities/activities.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NoteListFilters, NotesRepository } from './notes.repository';

@Injectable()
export class NotesService {
  constructor(
    private readonly notesRepository: NotesRepository,
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
    private readonly access: AccessService,
  ) {}

  private assertHasContext(dto: CreateNoteDto) {
    const contextCount = [dto.customerId, dto.projectId, dto.taskId].filter(
      Boolean,
    ).length;

    if (contextCount === 0) {
      throw new BadRequestException(
        'Note must be linked to a customer, project, or task',
      );
    }
    if (contextCount > 1) {
      throw new BadRequestException(
        'Note must be linked to exactly one of customer, project, or task',
      );
    }
  }

  private async assertContextExists(
    organizationId: string,
    dto: Pick<CreateNoteDto, 'customerId' | 'projectId' | 'taskId'>,
  ) {
    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, organizationId },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
    }

    if (dto.taskId) {
      const task = await this.prisma.task.findFirst({
        where: { id: dto.taskId, organizationId },
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }
    }
  }

  async findAll(organizationId: string, filters: NoteListFilters) {
    if (!filters.customerId && !filters.projectId && !filters.taskId) {
      throw new BadRequestException(
        'At least one of customerId, projectId, or taskId must be provided',
      );
    }
    await this.assertContextExists(organizationId, filters);
    return this.notesRepository.findAll(filters);
  }

  async findOne(id: string, organizationId: string) {
    const note = await this.notesRepository.findById(id);
    if (!note) {
      throw new NotFoundException('Note not found');
    }
    await this.assertContextExists(organizationId, {
      customerId: note.customerId ?? undefined,
      projectId: note.projectId ?? undefined,
      taskId: note.taskId ?? undefined,
    });
    return note;
  }

  async create(organizationId: string, authorId: string, dto: CreateNoteDto) {
    this.assertHasContext(dto);
    await this.assertContextExists(organizationId, dto);
    await this.access.assertProjectWritable(dto.projectId, authorId);
    await this.access.assertTaskWritable(dto.taskId, authorId);

    const note = await this.notesRepository.create({
      ...dto,
      authorId,
    });

    await this.activitiesService.log({
      customerId: dto.customerId,
      projectId: dto.projectId,
      taskId: dto.taskId,
      actorUserId: authorId,
      type: 'NOTE_CREATED',
      message: `Notiz hinzugefügt${note.title ? `: "${note.title}"` : ''}`,
    });

    return note;
  }

  private async assertWritable(
    note: { projectId: string | null; taskId: string | null },
    userId: string,
  ) {
    await this.access.assertProjectWritable(note.projectId, userId);
    await this.access.assertTaskWritable(note.taskId, userId);
  }

  async update(
    id: string,
    organizationId: string,
    actorUserId: string,
    dto: UpdateNoteDto,
  ) {
    const note = await this.findOne(id, organizationId);
    await this.assertWritable(note, actorUserId);
    return this.notesRepository.update(id, dto);
  }

  async archive(id: string, organizationId: string, actorUserId: string) {
    const note = await this.findOne(id, organizationId);
    await this.assertWritable(note, actorUserId);
    return this.notesRepository.archive(id);
  }
}
