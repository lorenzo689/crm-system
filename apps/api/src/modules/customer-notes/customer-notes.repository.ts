import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CustomerNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByCustomer(customerId: string) {
    return this.prisma.customerNote.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, displayName: true },
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.customerNote.findUnique({
      where: { id },
    });
  }

  async create(data: Prisma.CustomerNoteUncheckedCreateInput) {
    return this.prisma.customerNote.create({
      data,
      include: {
        author: {
          select: { id: true, displayName: true },
        },
      },
    });
  }

  async archive(id: string) {
    return this.prisma.customerNote.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }
}
