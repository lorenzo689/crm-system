import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.customer.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string, organizationId: string) {
    return this.prisma.customer.findFirst({
      where: { id, organizationId },
    });
  }

  async findByCustomerNumber(customerNumber: string, organizationId: string) {
    return this.prisma.customer.findUnique({
      where: {
        organizationId_customerNumber: {
          organizationId,
          customerNumber,
        },
      },
    });
  }

  async create(data: Prisma.CustomerUncheckedCreateInput) {
    return this.prisma.customer.create({ data });
  }

  async update(id: string, data: Prisma.CustomerUpdateInput) {
    return this.prisma.customer.update({
      where: { id },
      data,
    });
  }

  async archive(id: string) {
    return this.prisma.customer.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }
}
