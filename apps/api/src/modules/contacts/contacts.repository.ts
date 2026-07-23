import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByCustomer(customerId: string, organizationId: string) {
    return this.prisma.contact.findMany({
      where: { customerId, organizationId },
      orderBy: { fullName: 'asc' },
    });
  }

  async findById(id: string, organizationId: string) {
    return this.prisma.contact.findFirst({
      where: { id, organizationId },
    });
  }

  async create(data: Prisma.ContactUncheckedCreateInput) {
    return this.prisma.contact.create({ data });
  }

  async update(id: string, data: Prisma.ContactUpdateInput) {
    return this.prisma.contact.update({
      where: { id },
      data,
    });
  }

  async archive(id: string) {
    return this.prisma.contact.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  async unarchive(id: string) {
    return this.prisma.contact.update({
      where: { id },
      data: { archivedAt: null },
    });
  }
}
