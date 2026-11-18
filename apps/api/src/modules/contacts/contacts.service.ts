import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ContactsRepository } from './contacts.repository';

@Injectable()
export class ContactsService {
  constructor(
    private readonly contactsRepository: ContactsRepository,
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
    return this.contactsRepository.findAllByCustomer(
      customerId,
      organizationId,
    );
  }

  async findOne(id: string, organizationId: string) {
    const contact = await this.contactsRepository.findById(id, organizationId);
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return contact;
  }

  async create(organizationId: string, dto: CreateContactDto) {
    await this.assertCustomerExists(dto.customerId, organizationId);

    return this.contactsRepository.create({
      ...dto,
      organizationId,
    });
  }

  async update(id: string, organizationId: string, dto: UpdateContactDto) {
    await this.findOne(id, organizationId);
    return this.contactsRepository.update(id, dto);
  }

  async archive(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.contactsRepository.archive(id);
  }

  async unarchive(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.contactsRepository.unarchive(id);
  }
}
