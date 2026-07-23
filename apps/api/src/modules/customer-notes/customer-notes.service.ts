import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCustomerNoteDto } from './dto/create-customer-note.dto';
import { CustomerNotesRepository } from './customer-notes.repository';

@Injectable()
export class CustomerNotesService {
  constructor(
    private readonly customerNotesRepository: CustomerNotesRepository,
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

  async findAllByCustomer(customerId: string, organizationId: string) {
    await this.assertCustomerExists(customerId, organizationId);
    return this.customerNotesRepository.findAllByCustomer(customerId);
  }

  async create(
    authorId: string,
    organizationId: string,
    dto: CreateCustomerNoteDto,
  ) {
    await this.assertCustomerExists(dto.customerId, organizationId);

    return this.customerNotesRepository.create({
      customerId: dto.customerId,
      content: dto.content,
      authorId,
    });
  }

  async archive(id: string, organizationId: string) {
    const note = await this.customerNotesRepository.findById(id);
    if (!note) {
      throw new NotFoundException('Note not found');
    }

    await this.assertCustomerExists(note.customerId, organizationId);
    return this.customerNotesRepository.archive(id);
  }
}
