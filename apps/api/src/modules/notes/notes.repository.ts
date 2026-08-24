import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

export type NoteListFilters = {
  customerId?: string;
  projectId?: string;
  taskId?: string;
  type?: Prisma.NoteWhereInput['type'];
  authorId?: string;
};

@Injectable()
export class NotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: NoteListFilters) {
    const where: Prisma.NoteWhereInput = {
      archivedAt: null,
      ...(filters.customerId && { customerId: filters.customerId }),
      ...(filters.projectId && { projectId: filters.projectId }),
      ...(filters.taskId && { taskId: filters.taskId }),
      ...(filters.type && { type: filters.type }),
      ...(filters.authorId && { authorId: filters.authorId }),
    };

    return this.prisma.note.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, displayName: true } },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.note.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, displayName: true } },
      },
    });
  }

  async create(data: Prisma.NoteUncheckedCreateInput) {
    return this.prisma.note.create({
      data,
      include: {
        author: { select: { id: true, displayName: true } },
      },
    });
  }

  async update(id: string, data: Prisma.NoteUpdateInput) {
    return this.prisma.note.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, displayName: true } },
      },
    });
  }

  async archive(id: string) {
    return this.prisma.note.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }
}
