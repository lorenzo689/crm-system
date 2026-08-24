import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomersRepository } from './customers.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ActivitiesService } from '../activities/activities.service';

@Injectable()
export class CustomersService {
  constructor(
    private readonly customersRepository: CustomersRepository,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async findAll(organizationId: string) {
    return this.customersRepository.findAll(organizationId);
  }

  async findOne(id: string, organizationId: string) {
    const customer = await this.customersRepository.findById(
      id,
      organizationId,
    );
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateCustomerDto,
  ) {
    const existing = await this.customersRepository.findByCustomerNumber(
      dto.customerNumber,
      organizationId,
    );
    if (existing) {
      throw new ConflictException('Customer number already exists');
    }

    const customer = await this.customersRepository.create({
      ...dto,
      organizationId,
    });

    await this.activitiesService.log({
      customerId: customer.id,
      actorUserId,
      type: 'CUSTOMER_CREATED',
      message: `Kunde "${customer.name}" wurde angelegt`,
    });

    return customer;
  }

  async update(
    id: string,
    organizationId: string,
    actorUserId: string,
    dto: UpdateCustomerDto,
  ) {
    await this.findOne(id, organizationId);

    if (dto.customerNumber) {
      const existing = await this.customersRepository.findByCustomerNumber(
        dto.customerNumber,
        organizationId,
      );
      if (existing && existing.id !== id) {
        throw new ConflictException('Customer number already exists');
      }
    }

    const updated = await this.customersRepository.update(id, dto);

    await this.activitiesService.log({
      customerId: id,
      actorUserId,
      type: 'CUSTOMER_UPDATED',
      message: `Kunde "${updated.name}" wurde bearbeitet`,
    });

    return updated;
  }

  async archive(id: string, organizationId: string, actorUserId: string) {
    const customer = await this.findOne(id, organizationId);
    const archived = await this.customersRepository.archive(id);

    await this.activitiesService.log({
      customerId: id,
      actorUserId,
      type: 'CUSTOMER_ARCHIVED',
      message: `Kunde "${customer.name}" wurde archiviert`,
    });

    return archived;
  }

  async unarchive(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.customersRepository.unarchive(id);
  }
}
